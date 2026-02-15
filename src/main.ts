import type { Action, Entity, Item, Mode, Point, Shop } from "./core/types";
import { Rng } from "./core/rng";
import { add, manhattan } from "./core/util";
import { Overworld, dungeonBaseIdFromWorldPos, dungeonLevelId, dungeonSeedFromWorldPos, townIdFromWorldPos } from "./maps/overworld";
import type { Dungeon } from "./maps/dungeon";
import { generateDungeon, getDungeonTile, randomFloorPoint } from "./maps/dungeon";
import { computeDungeonFov, decayVisibilityToSeen } from "./systems/fov";
import { canEnterDungeonTile, canEnterOverworldTile, isBlockedByEntity } from "./systems/rules";
import { nextMonsterStep } from "./systems/ai";
import { renderAscii } from "./render/ascii";
import { CanvasRenderer } from "./render/canvas";
import { MessageLog } from "./ui/log";
import { loadFromLocalStorage, saveToLocalStorage, type SaveDataV2 } from "./core/save";
import { renderPanelHtml, type PanelMode } from "./ui/panel";
import { hash2D } from "./core/hash";

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

  shops: Map<string, Shop>;

  rendererMode: RendererMode;
  useFov: boolean;

  activePanel: PanelMode;

  log: MessageLog;
};

const VIEW_W: number = 61;
const VIEW_H: number = 33;

const asciiEl: HTMLElement = document.getElementById("ascii")!;
const canvasWrap: HTMLElement = document.getElementById("canvasWrap")!;
const modePill: HTMLElement = document.getElementById("modePill")!;
const renderPill: HTMLElement = document.getElementById("renderPill")!;
const statsEl: HTMLElement = document.getElementById("stats")!;
const panelEl: HTMLElement = document.getElementById("panel")!;
const logEl: HTMLElement = document.getElementById("log")!;

const btnAscii: HTMLButtonElement = document.getElementById("btnAscii") as HTMLButtonElement;
const btnCanvas: HTMLButtonElement = document.getElementById("btnCanvas") as HTMLButtonElement;
const btnNewSeed: HTMLButtonElement = document.getElementById("btnNewSeed") as HTMLButtonElement;
const btnSave: HTMLButtonElement = document.getElementById("btnSave") as HTMLButtonElement;
const btnLoad: HTMLButtonElement = document.getElementById("btnLoad") as HTMLButtonElement;
const btnInv: HTMLButtonElement = document.getElementById("btnInv") as HTMLButtonElement;
const btnShop: HTMLButtonElement = document.getElementById("btnShop") as HTMLButtonElement;

const canvas: HTMLCanvasElement = document.getElementById("gameCanvas") as HTMLCanvasElement;
const canvasRenderer: CanvasRenderer = new CanvasRenderer(canvas);

function newGame(worldSeed: number): GameState {
  const rng: Rng = new Rng(worldSeed);
  const overworld: Overworld = new Overworld(worldSeed);

  const player: Entity = {
    id: "player",
    kind: "player",
    name: "You",
    glyph: "@",
    pos: findStartPosition(overworld, rng),
    mapRef: { kind: "overworld" },
    hp: 20,
    maxHp: 20,
    baseAttack: 2,
    baseDefense: 0,
    level: 1,
    xp: 0,
    gold: 20,
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
    shops: new Map<string, Shop>(),
    rendererMode: "ascii",
    useFov: true,
    activePanel: "none",
    log: new MessageLog(160)
  };

  state.log.push("Welcome. Find a town (T) to shop or a dungeon (D) to descend.");
  state.log.push("I inventory • B shop (when standing on T) • G pick up items in dungeons.");
  state.log.push("P save • O load • R renderer • F FOV");
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
  const monsterCount: number = 5 + Math.min(12, dungeon.depth * 2);
  const rng: Rng = new Rng(seed ^ 0xBEEF);

  for (let i: number = 0; i < monsterCount; i++) {
    const p: Point = randomFloorPoint(dungeon, seed + 1000 + i * 17);

    const roll: number = rng.nextInt(0, 100);
    const monster = createMonsterForDepth(dungeon.depth, roll, s.rng, dungeon.id, i, p);

    s.entities.push(monster);
  }
}

