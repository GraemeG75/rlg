import type { Action, Entity, Item, Mode, Point } from "./core/types";
import { Rng } from "./core/rng";
import { add, manhattan } from "./core/util";
import { Overworld, dungeonBaseIdFromWorldPos, dungeonLevelId, dungeonSeedFromWorldPos } from "./maps/overworld";
import type { Dungeon } from "./maps/dungeon";
import { generateDungeon, getDungeonTile, randomFloorPoint } from "./maps/dungeon";
import { computeDungeonFov, decayVisibilityToSeen } from "./systems/fov";
import { canEnterDungeonTile, canEnterOverworldTile, isBlockedByEntity } from "./systems/rules";
import { nextMonsterStep } from "./systems/ai";
import { renderAscii } from "./render/ascii";
import { CanvasRenderer } from "./render/canvas";
import { MessageLog } from "./ui/log";
import { loadFromLocalStorage, saveToLocalStorage, type SaveDataV1 } from "./core/save";

type RendererMode = "ascii" | "canvas";

type DungeonStackFrame = {
  baseId: string;
  depth: number;
  entranceWorldPos: Point;
};

type GameState = {
  worldSeed: number;
  rng: Rng;

  mode: Mode;

  overworld: Overworld;

  dungeons: Map<string, Dungeon>;
  dungeonStack: DungeonStackFrame[];

  player: Entity;
  entities: Entity[];
  items: Item[];

  rendererMode: RendererMode;
  useFov: boolean;

  log: MessageLog;
};

const VIEW_W: number = 61;
const VIEW_H: number = 33;

const asciiEl: HTMLElement = document.getElementById("ascii")!;
const canvasWrap: HTMLElement = document.getElementById("canvasWrap")!;
const modePill: HTMLElement = document.getElementById("modePill")!;
const renderPill: HTMLElement = document.getElementById("renderPill")!;
const statsEl: HTMLElement = document.getElementById("stats")!;
const invEl: HTMLElement = document.getElementById("inv")!;
const logEl: HTMLElement = document.getElementById("log")!;

const btnAscii: HTMLButtonElement = document.getElementById("btnAscii") as HTMLButtonElement;
const btnCanvas: HTMLButtonElement = document.getElementById("btnCanvas") as HTMLButtonElement;
const btnNewSeed: HTMLButtonElement = document.getElementById("btnNewSeed") as HTMLButtonElement;
const btnSave: HTMLButtonElement = document.getElementById("btnSave") as HTMLButtonElement;
const btnLoad: HTMLButtonElement = document.getElementById("btnLoad") as HTMLButtonElement;

const canvas: HTMLCanvasElement = document.getElementById("gameCanvas") as HTMLCanvasElement;
const canvasRenderer: CanvasRenderer = new CanvasRenderer(canvas);

function newGame(worldSeed: number): GameState {
  const rng: Rng = new Rng(worldSeed);
  const overworld: Overworld = new Overworld(worldSeed);

  const player: Entity = {
    id: "player",
    kind: "player",
    name: "You",
    pos: findStartPosition(overworld, rng),
    mapRef: { kind: "overworld" },
    hp: 20,
    maxHp: 20,
    baseAttack: 2,
    baseDefense: 0,
    inventory: [],
    equipment: {}
  };

  const state: GameState = {
    worldSeed,
    rng,
    mode: "overworld",
    overworld,
    dungeons: new Map<string, Dungeon>(),
    dungeonStack: [],
    player,
    entities: [player],
    items: [],
    rendererMode: "ascii",
    useFov: true,
    log: new MessageLog(120)
  };

  state.log.push("Welcome. Find a dungeon entrance (D). Stand on it and press Enter to enter.");
  state.log.push("Pick up items with G. Use with U. Equip with E.");
  state.log.push("Save with P. Load with O.");
  return state;
}

function findStartPosition(overworld: Overworld, rng: Rng): Point {
  for (let i: number = 0; i < 4000; i++) {
    const x: number = rng.nextInt(-200, 200);
    const y: number = rng.nextInt(-200, 200);
    if (canEnterOverworldTile(overworld, { x, y })) return { x, y };
  }
  return { x: 0, y: 0 };
}

let state: GameState = newGame(Date.now() & 0xffffffff);

function getCurrentDungeon(s: GameState): Dungeon | undefined {
  if (s.player.mapRef.kind !== "dungeon") return undefined;
  return s.dungeons.get(s.player.mapRef.dungeonId);
}

function ensureDungeonLevel(s: GameState, baseId: string, depth: number, entranceWorldPos: Point): Dungeon {
  const levelId: string = dungeonLevelId(baseId, depth);
  const existing: Dungeon | undefined = s.dungeons.get(levelId);
  if (existing) return existing;

  const baseSeed: number = dungeonSeedFromWorldPos(s.worldSeed, entranceWorldPos.x, entranceWorldPos.y);
  const levelSeed: number = (baseSeed ^ (depth * 0x9e3779b9)) | 0;

  const dungeon: Dungeon = generateDungeon(levelId, baseId, depth, levelSeed, 80, 50);

  spawnMonstersInDungeon(s, dungeon, levelSeed);
  spawnLootInDungeon(s, dungeon, levelSeed);

  s.dungeons.set(levelId, dungeon);
  return dungeon;
}

function spawnMonstersInDungeon(s: GameState, dungeon: Dungeon, seed: number): void {
  const monsterCount: number = 6 + Math.min(10, dungeon.depth * 2);
  for (let i: number = 0; i < monsterCount; i++) {
    const p: Point = randomFloorPoint(dungeon, seed + 1000 + i * 17);
    const monster: Entity = {
      id: `m_${dungeon.id}_${i}`,
      kind: "monster",
      name: "Goblin",
      pos: p,
      mapRef: { kind: "dungeon", dungeonId: dungeon.id },
      hp: 5 + dungeon.depth * 2,
      maxHp: 5 + dungeon.depth * 2,
      baseAttack: 1 + dungeon.depth,
      baseDefense: 0,
      inventory: [],
      equipment: {}
    };
    s.entities.push(monster);
  }
}

function spawnLootInDungeon(s: GameState, dungeon: Dungeon, seed: number): void {
  const rng: Rng = new Rng(seed ^ 0x51f15);
  const lootCount: number = 6;
  for (let i: number = 0; i < lootCount; i++) {
    const p: Point = randomFloorPoint(dungeon, seed + 5000 + i * 31);
    const roll: number = rng.nextInt(0, 100);

    let item: Item;
    if (roll < 55) {
      item = {
        id: `it_${dungeon.id}_${i}`,
        kind: "potion",
        name: "Healing Potion",
        healAmount: 8 + dungeon.depth * 2,
        mapRef: { kind: "dungeon", dungeonId: dungeon.id },
        pos: p
      };
    } else if (roll < 85) {
      item = {
        id: `it_${dungeon.id}_${i}`,
        kind: "weapon",
        name: "Rusty Sword",
        attackBonus: 2 + dungeon.depth,
        mapRef: { kind: "dungeon", dungeonId: dungeon.id },
        pos: p
      };
    } else {
      item = {
        id: `it_${dungeon.id}_${i}`,
        kind: "armor",
        name: "Leather Armor",
        defenseBonus: 1 + Math.floor(dungeon.depth / 2),
        mapRef: { kind: "dungeon", dungeonId: dungeon.id },
        pos: p
      };
    }

    s.items.push(item);
  }
}

function removeDeadEntities(s: GameState): void {
  s.entities = s.entities.filter((e: Entity) => e.hp > 0 || e.kind === "player");
}

function removePickedUpItems(s: GameState): void {
  s.items = s.items.filter((it: Item) => !!it.mapRef && !!it.pos || !it.mapRef);
}