function createMonsterForDepth(depth: number, roll: number, rng: Rng, dungeonId: string, i: number, p: Point): Entity {
  // Slime: weak, Orc: tougher, Goblin: baseline
  if (roll < 35) {
    return {
      id: `m_${dungeonId}_${i}`,
      kind: "monster",
      name: "Slime",
      glyph: "s",
      pos: p,
      mapRef: { kind: "dungeon", dungeonId },
      hp: 4 + depth,
      maxHp: 4 + depth,
      baseAttack: 1 + Math.floor(depth / 2),
      baseDefense: 0,
      level: 1,
      xp: 0,
      gold: 0,
      inventory: [],
      equipment: {}
    };
  }

  if (roll < 75) {
    return {
      id: `m_${dungeonId}_${i}`,
      kind: "monster",
      name: "Goblin",
      glyph: "g",
      pos: p,
      mapRef: { kind: "dungeon", dungeonId },
      hp: 6 + depth * 2,
      maxHp: 6 + depth * 2,
      baseAttack: 2 + depth,
      baseDefense: Math.floor(depth / 3),
      level: 1,
      xp: 0,
      gold: 0,
      inventory: [],
      equipment: {}
    };
  }

  return {
    id: `m_${dungeonId}_${i}`,
    kind: "monster",
    name: "Orc",
    glyph: "O",
    pos: p,
    mapRef: { kind: "dungeon", dungeonId },
    hp: 10 + depth * 3,
    maxHp: 10 + depth * 3,
    baseAttack: 3 + depth,
    baseDefense: 1 + Math.floor(depth / 2),
    level: 1,
    xp: 0,
    gold: 0,
    inventory: [],
    equipment: {}
  };
}

function spawnLootInDungeon(s: GameState, dungeon: Dungeon, seed: number): void {
  const rng: Rng = new Rng(seed ^ 0x51f15);
  const lootCount: number = 8;

  for (let i: number = 0; i < lootCount; i++) {
    const p: Point = randomFloorPoint(dungeon, seed + 5000 + i * 31);
    const roll: number = rng.nextInt(0, 100);

    let item: Item;
    if (roll < 55) {
      item = {
        id: `it_${dungeon.id}_${i}`,
        kind: "potion",
        name: dungeon.depth >= 4 ? "Greater Healing Potion" : "Healing Potion",
        healAmount: 8 + dungeon.depth * 2,
        mapRef: { kind: "dungeon", dungeonId: dungeon.id },
        pos: p,
        value: 10 + dungeon.depth * 2
      };
    } else if (roll < 85) {
      item = {
        id: `it_${dungeon.id}_${i}`,
        kind: "weapon",
        name: dungeon.depth >= 4 ? "Iron Sword" : "Rusty Sword",
        attackBonus: 2 + dungeon.depth,
        mapRef: { kind: "dungeon", dungeonId: dungeon.id },
        pos: p,
        value: 18 + dungeon.depth * 3
      };
    } else {
      item = {
        id: `it_${dungeon.id}_${i}`,
        kind: "armor",
        name: dungeon.depth >= 4 ? "Chain Vest" : "Leather Armor",
        defenseBonus: 1 + Math.floor(dungeon.depth / 2),
        mapRef: { kind: "dungeon", dungeonId: dungeon.id },
        pos: p,
        value: 18 + dungeon.depth * 3
      };
    }

    s.items.push(item);
  }
}