function handleAction(action: Action): void {
  if (action.kind === "toggleRenderer") {
    state.rendererMode = state.rendererMode === "ascii" ? "canvas" : "ascii";
    syncRendererUi();
    render();
    return;
  }

  if (action.kind === "toggleFov") {
    state.useFov = !state.useFov;
    state.log.push(state.useFov ? "FOV enabled." : "FOV disabled.");
    render();
    return;
  }

  if (action.kind === "save") {
    doSave();
    render();
    return;
  }

  if (action.kind === "load") {
    doLoad();
    syncRendererUi();
    render();
    return;
  }

  if (action.kind === "help") {
    state.log.push("Keys: WASD/Arrows move • Enter use/enter/exit • R renderer • F FOV • G pick up • U use • E equip • P save • O load.");
    render();
    return;
  }

  // Player turn
  const acted: boolean = playerTurn(action);
  if (!acted) {
    render();
    return;
  }

  // Monsters turn
  monstersTurn();

  removeDeadEntities(state);
  removePickedUpItems(state);

  if (state.player.hp <= 0) {
    state.log.push("You died. Press New Seed to restart.");
  }

  render();
}

function playerTurn(action: Action): boolean {
  if (state.player.hp <= 0) return false;

  if (action.kind === "wait") {
    state.log.push("You wait.");
    return true;
  }

  if (action.kind === "pickup") {
    return pickupAtPlayer();
  }

  if (action.kind === "useItem") {
    return useFirstPotion();
  }

  if (action.kind === "equipItem") {
    return equipFirstGear();
  }

  if (action.kind === "use") {
    if (state.mode === "overworld") {
      const t = state.overworld.getTile(state.player.pos.x, state.player.pos.y);
      if (t === "dungeon") {
        enterDungeonAt(state.player.pos);
        return true;
      }
      if (t === "town") {
        state.log.push("You visit the town. (Shops & quests later.)");
        return true;
      }
      state.log.push("Nothing to use here.");
      return false;
    } else {
      const dungeon: Dungeon | undefined = getCurrentDungeon(state);
      if (!dungeon) return false;

      const tile = getDungeonTile(dungeon, state.player.pos.x, state.player.pos.y);
      if (tile === "stairsUp") {
        goUpLevelOrExit();
        return true;
      }
      if (tile === "stairsDown") {
        goDownLevel();
        return true;
      }

      state.log.push("Nothing to use here.");
      return false;
    }
  }

  if (action.kind === "move") {
    return tryMovePlayer(action.dx, action.dy);
  }

  return false;
}

function pickupAtPlayer(): boolean {
  for (const it of state.items) {
    if (!it.mapRef || !it.pos) continue;

    if (state.mode === "overworld") {
      if (it.mapRef.kind !== "overworld") continue;
    } else {
      const dungeon: Dungeon | undefined = getCurrentDungeon(state);
      if (!dungeon) continue;
      if (it.mapRef.kind !== "dungeon") continue;
      if (it.mapRef.dungeonId !== dungeon.id) continue;
    }

    if (it.pos.x === state.player.pos.x && it.pos.y === state.player.pos.y) {
      // pick up
      it.mapRef = undefined;
      it.pos = undefined;
      state.player.inventory.push(it.id);
      state.log.push(`Picked up: ${it.name}.`);
      return true;
    }
  }

  state.log.push("Nothing to pick up.");
  return false;
}

function useFirstPotion(): boolean {
  const potionId: string | undefined = state.player.inventory.find((id: string) => {
    const it: Item | undefined = state.items.find((x) => x.id === id);
    return it?.kind === "potion";
  });

  if (!potionId) {
    state.log.push("No potions to use.");
    return false;
  }

  const potion: Item | undefined = state.items.find((x) => x.id === potionId);
  if (!potion || potion.kind !== "potion") return false;

  const heal: number = potion.healAmount ?? 6;
  const before: number = state.player.hp;
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + heal);

  // remove potion from inventory + items list
  state.player.inventory = state.player.inventory.filter((x: string) => x !== potionId);
  state.items = state.items.filter((x: Item) => x.id !== potionId);

  state.log.push(`You drink a potion. (+${state.player.hp - before} HP)`);
  return true;
}

function equipFirstGear(): boolean {
  // prefer weapon if none equipped; otherwise armor
  const invItems: Item[] = state.player.inventory
    .map((id: string) => state.items.find((x) => x.id === id))
    .filter((x: Item | undefined): x is Item => !!x);

  const weapon: Item | undefined = invItems.find((it) => it.kind === "weapon");
  const armor: Item | undefined = invItems.find((it) => it.kind === "armor");

  if (weapon && !state.player.equipment.weaponItemId) {
    state.player.equipment.weaponItemId = weapon.id;
    state.log.push(`Equipped weapon: ${weapon.name}.`);
    return true;
  }

  if (armor && !state.player.equipment.armorItemId) {
    state.player.equipment.armorItemId = armor.id;
    state.log.push(`Equipped armor: ${armor.name}.`);
    return true;
  }

  state.log.push("Nothing to equip (or already equipped).");
  return false;
}

function tryMovePlayer(dx: number, dy: number): boolean {
  const target: Point = add(state.player.pos, { x: dx, y: dy });

  if (state.mode === "dungeon") {
    const dungeon: Dungeon | undefined = getCurrentDungeon(state);
    if (!dungeon) return false;

    const blocker: Entity | undefined = isBlockedByEntity(state.entities, "dungeon", dungeon.id, target);
    if (blocker && blocker.kind === "monster") {
      attack(state.player, blocker);
      return true;
    }

    if (!canEnterDungeonTile(dungeon, target)) return false;

    state.player.pos = target;
    return true;
  }

  if (!canEnterOverworldTile(state.overworld, target)) return false;

  state.player.pos = target;

  const t = state.overworld.getTile(target.x, target.y);
  if (t === "dungeon") {
    state.log.push("Dungeon entrance found. Press Enter to enter.");
  } else if (t === "town") {
    state.log.push("Town found. Press Enter to visit.");
  }

  return true;
}

function getEquippedAttackBonus(entity: Entity): number {
  const weaponId: string | undefined = entity.equipment.weaponItemId;
  if (!weaponId) return 0;
  const it: Item | undefined = state.items.find((x) => x.id === weaponId);
  return it?.attackBonus ?? 0;
}

function getEquippedDefenseBonus(entity: Entity): number {
  const armorId: string | undefined = entity.equipment.armorItemId;
  if (!armorId) return 0;
  const it: Item | undefined = state.items.find((x) => x.id === armorId);
  return it?.defenseBonus ?? 0;
}

function attack(attacker: Entity, defender: Entity): void {
  const atk: number = attacker.baseAttack + getEquippedAttackBonus(attacker);
  const def: number = defender.baseDefense + getEquippedDefenseBonus(defender);

  const roll: number = state.rng.nextInt(0, 4);
  const raw: number = atk + roll;
  const dmg: number = Math.max(1, raw - def);

  defender.hp -= dmg;
  state.log.push(`${attacker.name} hits ${defender.name} for ${dmg}. (${Math.max(0, defender.hp)}/${defender.maxHp})`);
  if (defender.hp <= 0) {
    state.log.push(`${defender.name} dies.`);
  }
}

function monstersTurn(): void {
  if (state.mode !== "dungeon") return;

  const dungeon: Dungeon | undefined = getCurrentDungeon(state);
  if (!dungeon) return;

  let visible: Set<string> | undefined;

  if (state.useFov) {
    decayVisibilityToSeen(dungeon);
    visible = computeDungeonFov(dungeon, state.player.pos, 10);
  }

  for (const e of state.entities) {
    if (e.kind !== "monster") continue;
    if (e.mapRef.kind !== "dungeon") continue;
    if (e.mapRef.dungeonId !== dungeon.id) continue;
    if (e.hp <= 0) continue;

    const dist: number = manhattan(e.pos, state.player.pos);
    if (dist <= 1) {
      attack(e, state.player);
      continue;
    }

    const chaseOk: boolean = !state.useFov || (visible ? visible.has(`${e.pos.x},${e.pos.y}`) : true);
    if (dist <= 10 && chaseOk) {
      const next: Point | undefined = nextMonsterStep(e, state.player, dungeon, state.entities);
      if (!next) continue;

      const blocked: Entity | undefined = isBlockedByEntity(state.entities, "dungeon", dungeon.id, next);
      if (blocked) continue;

      if (canEnterDungeonTile(dungeon, next)) {
        e.pos = next;
      }
    }
  }
}