function ensureShopForTown(s: GameState, townPos: Point): Shop {
  const shopId: string = townIdFromWorldPos(s.worldSeed, townPos.x, townPos.y);
  const existing: Shop | undefined = s.shops.get(shopId);
  if (existing) return existing;

  const stock: string[] = [];
  const seed: number = hash2D(s.worldSeed, townPos.x, townPos.y);
  const rng: Rng = new Rng(seed ^ 0xC0FFEE);

  // Generate 10 stock items that persist per town.
  for (let i: number = 0; i < 10; i++) {
    const roll: number = rng.nextInt(0, 100);

    const itemId: string = `shop_${shopId}_${i}`;
    let item: Item;

    if (roll < 45) {
      item = { id: itemId, kind: "potion", name: "Healing Potion", healAmount: 10, value: 14 };
    } else if (roll < 75) {
      item = { id: itemId, kind: "weapon", name: "Steel Dagger", attackBonus: 3, value: 30 };
    } else {
      item = { id: itemId, kind: "armor", name: "Padded Vest", defenseBonus: 2, value: 28 };
    }

    // Shop stock is not placed on the map.
    s.items.push(item);
    stock.push(itemId);
  }

  const created: Shop = { id: shopId, townWorldPos: { x: townPos.x, y: townPos.y }, stockItemIds: stock };
  s.shops.set(shopId, created);
  return created;
}

function isStandingOnTown(): boolean {
  return state.mode === "overworld" && state.overworld.getTile(state.player.pos.x, state.player.pos.y) === "town";
}

function isStandingOnDungeonEntrance(): boolean {
  return state.mode === "overworld" && state.overworld.getTile(state.player.pos.x, state.player.pos.y) === "dungeon";
}