function enterDungeonAt(worldPos: Point): void {
  const baseId: string = dungeonBaseIdFromWorldPos(state.worldSeed, worldPos.x, worldPos.y);
  const depth: number = 0;

  const dungeon: Dungeon = ensureDungeonLevel(state, baseId, depth, worldPos);

  state.dungeonStack = [{ baseId, depth, entranceWorldPos: { x: worldPos.x, y: worldPos.y } }];
  state.mode = "dungeon";
  state.player.mapRef = { kind: "dungeon", dungeonId: dungeon.id };
  state.player.pos = { x: dungeon.stairsUp.x, y: dungeon.stairsUp.y };

  state.log.push("You enter the dungeon.");
}

function goDownLevel(): void {
  const current: DungeonStackFrame | undefined = state.dungeonStack[state.dungeonStack.length - 1];
  if (!current) return;

  const nextDepth: number = current.depth + 1;
  const dungeon: Dungeon = ensureDungeonLevel(state, current.baseId, nextDepth, current.entranceWorldPos);

  state.dungeonStack.push({ baseId: current.baseId, depth: nextDepth, entranceWorldPos: current.entranceWorldPos });
  state.player.mapRef = { kind: "dungeon", dungeonId: dungeon.id };
  state.player.pos = { x: dungeon.stairsUp.x, y: dungeon.stairsUp.y };
  state.log.push(`You descend to depth ${nextDepth}.`);
}

function goUpLevelOrExit(): void {
  if (state.dungeonStack.length <= 1) {
    // exit to overworld
    const top: DungeonStackFrame | undefined = state.dungeonStack[0];
    if (!top) return;

    state.mode = "overworld";
    state.player.mapRef = { kind: "overworld" };
    state.player.pos = { x: top.entranceWorldPos.x, y: top.entranceWorldPos.y };
    state.dungeonStack = [];
    state.log.push("You return to the overworld.");
    return;
  }

  // pop current and go to previous level
  state.dungeonStack.pop();
  const prev: DungeonStackFrame = state.dungeonStack[state.dungeonStack.length - 1];
  const dungeonId: string = dungeonLevelId(prev.baseId, prev.depth);
  const dungeon: Dungeon | undefined = state.dungeons.get(dungeonId);
  if (!dungeon) return;

  state.player.mapRef = { kind: "dungeon", dungeonId };
  state.player.pos = { x: dungeon.stairsDown.x, y: dungeon.stairsDown.y }; // come up near down-stairs on previous
  state.log.push(`You ascend to depth ${prev.depth}.`);
}

function syncRendererUi(): void {
  const isAscii: boolean = state.rendererMode === "ascii";
  asciiEl.style.display = isAscii ? "block" : "none";
  canvasWrap.style.display = isAscii ? "none" : "block";
}

function render(): void {
  modePill.textContent = state.mode === "overworld" ? "Mode: overworld" : `Mode: dungeon (depth ${state.dungeonStack[state.dungeonStack.length - 1]?.depth ?? 0})`;
  renderPill.textContent = `Renderer: ${state.rendererMode} • FOV: ${state.useFov ? "on" : "off"}`;

  const dungeon: Dungeon | undefined = getCurrentDungeon(state);

  if (state.mode === "dungeon" && dungeon && state.useFov) {
    decayVisibilityToSeen(dungeon);
    computeDungeonFov(dungeon, state.player.pos, 10);
  }

  const monsterCountHere: number = state.entities.filter((e: Entity) =>
    e.kind === "monster" &&
    e.hp > 0 &&
    (state.mode === "dungeon" && e.mapRef.kind === "dungeon" && dungeon && e.mapRef.dungeonId === dungeon.id)
  ).length;

  const atk: number = state.player.baseAttack + getEquippedAttackBonus(state.player);
  const def: number = state.player.baseDefense + getEquippedDefenseBonus(state.player);

  statsEl.innerHTML = `
    <div class="kv"><div><b>${state.player.name}</b></div><div>HP ${state.player.hp}/${state.player.maxHp}</div></div>
    <div class="kv small"><div>Atk ${atk}</div><div>Def ${def}</div></div>
    <div class="kv small"><div>Pos ${state.player.pos.x}, ${state.player.pos.y}</div><div class="muted">Seed ${state.worldSeed}</div></div>
    ${state.mode === "dungeon" ? `<div class="small">Monsters here: ${monsterCountHere}</div>` : ""}
  `;

  invEl.innerHTML = renderInventoryHtml();

  logEl.innerHTML = state.log.all().slice(0, 120).map((m) => `<div>• ${escapeHtml(m.text)}</div>`).join("");

  if (state.rendererMode === "ascii") {
    asciiEl.textContent = renderAscii({
      mode: state.mode,
      overworld: state.overworld,
      dungeon,
      player: state.player,
      entities: state.entities,
      items: state.items,
      useFov: state.useFov
    }, VIEW_W, VIEW_H);
  } else {
    canvasRenderer.render({
      mode: state.mode,
      overworld: state.overworld,
      dungeon,
      player: state.player,
      entities: state.entities,
      items: state.items,
      useFov: state.useFov
    }, Math.floor(canvas.width / 16) - 1, Math.floor(canvas.height / 16) - 1);
  }
}

function renderInventoryHtml(): string {
  const invItems: Item[] = state.player.inventory
    .map((id: string) => state.items.find((x) => x.id === id))
    .filter((x: Item | undefined): x is Item => !!x);

  const weaponId: string | undefined = state.player.equipment.weaponItemId;
  const armorId: string | undefined = state.player.equipment.armorItemId;

  const lines: string[] = [];
  lines.push(`<div><b>Inventory</b> <span class="small muted">(${invItems.length})</span></div>`);
  if (weaponId) {
    const w = state.items.find((x) => x.id === weaponId);
    lines.push(`<div class="small">Weapon: <b>${escapeHtml(w?.name ?? weaponId)}</b></div>`);
  } else {
    lines.push(`<div class="small">Weapon: <span class="muted">none</span></div>`);
  }
  if (armorId) {
    const a = state.items.find((x) => x.id === armorId);
    lines.push(`<div class="small">Armor: <b>${escapeHtml(a?.name ?? armorId)}</b></div>`);
  } else {
    lines.push(`<div class="small">Armor: <span class="muted">none</span></div>`);
  }

  lines.push(`<div class="small muted">U uses first potion. E equips first weapon/armor if empty.</div>`);
  lines.push(`<div style="margin-top:6px;"></div>`);

  if (invItems.length === 0) {
    lines.push(`<div class="small muted">Empty.</div>`);
  } else {
    for (const it of invItems.slice(0, 40)) {
      const extra: string =
        it.kind === "potion" ? `(+${it.healAmount ?? 0} HP)` :
        it.kind === "weapon" ? `(+${it.attackBonus ?? 0} Atk)` :
        it.kind === "armor" ? `(+${it.defenseBonus ?? 0} Def)` : "";
      lines.push(`<div class="small">• ${escapeHtml(it.name)} <span class="muted">${escapeHtml(extra)}</span></div>`);
    }
  }

  return lines.join("");
}