function removeDeadEntities(s: GameState): void {
  s.entities = s.entities.filter((e: Entity) => e.hp > 0 || e.kind === "player");
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

  if (action.kind === "toggleInventory") {
    state.activePanel = state.activePanel === "inventory" ? "none" : "inventory";
    render();
    return;
  }

  if (action.kind === "toggleShop") {
    state.activePanel = state.activePanel === "shop" ? "none" : "shop";
    if (state.activePanel === "shop" && isStandingOnTown()) {
      ensureShopForTown(state, state.player.pos);
    }
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
    state.log.push("Keys: WASD/Arrows move • Enter use • I inventory • B shop (town) • G pick up • R renderer • F FOV • P save • O load.");
    render();
    return;
  }

  const acted: boolean = playerTurn(action);
  if (!acted) {
    render();
    return;
  }

  monstersTurn();
  removeDeadEntities(state);

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

  if (action.kind === "use") {
    if (state.mode === "overworld") {
      if (isStandingOnDungeonEntrance()) {
        enterDungeonAt(state.player.pos);
        return true;
      }
      if (isStandingOnTown()) {
        state.log.push("You're in town. Press B to open the shop.");
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
  const dungeon: Dungeon | undefined = getCurrentDungeon(state);
  if (state.mode !== "dungeon" || !dungeon) {
    state.log.push("You can only pick up items inside dungeons (for now).");
    return false;
  }

  for (const it of state.items) {
    if (!it.mapRef || !it.pos) continue;
    if (it.mapRef.kind !== "dungeon") continue;
    if (it.mapRef.dungeonId !== dungeon.id) continue;

    if (it.pos.x === state.player.pos.x && it.pos.y === state.player.pos.y) {
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
  if (t === "dungeon") state.log.push("Dungeon entrance found. Press Enter to enter.");
  if (t === "town") state.log.push("Town found. Press Enter then B to shop.");

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

function awardXp(amount: number): void {
  state.player.xp += amount;
  while (state.player.xp >= xpToNextLevel(state.player.level)) {
    state.player.xp -= xpToNextLevel(state.player.level);
    state.player.level += 1;
    state.player.maxHp += 5;
    state.player.hp = state.player.maxHp;
    state.player.baseAttack += 1;
    if (state.player.level % 2 === 0) state.player.baseDefense += 1;
    state.log.push(`*** Level up! You are now level ${state.player.level}. ***`);
  }
}

function xpToNextLevel(level: number): number {
  return 25 + (level - 1) * 12;
}

function attack(attacker: Entity, defender: Entity): void {
  const atk: number = attacker.baseAttack + getEquippedAttackBonus(attacker);
  const def: number = defender.baseDefense + getEquippedDefenseBonus(defender);

  const roll: number = state.rng.nextInt(0, 5); // 0-4
  const raw: number = atk + roll;
  const dmg: number = Math.max(1, raw - def);

  defender.hp -= dmg;
  state.log.push(`${attacker.name} hits ${defender.name} for ${dmg}. (${Math.max(0, defender.hp)}/${defender.maxHp})`);

  if (defender.hp <= 0) {
    state.log.push(`${defender.name} dies.`);
    if (attacker.kind === "player") {
      const xp: number = 6 + (defender.baseAttack + defender.baseDefense);
      const gold: number = 2 + state.rng.nextInt(0, 4);
      state.player.gold += gold;
      state.log.push(`You gain ${xp} XP and loot ${gold} gold.`);
      awardXp(xp);
    }
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
    if (e.hp <= 0) continue;
    if (e.mapRef.kind !== "dungeon") continue;
    if (e.mapRef.dungeonId !== dungeon.id) continue;

    const dist: number = manhattan(e.pos, state.player.pos);
    if (dist <= 1) {
      attack(e, state.player);
      continue;
    }

    const chaseOk: boolean = !state.useFov || (visible ? visible.has(`${e.pos.x},${e.pos.y}`) : true);
    if (dist <= 12 && chaseOk) {
      const next: Point | undefined = nextMonsterStep(e, state.player, dungeon, state.entities);
      if (!next) continue;

      const blocked: Entity | undefined = isBlockedByEntity(state.entities, "dungeon", dungeon.id, next);
      if (blocked) continue;

      if (canEnterDungeonTile(dungeon, next)) e.pos = next;
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
  state.log.push(`You descend to depth ${nextDepth}. Theme: ${dungeon.theme}.`);
}

function goUpLevelOrExit(): void {
  if (state.dungeonStack.length <= 1) {
    const top: DungeonStackFrame | undefined = state.dungeonStack[0];
    if (!top) return;

    state.mode = "overworld";
    state.player.mapRef = { kind: "overworld" };
    state.player.pos = { x: top.entranceWorldPos.x, y: top.entranceWorldPos.y };
    state.dungeonStack = [];
    state.log.push("You return to the overworld.");
    return;
  }

  state.dungeonStack.pop();
  const prev: DungeonStackFrame = state.dungeonStack[state.dungeonStack.length - 1];
  const dungeonId: string = dungeonLevelId(prev.baseId, prev.depth);
  const dungeon: Dungeon | undefined = state.dungeons.get(dungeonId);
  if (!dungeon) return;

  state.player.mapRef = { kind: "dungeon", dungeonId };
  state.player.pos = { x: dungeon.stairsDown.x, y: dungeon.stairsDown.y };
  state.log.push(`You ascend to depth ${prev.depth}.`);
}

function syncRendererUi(): void {
  const isAscii: boolean = state.rendererMode === "ascii";
  asciiEl.style.display = isAscii ? "block" : "none";
  canvasWrap.style.display = isAscii ? "none" : "block";
}

function render(): void {
  const dungeon: Dungeon | undefined = getCurrentDungeon(state);

  modePill.textContent =
    state.mode === "overworld"
      ? "Mode: overworld"
      : `Mode: dungeon (depth ${state.dungeonStack[state.dungeonStack.length - 1]?.depth ?? 0} • ${dungeon?.theme ?? "?"})`;

  renderPill.textContent = `Renderer: ${state.rendererMode} • FOV: ${state.useFov ? "on" : "off"}`;

  if (state.mode === "dungeon" && dungeon && state.useFov) {
    decayVisibilityToSeen(dungeon);
    computeDungeonFov(dungeon, state.player.pos, 10);
  }

  const atk: number = state.player.baseAttack + getEquippedAttackBonus(state.player);
  const def: number = state.player.baseDefense + getEquippedDefenseBonus(state.player);

  statsEl.innerHTML = `
    <div class="kv"><div><b>${escapeHtml(state.player.name)}</b> <span class="muted">Lvl ${state.player.level}</span></div><div>HP ${state.player.hp}/${state.player.maxHp}</div></div>
    <div class="kv small"><div>Atk ${atk}</div><div>Def ${def}</div></div>
    <div class="kv small"><div>XP ${state.player.xp}/${xpToNextLevel(state.player.level)}</div><div>Gold ${state.player.gold}</div></div>
    <div class="kv small"><div>Pos ${state.player.pos.x}, ${state.player.pos.y}</div><div class="muted">Seed ${state.worldSeed}</div></div>
  `;

  const activeShop: Shop | undefined = isStandingOnTown() ? ensureShopForTown(state, state.player.pos) : undefined;
  panelEl.innerHTML = renderPanelHtml({
    mode: state.activePanel,
    player: state.player,
    items: state.items,
    activeShop,
    canShop: isStandingOnTown()
  });

  logEl.innerHTML = state.log.all().slice(0, 160).map((m) => `<div>• ${escapeHtml(m.text)}</div>`).join("");

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

// Panel actions (inventory/shop buttons)
panelEl.addEventListener("click", (e: MouseEvent) => {
  const target: HTMLElement | null = e.target as HTMLElement;
  if (!target) return;
  const act: string | null = target.getAttribute("data-act");
  const itemId: string | null = target.getAttribute("data-item");
  if (!act || !itemId) return;

  if (act === "use") {
    usePotion(itemId);
    render();
    return;
  }
  if (act === "equipWeapon") {
    equipWeapon(itemId);
    render();
    return;
  }
  if (act === "equipArmor") {
    equipArmor(itemId);
    render();
    return;
  }
  if (act === "drop") {
    dropItem(itemId);
    render();
    return;
  }
  if (act === "buy") {
    buyItem(itemId);
    render();
    return;
  }
  if (act === "sell") {
    sellItem(itemId);
    render();
    return;
  }
});

function usePotion(itemId: string): void {
  const it: Item | undefined = state.items.find((x) => x.id === itemId);
  if (!it || it.kind !== "potion") return;
  if (!state.player.inventory.includes(itemId)) return;

  const heal: number = it.healAmount ?? 8;
  const before: number = state.player.hp;
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + heal);

  state.player.inventory = state.player.inventory.filter((x) => x !== itemId);
  state.items = state.items.filter((x) => x.id !== itemId);

  state.log.push(`You drink ${it.name}. (+${state.player.hp - before} HP)`);
}

function equipWeapon(itemId: string): void {
  const it: Item | undefined = state.items.find((x) => x.id === itemId);
  if (!it || it.kind !== "weapon") return;
  if (!state.player.inventory.includes(itemId)) return;
  state.player.equipment.weaponItemId = itemId;
  state.log.push(`Equipped weapon: ${it.name}.`);
}

function equipArmor(itemId: string): void {
  const it: Item | undefined = state.items.find((x) => x.id === itemId);
  if (!it || it.kind !== "armor") return;
  if (!state.player.inventory.includes(itemId)) return;
  state.player.equipment.armorItemId = itemId;
  state.log.push(`Equipped armor: ${it.name}.`);
}

function dropItem(itemId: string): void {
  const it: Item | undefined = state.items.find((x) => x.id === itemId);
  if (!it) return;
  if (!state.player.inventory.includes(itemId)) return;

  // Drop only if in dungeon; else just discard (simple for now)
  if (state.mode === "dungeon") {
    const dungeon: Dungeon | undefined = getCurrentDungeon(state);
    if (dungeon) {
      it.mapRef = { kind: "dungeon", dungeonId: dungeon.id };
      it.pos = { x: state.player.pos.x, y: state.player.pos.y };
      state.log.push(`Dropped: ${it.name}.`);
    }
  } else {
    state.log.push(`Discarded: ${it.name}.`);
    state.items = state.items.filter((x) => x.id !== itemId);
  }

  state.player.inventory = state.player.inventory.filter((x) => x !== itemId);
  if (state.player.equipment.weaponItemId === itemId) state.player.equipment.weaponItemId = undefined;
  if (state.player.equipment.armorItemId === itemId) state.player.equipment.armorItemId = undefined;
}

function buyItem(itemId: string): void {
  if (!isStandingOnTown()) {
    state.log.push("You need to be in town to buy.");
    return;
  }
  const it: Item | undefined = state.items.find((x) => x.id === itemId);
  if (!it) return;

  const price: number = it.value;
  if (state.player.gold < price) {
    state.log.push("Not enough gold.");
    return;
  }

  state.player.gold -= price;
  state.player.inventory.push(it.id);
  state.log.push(`Bought: ${it.name} for ${price}g.`);
}

function sellItem(itemId: string): void {
  if (!isStandingOnTown()) {
    state.log.push("You need to be in town to sell.");
    return;
  }
  const it: Item | undefined = state.items.find((x) => x.id === itemId);
  if (!it) return;
  if (!state.player.inventory.includes(itemId)) return;

  const price: number = Math.max(1, Math.floor(it.value * 0.5));
  state.player.gold += price;

  state.player.inventory = state.player.inventory.filter((x) => x !== itemId);
  if (state.player.equipment.weaponItemId === itemId) state.player.equipment.weaponItemId = undefined;
  if (state.player.equipment.armorItemId === itemId) state.player.equipment.armorItemId = undefined;

  // Keep item definition in items list so it can be re-sold later? We'll remove it to simplify.
  state.items = state.items.filter((x) => x.id !== itemId);

  state.log.push(`Sold: ${it.name} for ${price}g.`);
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

  if (e.key === "i" || e.key === "I") return { kind: "toggleInventory" };
  if (e.key === "b" || e.key === "B") return { kind: "toggleShop" };

  if (e.key === "g" || e.key === "G" || e.key === ",") return { kind: "pickup" };

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

btnSave.addEventListener("click", () => { doSave(); render(); });
btnLoad.addEventListener("click", () => { doLoad(); syncRendererUi(); render(); });

btnInv.addEventListener("click", () => { state.activePanel = state.activePanel === "inventory" ? "none" : "inventory"; render(); });
btnShop.addEventListener("click", () => { state.activePanel = state.activePanel === "shop" ? "none" : "shop"; if (state.activePanel === "shop" && isStandingOnTown()) ensureShopForTown(state, state.player.pos); render(); });

function doSave(): void {
  const dungeons: Dungeon[] = [...state.dungeons.values()];
  const shops: Shop[] = [...state.shops.values()];

  const data: SaveDataV2 = {
    version: 2,
    worldSeed: state.worldSeed,
    mode: state.mode,
    playerId: state.player.id,
    entities: state.entities,
    items: state.items,
    dungeons,
    shops,
    entranceReturnPos: state.dungeonStack[0]?.entranceWorldPos,
    activePanel: state.activePanel
  };

  saveToLocalStorage(data);
  state.log.push("Saved.");
}

function doLoad(): void {
  const data: SaveDataV2 | undefined = loadFromLocalStorage();
  if (!data) {
    state.log.push("No save found.");
    return;
  }

  const rng: Rng = new Rng(data.worldSeed);
  const overworld: Overworld = new Overworld(data.worldSeed);

  const dungeonsMap: Map<string, Dungeon> = new Map<string, Dungeon>();
  for (const d of data.dungeons) dungeonsMap.set(d.id, d);

  const shopsMap: Map<string, Shop> = new Map<string, Shop>();
  for (const s of data.shops) shopsMap.set(s.id, s);

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
    shops: shopsMap,
    rendererMode: state.rendererMode,
    useFov: state.useFov,
    activePanel: data.activePanel ?? "none",
    log: new MessageLog(160)
  };

  state.log.push("Loaded.");
}

function rebuildDungeonStackFromPlayer(data: SaveDataV2, player: Entity): DungeonStackFrame[] {
  if (player.mapRef.kind !== "dungeon") return [];
  const dungeon: Dungeon | undefined = data.dungeons.find((d) => d.id === player.mapRef.dungeonId);
  if (!dungeon) return [];

  const entranceWorldPos: Point = data.entranceReturnPos ?? { x: 0, y: 0 };
  const frames: DungeonStackFrame[] = [];
  for (let depth: number = 0; depth <= dungeon.depth; depth++) {
    frames.push({ baseId: dungeon.baseId, depth, entranceWorldPos });
  }
  return frames;
}

syncRendererUi();
render();