function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function keyToAction(e: KeyboardEvent): Action | undefined {
  if (e.key === "r" || e.key === "R") return { kind: "toggleRenderer" };
  if (e.key === "f" || e.key === "F") return { kind: "toggleFov" };
  if (e.key === "?" ) return { kind: "help" };

  if (e.key === "p" || e.key === "P") return { kind: "save" };
  if (e.key === "o" || e.key === "O") return { kind: "load" };

  if (e.key === "g" || e.key === "G" || e.key === ",") return { kind: "pickup" };
  if (e.key === "u" || e.key === "U") return { kind: "useItem" };
  if (e.key === "e" || e.key === "E") return { kind: "equipItem" };

  if (e.key === "Enter") return { kind: "use" };
  if (e.key === " ") return { kind: "wait" };

  if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") return { kind: "move", dx: 0, dy: -1 };
  if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") return { kind: "move", dx: 0, dy: 1 };
  if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") return { kind: "move", dx: -1, dy: 0 };
  if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") return { kind: "move", dx: 1, dy: 0 };

  return undefined;
}

window.addEventListener("keydown", (e: KeyboardEvent) => {
  const a: Action | undefined = keyToAction(e);
  if (!a) return;
  e.preventDefault();
  handleAction(a);
});

btnAscii.addEventListener("click", () => {
  state.rendererMode = "ascii";
  syncRendererUi();
  render();
});

btnCanvas.addEventListener("click", () => {
  state.rendererMode = "canvas";
  syncRendererUi();
  render();
});

btnNewSeed.addEventListener("click", () => {
  state = newGame(Date.now() & 0xffffffff);
  syncRendererUi();
  render();
});

btnSave.addEventListener("click", () => {
  doSave();
  render();
});

btnLoad.addEventListener("click", () => {
  doLoad();
  syncRendererUi();
  render();
});

function doSave(): void {
  const dungeons: Dungeon[] = [...state.dungeons.values()];

  const data: SaveDataV1 = {
    version: 1,
    worldSeed: state.worldSeed,
    mode: state.mode,
    playerId: state.player.id,
    entities: state.entities,
    items: state.items,
    dungeons,
    entranceReturnPos: state.dungeonStack[0]?.entranceWorldPos
  };

  saveToLocalStorage(data);
  state.log.push("Saved.");
}

function doLoad(): void {
  const data: SaveDataV1 | undefined = loadFromLocalStorage();
  if (!data) {
    state.log.push("No save found.");
    return;
  }

  // Rebuild state with deterministic overworld, but restore entities/items/dungeons.
  const rng: Rng = new Rng(data.worldSeed);

  const overworld: Overworld = new Overworld(data.worldSeed);
  const dungeonsMap: Map<string, Dungeon> = new Map<string, Dungeon>();
  for (const d of data.dungeons) dungeonsMap.set(d.id, d);

  const player: Entity | undefined = data.entities.find((e) => e.id === data.playerId);
  if (!player) {
    state.log.push("Save missing player.");
    return;
  }

  state = {
    worldSeed: data.worldSeed,
    rng,
    mode: data.mode,
    overworld,
    dungeons: dungeonsMap,
    dungeonStack: rebuildDungeonStackFromPlayer(data, player),
    player,
    entities: data.entities,
    items: data.items,
    rendererMode: state.rendererMode,
    useFov: state.useFov,
    log: new MessageLog(120)
  };

  state.log.push("Loaded.");
}

function rebuildDungeonStackFromPlayer(data: SaveDataV1, player: Entity): DungeonStackFrame[] {
  if (player.mapRef.kind !== "dungeon") return [];
  const dungeon: Dungeon | undefined = data.dungeons.find((d) => d.id === player.mapRef.dungeonId);
  if (!dungeon) return [];

  // Recreate stack from baseId + depth down to 0
  const frames: DungeonStackFrame[] = [];
  const entranceWorldPos: Point = data.entranceReturnPos ?? { x: 0, y: 0 };
  for (let depth: number = 0; depth <= dungeon.depth; depth++) {
    frames.push({ baseId: dungeon.baseId, depth, entranceWorldPos });
  }
  return frames;
}

syncRendererUi();
render();
