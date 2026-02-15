import type { Action, CharacterClass, Entity, Item, Mode, Point, Shop } from './core/types';
import { Rng } from './core/rng';
import { add, manhattan } from './core/util';
import { Overworld, dungeonBaseIdFromWorldPos, dungeonLevelId, dungeonSeedFromWorldPos, townIdFromWorldPos } from './maps/overworld';
import type { Dungeon } from './maps/dungeon';
import { generateDungeon, getDungeonTile, randomFloorPoint } from './maps/dungeon';
import { computeDungeonFov, decayVisibilityToSeen } from './systems/fov';
import { canEnterDungeonTile, canEnterOverworldTile, isBlockedByEntity } from './systems/rules';
import { nextMonsterStep } from './systems/ai';
import { PixiRenderer } from './render/pixi';
import { MessageLog } from './ui/log';
import { loadFromLocalStorage, saveToLocalStorage, type SaveDataV3 } from './core/save';
import { renderPanelHtml, type PanelMode } from './ui/panel';
import { renderOverworldMapAscii } from './ui/map';
import { aStar } from './systems/astar';
import { hash2D } from './core/hash';

type RendererMode = 'ascii' | 'canvas';

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
  playerClass: CharacterClass;
  entities: Entity[];
  items: Item[];

  shops: Map<string, Shop>;

  rendererMode: RendererMode;
  useFov: boolean;

  activePanel: PanelMode;
  shopCategory: 'all' | 'potion' | 'weapon' | 'armor';

  turnCounter: number;
  quests: import('./core/types').Quest[];

  // Navigation helpers
  mapOpen: boolean;
  mapCursor: Point;
  destination?: Point;
  autoPath?: Point[];

  log: MessageLog;
};

type ClassConfig = {
  name: string;
  description: string;
  maxHp: number;
  baseAttack: number;
  baseDefense: number;
  strength: number;
  agility: number;
  intellect: number;
};

const CLASS_CONFIG: Record<CharacterClass, ClassConfig> = {
  warrior: {
    name: 'Warrior',
    description: 'Brutal melee fighter with crushing swings.',
    maxHp: 28,
    baseAttack: 4,
    baseDefense: 2,
    strength: 6,
    agility: 3,
    intellect: 2
  },
  rogue: {
    name: 'Rogue',
    description: 'Swift and cunning, striking where it hurts most.',
    maxHp: 22,
    baseAttack: 3,
    baseDefense: 1,
    strength: 3,
    agility: 6,
    intellect: 3
  },
  mage: {
    name: 'Mage',
    description: 'Master of arcane force that burns through armor.',
    maxHp: 18,
    baseAttack: 2,
    baseDefense: 0,
    strength: 2,
    agility: 3,
    intellect: 7
  }
};

function ensureClassAttributes(player: Entity, classType: CharacterClass): void {
  const cfg: ClassConfig = CLASS_CONFIG[classType];
  player.classType = classType;
  if (player.statusEffects === undefined) player.statusEffects = [];
  if (player.strength === undefined) player.strength = cfg.strength;
  if (player.agility === undefined) player.agility = cfg.agility;
  if (player.intellect === undefined) player.intellect = cfg.intellect;
}

const asciiEl: HTMLElement = document.getElementById('ascii')!;
const canvasWrap: HTMLElement = document.getElementById('canvasWrap')!;
const modePill: HTMLElement = document.getElementById('modePill')!;
const renderPill: HTMLElement = document.getElementById('renderPill')!;
const statsEl: HTMLElement = document.getElementById('stats')!;
const panelEl: HTMLElement = document.getElementById('panel')!;
const logEl: HTMLElement = document.getElementById('log')!;

const btnAscii: HTMLButtonElement = document.getElementById('btnAscii') as HTMLButtonElement;
const btnCanvas: HTMLButtonElement = document.getElementById('btnCanvas') as HTMLButtonElement;
const btnNewSeed: HTMLButtonElement = document.getElementById('btnNewSeed') as HTMLButtonElement;
const btnSave: HTMLButtonElement = document.getElementById('btnSave') as HTMLButtonElement;
const btnLoad: HTMLButtonElement = document.getElementById('btnLoad') as HTMLButtonElement;
const btnInv: HTMLButtonElement = document.getElementById('btnInv') as HTMLButtonElement;
const btnShop: HTMLButtonElement = document.getElementById('btnShop') as HTMLButtonElement;
const btnMap: HTMLButtonElement = document.getElementById('btnMap') as HTMLButtonElement;

const canvas: HTMLCanvasElement = document.getElementById('gameCanvas') as HTMLCanvasElement;
const canvasRenderer: PixiRenderer = new PixiRenderer(canvas);
const PIXI_VIEW_W: number = Math.max(1, Math.floor(canvas.width / 16) - 1);
const PIXI_VIEW_H: number = Math.max(1, Math.floor(canvas.height / 16) - 1);

const classModal: HTMLElement = document.getElementById('classSelect')!;
const classButtons: HTMLButtonElement[] = Array.from(classModal.querySelectorAll<HTMLButtonElement>('[data-class]'));
const btnLoadFromModal: HTMLButtonElement = document.getElementById('btnLoadFromModal') as HTMLButtonElement;

let pendingSeed: number = Date.now() & 0xffffffff;
let pendingClass: CharacterClass = 'warrior';
canvasWrap.classList.add('displayNone');
btnAscii.style.display = 'none';

function newGame(worldSeed: number, classChoice: CharacterClass): GameState {
  const rng: Rng = new Rng(worldSeed);
  const overworld: Overworld = new Overworld(worldSeed);
  const cfg: ClassConfig = CLASS_CONFIG[classChoice];

  const player: Entity = {
    id: 'player',
    kind: 'player',
    name: 'You',
    glyph: '@',
    pos: findStartPosition(overworld, rng),
    mapRef: { kind: 'overworld' },
    hp: cfg.maxHp,
    maxHp: cfg.maxHp,
    baseAttack: cfg.baseAttack,
    baseDefense: cfg.baseDefense,
    level: 1,
    xp: 0,
    gold: 20,
    inventory: [],
    equipment: {},
    classType: classChoice,
    strength: cfg.strength,
    agility: cfg.agility,
    intellect: cfg.intellect,
    statusEffects: []
  };

  const state: GameState = {
    worldSeed,
    rng,
    mode: 'overworld',
    overworld,
    dungeons: new Map<string, Dungeon>(),
    dungeonStack: [],
    player,
    playerClass: classChoice,
    entities: [player],
    items: [],
    shops: new Map<string, Shop>(),
    rendererMode: 'canvas',
    useFov: true,
    activePanel: 'none',
    shopCategory: 'all',
    turnCounter: 0,
    quests: [],
    mapOpen: false,
    mapCursor: { x: 0, y: 0 },
    destination: undefined,
    autoPath: undefined,
    log: new MessageLog(160)
  };

  state.log.push('Welcome. Find a town (T) to shop or a dungeon (D) to descend.');
  state.log.push('I inventory • B shop (town) • Q quests (town) • G pick up items in dungeons.');
  state.log.push('P save • O load • R renderer • F FOV');
  state.log.push(`Class: ${cfg.name} • Str ${cfg.strength} • Agi ${cfg.agility} • Int ${cfg.intellect}.`);
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

let state: GameState = newGame(pendingSeed, pendingClass);

function hideClassModal(): void {
  classModal.classList.add('hidden');
}

function showClassModal(): void {
  classModal.classList.remove('hidden');
}

function isClassModalVisible(): boolean {
  return !classModal.classList.contains('hidden');
}

function startNewRun(classChoice: CharacterClass): void {
  pendingClass = classChoice;
  state = newGame(pendingSeed, classChoice);
  hideClassModal();
  syncRendererUi();
  render();
}

function getCurrentDungeon(s: GameState): Dungeon | undefined {
  if (s.player.mapRef.kind !== 'dungeon') return undefined;
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
  const rng: Rng = new Rng(seed ^ 0xbeef);

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
      kind: 'monster',
      name: 'Slime',
      glyph: 's',
      pos: p,
      mapRef: { kind: 'dungeon', dungeonId },
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
      kind: 'monster',
      name: 'Goblin',
      glyph: 'g',
      pos: p,
      mapRef: { kind: 'dungeon', dungeonId },
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
    kind: 'monster',
    name: 'Orc',
    glyph: 'O',
    pos: p,
    mapRef: { kind: 'dungeon', dungeonId },
    hp: 10 + depth * 3,
    maxHp: 10 + depth * 3,
    baseAttack: 3 + depth,
    baseDefense: 1 + Math.floor(depth / 2),
    level: 1,
    xp: 0,
    gold: 0,
    inventory: [],
    equipment: {},
    statusEffects: []
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
        kind: 'potion',
        name: dungeon.depth >= 4 ? 'Greater Healing Potion' : 'Healing Potion',
        healAmount: 8 + dungeon.depth * 2,
        mapRef: { kind: 'dungeon', dungeonId: dungeon.id },
        pos: p,
        value: 10 + dungeon.depth * 2
      };
    } else if (roll < 85) {
      item = {
        id: `it_${dungeon.id}_${i}`,
        kind: 'weapon',
        name: dungeon.depth >= 4 ? 'Iron Sword' : 'Rusty Sword',
        attackBonus: 2 + dungeon.depth,
        mapRef: { kind: 'dungeon', dungeonId: dungeon.id },
        pos: p,
        value: 18 + dungeon.depth * 3
      };
    } else {
      item = {
        id: `it_${dungeon.id}_${i}`,
        kind: 'armor',
        name: dungeon.depth >= 4 ? 'Chain Vest' : 'Leather Armor',
        defenseBonus: 1 + Math.floor(dungeon.depth / 2),
        mapRef: { kind: 'dungeon', dungeonId: dungeon.id },
        pos: p,
        value: 18 + dungeon.depth * 3
      };
    }

    s.items.push(item);
  }
}

function getActiveTownId(): string | undefined {
  if (state.mode !== 'overworld') return undefined;
  const t = state.overworld.getTile(state.player.pos.x, state.player.pos.y);
  if (t !== 'town') return undefined;
  return townIdFromWorldPos(state.worldSeed, state.player.pos.x, state.player.pos.y);
}

function ensureQuestForTown(s: GameState, townPos: Point): void {
  const townId: string = townIdFromWorldPos(s.worldSeed, townPos.x, townPos.y);

  // If we already have quests for this town, do nothing.
  if (s.quests.some((q) => q.townId === townId)) return;

  // Generate 1-2 quests deterministically from seed + town coords.
  const seed: number = hash2D(s.worldSeed, townPos.x, townPos.y) ^ 0xa11ce;
  const rng: Rng = new Rng(seed);

  const questCount: number = 1 + rng.nextInt(0, 2);
  for (let i: number = 0; i < questCount; i++) {
    const minDepth: number = 1 + rng.nextInt(0, 4);
    const targetCount: number = 6 + rng.nextInt(0, 8);
    const rewardGold: number = 20 + minDepth * 10 + rng.nextInt(0, 10);
    const rewardXp: number = 18 + minDepth * 8 + rng.nextInt(0, 10);

    const q: import('./core/types').Quest = {
      id: `q_${townId}_${i}`,
      townId,
      kind: 'killMonsters',
      description: `Clear threats: defeat ${targetCount} monsters (depth ≥ ${minDepth})`,
      targetCount,
      currentCount: 0,
      minDungeonDepth: minDepth,
      rewardGold,
      rewardXp,
      completed: false,
      turnedIn: false
    };

    s.quests.push(q);
  }
}

function recordKillForQuests(s: GameState, dungeonDepth: number): void {
  for (const q of s.quests) {
    if (q.kind !== 'killMonsters') continue;
    if (q.completed || q.turnedIn) continue;
    if (dungeonDepth < q.minDungeonDepth) continue;

    q.currentCount += 1;
    if (q.currentCount >= q.targetCount) {
      q.currentCount = q.targetCount;
      q.completed = true;
      s.log.push(`Quest complete: ${q.description}. Return to town to turn in (Q).`);
    }
  }
}

function applyStatusEffectsStartOfTurn(s: GameState): void {
  const effects = s.player.statusEffects ?? [];
  if (effects.length === 0) return;

  for (const eff of effects) {
    if (eff.kind === 'poison') {
      s.player.hp -= eff.potency;
      s.log.push(`Poison deals ${eff.potency} damage. (${Math.max(0, s.player.hp)}/${s.player.maxHp})`);
    }
    eff.remainingTurns -= 1;
  }

  s.player.statusEffects = effects.filter((e) => e.remainingTurns > 0);

  if (s.player.hp <= 0) {
    s.log.push('You succumb to your wounds.');
  }
}

function maybeApplyPoisonFromAttacker(attacker: Entity): void {
  // Slimes have a chance to poison.
  if (attacker.name !== 'Slime') return;
  const roll: number = state.rng.nextInt(0, 100);
  if (roll >= 20) return;

  const effects = state.player.statusEffects ?? [];
  const existing = effects.find((e) => e.kind === 'poison');
  if (existing) {
    existing.remainingTurns = Math.max(existing.remainingTurns, 5);
    existing.potency = Math.max(existing.potency, 1);
  } else {
    effects.push({ kind: 'poison', remainingTurns: 5, potency: 1 });
  }
  state.player.statusEffects = effects;
  state.log.push('You are poisoned!');
}

function maybeRestockShop(s: GameState, shop: Shop): void {
  // Restock every 80 turns (simple timer) - deterministic but time-based.
  const restockInterval: number = 80;
  const needsRestock: boolean = s.turnCounter % restockInterval === 0;

  if (!needsRestock) return;

  const seed: number = hash2D(s.worldSeed, shop.townWorldPos.x, shop.townWorldPos.y) ^ (Math.floor(s.turnCounter / restockInterval) * 0x9e3779b9);
  const rng: Rng = new Rng(seed);

  // Replace stock item definitions (remove old ones first)
  const oldIds: Set<string> = new Set<string>(shop.stockItemIds);
  s.items = s.items.filter((it) => !oldIds.has(it.id));

  const stock: string[] = [];
  for (let i: number = 0; i < 10; i++) {
    const roll: number = rng.nextInt(0, 100);
    const itemId: string = `shop_${shop.id}_${Math.floor(s.turnCounter / restockInterval)}_${i}`;

    let item: Item;
    if (roll < 45) {
      item = { id: itemId, kind: 'potion', name: 'Healing Potion', healAmount: 10, value: 14 };
    } else if (roll < 75) {
      item = { id: itemId, kind: 'weapon', name: 'Steel Dagger', attackBonus: 3, value: 30 };
    } else {
      item = { id: itemId, kind: 'armor', name: 'Padded Vest', defenseBonus: 2, value: 28 };
    }

    s.items.push(item);
    stock.push(itemId);
  }

  shop.stockItemIds = stock;
  s.log.push('The shop has new stock.');
}

function ensureShopForTown(s: GameState, townPos: Point): Shop {
  const shopId: string = townIdFromWorldPos(s.worldSeed, townPos.x, townPos.y);
  const existing: Shop | undefined = s.shops.get(shopId);
  if (existing) return existing;

  const stock: string[] = [];
  const seed: number = hash2D(s.worldSeed, townPos.x, townPos.y);
  const rng: Rng = new Rng(seed ^ 0xc0ffee);

  // Generate 10 stock items that persist per town.
  for (let i: number = 0; i < 10; i++) {
    const roll: number = rng.nextInt(0, 100);

    const itemId: string = `shop_${shopId}_${i}`;
    let item: Item;

    if (roll < 45) {
      item = { id: itemId, kind: 'potion', name: 'Healing Potion', healAmount: 10, value: 14 };
    } else if (roll < 75) {
      item = { id: itemId, kind: 'weapon', name: 'Steel Dagger', attackBonus: 3, value: 30 };
    } else {
      item = { id: itemId, kind: 'armor', name: 'Padded Vest', defenseBonus: 2, value: 28 };
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
  return state.mode === 'overworld' && state.overworld.getTile(state.player.pos.x, state.player.pos.y) === 'town';
}

function isStandingOnDungeonEntrance(): boolean {
  return state.mode === 'overworld' && state.overworld.getTile(state.player.pos.x, state.player.pos.y) === 'dungeon';
}

function removeDeadEntities(s: GameState): void {
  s.entities = s.entities.filter((e: Entity) => e.hp > 0 || e.kind === 'player');
}

function handleAction(action: Action): void {
  if (action.kind === 'toggleRenderer') {
    state.rendererMode = 'canvas';
    state.log.push('Renderer locked to PixiJS for now.');
    syncRendererUi();
    render();
    return;
  }

  if (action.kind === 'toggleFov') {
    state.useFov = !state.useFov;
    state.log.push(state.useFov ? 'FOV enabled.' : 'FOV disabled.');
    render();
    return;
  }

  if (action.kind === 'toggleInventory') {
    state.activePanel = state.activePanel === 'inventory' ? 'none' : 'inventory';
    render();
    return;
  }

  if (action.kind === 'toggleShop') {
    state.activePanel = state.activePanel === 'shop' ? 'none' : 'shop';
    if (state.activePanel === 'shop' && isStandingOnTown()) {
      ensureShopForTown(state, state.player.pos);
      ensureQuestForTown(state, state.player.pos);
      const shopNow: Shop = ensureShopForTown(state, state.player.pos);
      maybeRestockShop(state, shopNow);
    }
    render();
    return;
  }

  if (action.kind === 'toggleMap') {
    if (state.mode !== 'overworld') {
      state.log.push('Map is only available on the overworld.');
      render();
      return;
    }

    state.mapOpen = !state.mapOpen;
    state.activePanel = 'none';
    state.mapCursor = { x: 0, y: 0 };
    if (state.mapOpen) state.log.push('Map open: move cursor with WASD/Arrows, Enter to set destination, Esc/M to close, C to cancel auto-walk.');
    render();
    return;
  }

  if (action.kind === 'cancelAuto') {
    state.destination = undefined;
    state.autoPath = undefined;
    state.log.push('Auto-walk canceled.');
    render();
    return;
  }

  if (action.kind === 'toggleQuest') {
    state.activePanel = state.activePanel === 'quest' ? 'none' : 'quest';
    if (state.activePanel === 'quest' && isStandingOnTown()) {
      ensureQuestForTown(state, state.player.pos);
      const shopNow: Shop = ensureShopForTown(state, state.player.pos);
      maybeRestockShop(state, shopNow);
    }
    render();
    return;
  }

  if (action.kind === 'save') {
    doSave();
    render();
    return;
  }

  if (action.kind === 'load') {
    doLoad();
    syncRendererUi();
    render();
    return;
  }

  if (action.kind === 'help') {
    state.log.push(
      'Keys: WASD/Arrows move • Shift+Move run (overworld) • M map • Enter use • I inventory • B shop (town) • Q quests (town) • G pick up • R renderer • F FOV • P save • O load.'
    );
    render();
    return;
  }

  // Turn-based effects tick at the start of each action that advances time.
  state.turnCounter += 1;
  applyStatusEffectsStartOfTurn(state);
  if (state.player.hp <= 0) {
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
    state.log.push('You died. Press New Seed to restart.');
  }

  render();
}

function playerTurn(action: Action): boolean {
  if (state.player.hp <= 0) return false;

  if (state.mode === 'overworld' && state.autoPath && state.autoPath.length >= 2) {
    // If the player presses a time-advancing key (move or space), advance one step along the path.
    if (action.kind === 'move' || action.kind === 'wait') {
      const next: Point = state.autoPath[1];
      if (!canEnterOverworldTile(state.overworld, next)) {
        state.log.push('Auto-walk blocked.');
        state.destination = undefined;
        state.autoPath = undefined;
        return false;
      }

      state.player.pos = { x: next.x, y: next.y };
      state.autoPath = state.autoPath.slice(1);

      if (state.destination && state.player.pos.x === state.destination.x && state.player.pos.y === state.destination.y) {
        state.log.push('Arrived at destination.');
        state.destination = undefined;
        state.autoPath = undefined;
      }

      const t = state.overworld.getTile(state.player.pos.x, state.player.pos.y);
      if (t === 'dungeon') state.log.push('Dungeon entrance found. Press Enter to enter.');
      if (t === 'town') state.log.push('Town found. Press Enter then B/Q.');

      return true;
    }
  }

  if (action.kind === 'wait') {
    state.log.push('You wait.');
    return true;
  }

  if (action.kind === 'pickup') {
    return pickupAtPlayer();
  }

  if (action.kind === 'use') {
    if (state.mode === 'overworld') {
      if (isStandingOnDungeonEntrance()) {
        enterDungeonAt(state.player.pos);
        return true;
      }
      if (isStandingOnTown()) {
        state.log.push("You're in town. Press B to open the shop.");
        return true;
      }
      state.log.push('Nothing to use here.');
      return false;
    } else {
      const dungeon: Dungeon | undefined = getCurrentDungeon(state);
      if (!dungeon) return false;

      const tile = getDungeonTile(dungeon, state.player.pos.x, state.player.pos.y);
      if (tile === 'stairsUp') {
        goUpLevelOrExit();
        return true;
      }
      if (tile === 'stairsDown') {
        goDownLevel();
        return true;
      }

      state.log.push('Nothing to use here.');
      return false;
    }
  }

  if (action.kind === 'move') {
    return tryMovePlayer(action.dx, action.dy);
  }

  return false;
}

function pickupAtPlayer(): boolean {
  const dungeon: Dungeon | undefined = getCurrentDungeon(state);
  if (state.mode !== 'dungeon' || !dungeon) {
    state.log.push('You can only pick up items inside dungeons (for now).');
    return false;
  }

  for (const it of state.items) {
    if (!it.mapRef || !it.pos) continue;
    if (it.mapRef.kind !== 'dungeon') continue;
    if (it.mapRef.dungeonId !== dungeon.id) continue;

    if (it.pos.x === state.player.pos.x && it.pos.y === state.player.pos.y) {
      it.mapRef = undefined;
      it.pos = undefined;
      state.player.inventory.push(it.id);
      state.log.push(`Picked up: ${it.name}.`);
      return true;
    }
  }

  state.log.push('Nothing to pick up.');
  return false;
}

function tryMovePlayer(dx: number, dy: number): boolean {
  const target: Point = add(state.player.pos, { x: dx, y: dy });

  if (state.mode === 'dungeon') {
    const dungeon: Dungeon | undefined = getCurrentDungeon(state);
    if (!dungeon) return false;

    const blocker: Entity | undefined = isBlockedByEntity(state.entities, 'dungeon', dungeon.id, target);
    if (blocker && blocker.kind === 'monster') {
      attack(state.player, blocker);
      return true;
    }

    if (!canEnterDungeonTile(dungeon, target)) return false;

    state.player.pos = target;
    return true;
  }

  // Overworld movement supports "run" (dx/dy can be +/-5 via shift). Move step-by-step so collisions work.
  const steps: number = Math.max(Math.abs(dx), Math.abs(dy));
  const stepX: number = dx === 0 ? 0 : dx > 0 ? 1 : -1;
  const stepY: number = dy === 0 ? 0 : dy > 0 ? 1 : -1;

  let moved: boolean = false;

  for (let i: number = 0; i < steps; i++) {
    const next: Point = add(state.player.pos, { x: stepX, y: stepY });
    if (!canEnterOverworldTile(state.overworld, next)) break;
    state.player.pos = next;
    moved = true;

    // Auto-walk cancels if user manually moves.
    state.destination = undefined;
    state.autoPath = undefined;

    const t = state.overworld.getTile(next.x, next.y);
    if (t === 'dungeon') state.log.push('Dungeon entrance found. Press Enter to enter.');
    if (t === 'town') state.log.push('Town found. Press Enter then B/Q.');
  }

  return moved;
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

type LevelUpGains = {
  hp: number;
  attack: number;
  defense: number;
  strength: number;
  agility: number;
  intellect: number;
};

function applyLevelUpGrowth(player: Entity, classType: CharacterClass): LevelUpGains {
  ensureClassAttributes(player, classType);

  const level: number = player.level;
  let gains: LevelUpGains;

  switch (classType) {
    case 'warrior': {
      gains = {
        hp: 6,
        attack: 2,
        defense: level % 2 === 0 ? 1 : 0,
        strength: 2,
        agility: level % 3 === 0 ? 1 : 0,
        intellect: level % 4 === 0 ? 1 : 0
      };
      break;
    }
    case 'rogue': {
      gains = {
        hp: 4,
        attack: 1,
        defense: level % 3 === 0 ? 1 : 0,
        strength: 1,
        agility: 2,
        intellect: level % 2 === 0 ? 1 : 0
      };
      break;
    }
    case 'mage':
    default: {
      gains = {
        hp: 3,
        attack: 1,
        defense: level % 4 === 0 ? 1 : 0,
        strength: level % 4 === 0 ? 1 : 0,
        agility: level % 3 === 0 ? 1 : 0,
        intellect: 2
      };
      break;
    }
  }

  player.maxHp += gains.hp;
  player.baseAttack += gains.attack;
  player.baseDefense += gains.defense;
  player.strength = (player.strength ?? 0) + gains.strength;
  player.agility = (player.agility ?? 0) + gains.agility;
  player.intellect = (player.intellect ?? 0) + gains.intellect;

  return gains;
}

function awardXp(amount: number): void {
  state.player.xp += amount;
  while (state.player.xp >= xpToNextLevel(state.player.level)) {
    state.player.xp -= xpToNextLevel(state.player.level);
    state.player.level += 1;
    const gains: LevelUpGains = applyLevelUpGrowth(state.player, state.playerClass);
    state.player.hp = state.player.maxHp;
    state.log.push(`*** Level up! You are now level ${state.player.level}. ***`);
    const gainParts: string[] = [`+${gains.hp} HP`, `+${gains.attack} Atk`];
    if (gains.defense > 0) gainParts.push(`+${gains.defense} Def`);
    state.log.push(`Gains: ${gainParts.join(', ')}. Str ${state.player.strength} • Agi ${state.player.agility} • Int ${state.player.intellect}.`);
  }
}

function xpToNextLevel(level: number): number {
  return 25 + (level - 1) * 12;
}

function attack(attacker: Entity, defender: Entity): void {
  let atk: number = attacker.baseAttack + getEquippedAttackBonus(attacker);
  let def: number = defender.baseDefense + getEquippedDefenseBonus(defender);
  const originalDef: number = def;

  let damageMultiplier: number = 1;
  let suffix: string = '';
  let playerVerb: string = 'hit';

  if (attacker.kind === 'player') {
    const classType: CharacterClass = state.playerClass;
    ensureClassAttributes(attacker, classType);

    switch (classType) {
      case 'warrior': {
        const strength: number = attacker.strength ?? 0;
        atk += Math.floor(strength / 2);
        playerVerb = 'cleave';
        break;
      }
      case 'rogue': {
        const agility: number = attacker.agility ?? 0;
        atk += Math.floor(agility / 2);
        const critChance: number = Math.min(60, 10 + agility * 4);
        if (state.rng.nextInt(0, 100) < critChance) {
          damageMultiplier = 2;
          playerVerb = 'backstab';
          suffix = ' (critical!)';
        } else {
          playerVerb = 'stab';
        }
        break;
      }
      case 'mage':
      default: {
        const intellect: number = attacker.intellect ?? 0;
        atk += Math.floor(intellect / 2);
        def = Math.floor(def * 0.5);
        if (def < originalDef) suffix = ' (armor melts)';
        playerVerb = 'blast';
        break;
      }
    }
  }

  const roll: number = state.rng.nextInt(0, 5);
  const raw: number = atk + roll;
  let dmg: number = Math.max(1, raw - def);
  dmg = Math.max(1, Math.floor(dmg * damageMultiplier));

  defender.hp -= dmg;

  const defenderHpText: string = `(${Math.max(0, defender.hp)}/${defender.maxHp})`;
  if (attacker.kind === 'player') {
    state.log.push(`You ${playerVerb} ${defender.name} for ${dmg}${suffix}. ${defenderHpText}`);
  } else if (defender.kind === 'player') {
    state.log.push(`${attacker.name} hits you for ${dmg}. ${defenderHpText}`);
  } else {
    state.log.push(`${attacker.name} hits ${defender.name} for ${dmg}. ${defenderHpText}`);
  }

  if (defender.hp <= 0) {
    if (defender.kind === 'player') {
      state.log.push('You fall. Darkness closes in.');
    } else {
      state.log.push(`${defender.name} dies.`);
    }

    if (attacker.kind === 'player') {
      const xp: number = 6 + (defender.baseAttack + defender.baseDefense);
      const gold: number = 2 + state.rng.nextInt(0, 4);
      state.player.gold += gold;
      state.log.push(`You gain ${xp} XP and loot ${gold} gold.`);
      awardXp(xp);

      const currentDepth: number = state.dungeonStack[state.dungeonStack.length - 1]?.depth ?? 0;
      recordKillForQuests(state, currentDepth);
    }
  }
}

function monstersTurn(): void {
  if (state.mode !== 'dungeon') return;

  const dungeon: Dungeon | undefined = getCurrentDungeon(state);
  if (!dungeon) return;

  let visible: Set<string> | undefined;

  if (state.useFov) {
    decayVisibilityToSeen(dungeon);
    visible = computeDungeonFov(dungeon, state.player.pos, 10);
  }

  for (const e of state.entities) {
    if (e.kind !== 'monster') continue;
    if (e.hp <= 0) continue;
    if (e.mapRef.kind !== 'dungeon') continue;
    if (e.mapRef.dungeonId !== dungeon.id) continue;

    const dist: number = manhattan(e.pos, state.player.pos);
    if (dist <= 1) {
      const hpBefore: number = state.player.hp;
      attack(e, state.player);
      if (state.player.hp < hpBefore && state.player.hp > 0) {
        maybeApplyPoisonFromAttacker(e);
      }
      continue;
    }

    const chaseOk: boolean = !state.useFov || (visible ? visible.has(`${e.pos.x},${e.pos.y}`) : true);
    if (dist <= 12 && chaseOk) {
      const next: Point | undefined = nextMonsterStep(e, state.player, dungeon, state.entities);
      if (!next) continue;

      const blocked: Entity | undefined = isBlockedByEntity(state.entities, 'dungeon', dungeon.id, next);
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
  state.mode = 'dungeon';
  state.player.mapRef = { kind: 'dungeon', dungeonId: dungeon.id };
  state.player.pos = { x: dungeon.stairsUp.x, y: dungeon.stairsUp.y };

  state.log.push('You enter the dungeon.');
}

function goDownLevel(): void {
  const current: DungeonStackFrame | undefined = state.dungeonStack[state.dungeonStack.length - 1];
  if (!current) return;

  const nextDepth: number = current.depth + 1;
  const dungeon: Dungeon = ensureDungeonLevel(state, current.baseId, nextDepth, current.entranceWorldPos);

  state.dungeonStack.push({ baseId: current.baseId, depth: nextDepth, entranceWorldPos: current.entranceWorldPos });
  state.player.mapRef = { kind: 'dungeon', dungeonId: dungeon.id };
  state.player.pos = { x: dungeon.stairsUp.x, y: dungeon.stairsUp.y };
  state.log.push(`You descend to depth ${nextDepth}. Theme: ${dungeon.theme}.`);
}

function goUpLevelOrExit(): void {
  if (state.dungeonStack.length <= 1) {
    const top: DungeonStackFrame | undefined = state.dungeonStack[0];
    if (!top) return;

    state.mode = 'overworld';
    state.player.mapRef = { kind: 'overworld' };
    state.player.pos = { x: top.entranceWorldPos.x, y: top.entranceWorldPos.y };
    state.dungeonStack = [];
    state.log.push('You return to the overworld.');
    return;
  }

  state.dungeonStack.pop();
  const prev: DungeonStackFrame = state.dungeonStack[state.dungeonStack.length - 1];
  const dungeonId: string = dungeonLevelId(prev.baseId, prev.depth);
  const dungeon: Dungeon | undefined = state.dungeons.get(dungeonId);
  if (!dungeon) return;

  state.player.mapRef = { kind: 'dungeon', dungeonId };
  state.player.pos = { x: dungeon.stairsDown.x, y: dungeon.stairsDown.y };
  state.log.push(`You ascend to depth ${prev.depth}.`);
}

function setDestination(dest: Point): void {
  if (state.mode !== 'overworld') return;

  const path = aStar(
    state.player.pos,
    dest,
    (p: Point) => canEnterOverworldTile(state.overworld, p),
    (_p: Point) => false,
    20000
  );

  if (!path || path.length < 2) {
    state.log.push('No path found to destination.');
    state.destination = undefined;
    state.autoPath = undefined;
    return;
  }

  state.destination = dest;
  state.autoPath = path;
  state.log.push(`Auto-walk set: ${dest.x}, ${dest.y}. Press any move/space to advance, or C to cancel.`);
}

function syncRendererUi(): void {
  asciiEl.style.display = 'none';
  canvasWrap.style.display = 'block';
}

function render(): void {
  const dungeon: Dungeon | undefined = getCurrentDungeon(state);

  modePill.textContent =
    state.mode === 'overworld'
      ? 'Mode: overworld'
      : `Mode: dungeon (depth ${state.dungeonStack[state.dungeonStack.length - 1]?.depth ?? 0} • ${dungeon?.theme ?? '?'})`;

  renderPill.textContent = `Renderer: PixiJS • FOV: ${state.useFov ? 'on' : 'off'}`;

  if (state.mode === 'dungeon' && dungeon && state.useFov) {
    decayVisibilityToSeen(dungeon);
    computeDungeonFov(dungeon, state.player.pos, 10);
  }

  const classInfo: ClassConfig = CLASS_CONFIG[state.playerClass];
  const atk: number = state.player.baseAttack + getEquippedAttackBonus(state.player);
  const def: number = state.player.baseDefense + getEquippedDefenseBonus(state.player);
  const str: number = state.player.strength ?? 0;
  const agi: number = state.player.agility ?? 0;
  const intl: number = state.player.intellect ?? 0;

  statsEl.innerHTML = `
    <div class="kv"><div><b>${escapeHtml(state.player.name)}</b> <span class="muted">Lvl ${state.player.level}</span></div><div>HP ${state.player.hp}/${state.player.maxHp}</div></div>
    <div class="kv small"><div>Class ${escapeHtml(classInfo.name)}</div><div>Str ${str} • Agi ${agi} • Int ${intl}</div></div>
    <div class="kv small"><div>Atk ${atk}</div><div>Def ${def}</div></div>
    <div class="kv small"><div>XP ${state.player.xp}/${xpToNextLevel(state.player.level)}</div><div>Gold ${state.player.gold}</div></div>
    <div class="kv small"><div>Pos ${state.player.pos.x}, ${state.player.pos.y}</div><div class="muted">Turn ${state.turnCounter}</div></div>
    <div class="kv small"><div class="muted">Status ${(state.player.statusEffects ?? []).map((e) => e.kind + ':' + e.remainingTurns).join(', ') || 'none'}</div><div class="muted">Seed ${state.worldSeed}</div></div>
  `;

  const activeShop: Shop | undefined = isStandingOnTown() ? ensureShopForTown(state, state.player.pos) : undefined;
  if (activeShop) {
    ensureQuestForTown(state, state.player.pos);
    maybeRestockShop(state, activeShop);
  }
  const activeTownId: string | undefined = getActiveTownId();
  panelEl.innerHTML = renderPanelHtml({
    mode: state.activePanel,
    player: state.player,
    items: state.items,
    activeShop,
    canShop: isStandingOnTown(),
    quests: state.quests,
    activeTownId,
    shopCategory: state.shopCategory
  });

  logEl.innerHTML = state.log
    .all()
    .slice(0, 160)
    .map((m) => `<div>• ${escapeHtml(m.text)}</div>`)
    .join('');

  if (state.mapOpen) {
    // Map overlay: render a larger overworld view in ASCII, with destination/path markers.
    asciiEl.style.display = 'block';
    canvasWrap.style.display = 'none';

    const dest: Point | undefined = state.destination ?? { x: state.player.pos.x + state.mapCursor.x, y: state.player.pos.y + state.mapCursor.y };
    asciiEl.textContent = renderOverworldMapAscii(
      {
        overworld: state.overworld,
        player: state.player,
        destination: dest,
        autoPath: state.autoPath,
        items: state.items
      },
      89,
      41
    );

    return;
  }

  asciiEl.style.display = 'none';
  canvasWrap.style.display = 'block';
  canvasRenderer.render(
    {
      mode: state.mode,
      overworld: state.overworld,
      dungeon,
      player: state.player,
      entities: state.entities,
      items: state.items,
      useFov: state.useFov
    },
    PIXI_VIEW_W,
    PIXI_VIEW_H
  );
}

// Panel actions (inventory/shop buttons)
panelEl.addEventListener('click', (e: MouseEvent) => {
  const target: HTMLElement | null = e.target as HTMLElement;
  if (!target) return;
  const act: string | null = target.getAttribute('data-act');
  const itemId: string | null = target.getAttribute('data-item');
  const questId: string | null = target.getAttribute('data-quest');
  if (!act) return;

  if (act === 'use') {
    if (!itemId) return;
    usePotion(itemId);
    render();
    return;
  }
  if (act === 'equipWeapon') {
    if (!itemId) return;
    equipWeapon(itemId);
    render();
    return;
  }
  if (act === 'equipArmor') {
    if (!itemId) return;
    equipArmor(itemId);
    render();
    return;
  }
  if (act === 'drop') {
    if (!itemId) return;
    dropItem(itemId);
    render();
    return;
  }
  if (act === 'buy') {
    if (!itemId) return;
    buyItem(itemId);
    render();
    return;
  }
  if (act === 'sell') {
    if (!itemId) return;
    sellItem(itemId);
    render();
    return;
  }
  if (act === 'shopCat') {
    const cat: string | null = target.getAttribute('data-cat');
    if (cat === 'all' || cat === 'potion' || cat === 'weapon' || cat === 'armor') {
      state.shopCategory = cat;
    }
    render();
    return;
  }
  if (act === 'turnIn') {
    if (questId) {
      turnInQuest(questId);
    }
    render();
    return;
  }
});

function usePotion(itemId: string): void {
  const it: Item | undefined = state.items.find((x) => x.id === itemId);
  if (!it || it.kind !== 'potion') return;
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
  if (!it || it.kind !== 'weapon') return;
  if (!state.player.inventory.includes(itemId)) return;
  state.player.equipment.weaponItemId = itemId;
  state.log.push(`Equipped weapon: ${it.name}.`);
}

function equipArmor(itemId: string): void {
  const it: Item | undefined = state.items.find((x) => x.id === itemId);
  if (!it || it.kind !== 'armor') return;
  if (!state.player.inventory.includes(itemId)) return;
  state.player.equipment.armorItemId = itemId;
  state.log.push(`Equipped armor: ${it.name}.`);
}

function dropItem(itemId: string): void {
  const it: Item | undefined = state.items.find((x) => x.id === itemId);
  if (!it) return;
  if (!state.player.inventory.includes(itemId)) return;

  // Drop only if in dungeon; else just discard (simple for now)
  if (state.mode === 'dungeon') {
    const dungeon: Dungeon | undefined = getCurrentDungeon(state);
    if (dungeon) {
      it.mapRef = { kind: 'dungeon', dungeonId: dungeon.id };
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
    state.log.push('You need to be in town to buy.');
    return;
  }
  const it: Item | undefined = state.items.find((x) => x.id === itemId);
  if (!it) return;

  const price: number = it.value;
  if (state.player.gold < price) {
    state.log.push('Not enough gold.');
    return;
  }

  state.player.gold -= price;
  state.player.inventory.push(it.id);
  state.log.push(`Bought: ${it.name} for ${price}g.`);
}

function sellItem(itemId: string): void {
  if (!isStandingOnTown()) {
    state.log.push('You need to be in town to sell.');
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

function turnInQuest(questId: string): void {
  const townId: string | undefined = getActiveTownId();
  if (!townId) {
    state.log.push('You need to be in town to turn in quests.');
    return;
  }

  const q = state.quests.find((x) => x.id === questId);
  if (!q) return;
  if (q.townId !== townId) {
    state.log.push('That quest belongs to another town.');
    return;
  }
  if (q.turnedIn) return;
  if (!q.completed) {
    state.log.push('Quest is not complete yet.');
    return;
  }

  q.turnedIn = true;
  state.player.gold += q.rewardGold;
  awardXp(q.rewardXp);
  state.log.push(`Quest turned in! +${q.rewardGold}g and +${q.rewardXp} XP.`);
}

function escapeHtml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function keyToAction(e: KeyboardEvent): Action | undefined {
  if (e.key === 'r' || e.key === 'R') return { kind: 'toggleRenderer' };
  if (e.key === 'f' || e.key === 'F') return { kind: 'toggleFov' };
  if (e.key === '?') return { kind: 'help' };

  if (e.key === 'p' || e.key === 'P') return { kind: 'save' };
  if (e.key === 'o' || e.key === 'O') return { kind: 'load' };

  if (e.key === 'i' || e.key === 'I') return { kind: 'toggleInventory' };
  if (e.key === 'b' || e.key === 'B') return { kind: 'toggleShop' };
  if (e.key === 'q' || e.key === 'Q') return { kind: 'toggleQuest' };
  if (e.key === 'm' || e.key === 'M') return { kind: 'toggleMap' };

  if (e.key === 'g' || e.key === 'G' || e.key === ',') return { kind: 'pickup' };

  if (e.key === 'Enter') return { kind: 'use' };
  if (e.key === 'c' || e.key === 'C') return { kind: 'cancelAuto' };
  if (e.key === ' ') return { kind: 'wait' };

  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') return { kind: 'move', dx: 0, dy: -1 * (e.shiftKey ? 5 : 1) };
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') return { kind: 'move', dx: 0, dy: 1 * (e.shiftKey ? 5 : 1) };
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') return { kind: 'move', dx: -1 * (e.shiftKey ? 5 : 1), dy: 0 };
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') return { kind: 'move', dx: 1 * (e.shiftKey ? 5 : 1), dy: 0 };

  return undefined;
}

function handleMapKey(e: KeyboardEvent): void {
  // Cursor is relative to player.
  if (e.key === 'Escape' || e.key === 'm' || e.key === 'M') {
    state.mapOpen = false;
    render();
    return;
  }

  const step: number = e.shiftKey ? 5 : 1;

  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') state.mapCursor.y -= step;
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') state.mapCursor.y += step;
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') state.mapCursor.x -= step;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') state.mapCursor.x += step;

  if (e.key === 'c' || e.key === 'C') {
    state.destination = undefined;
    state.autoPath = undefined;
    state.log.push('Auto-walk canceled.');
  }

  if (e.key === 'Enter') {
    const dest = { x: state.player.pos.x + state.mapCursor.x, y: state.player.pos.y + state.mapCursor.y };
    setDestination(dest);
    state.mapOpen = false;
  }

  render();
}

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (isClassModalVisible()) {
    if (e.key === 'o' || e.key === 'O') {
      e.preventDefault();
      doLoad();
      syncRendererUi();
      render();
    }
    return;
  }
  if (state.mapOpen) {
    e.preventDefault();
    handleMapKey(e);
    return;
  }

  const a: Action | undefined = keyToAction(e);
  if (!a) return;
  e.preventDefault();
  handleAction(a);
});

btnAscii.addEventListener('click', () => {
  state.log.push('ASCII renderer temporarily disabled.');
  render();
});

btnCanvas.addEventListener('click', () => {
  state.rendererMode = 'canvas';
  syncRendererUi();
  render();
});

btnNewSeed.addEventListener('click', () => {
  pendingSeed = Date.now() & 0xffffffff;
  state.log.push(`Preparing new world seed ${pendingSeed}. Choose your class to begin.`);
  showClassModal();
});

btnSave.addEventListener('click', () => {
  doSave();
  render();
});
btnLoad.addEventListener('click', () => {
  doLoad();
  syncRendererUi();
  render();
});

btnInv.addEventListener('click', () => {
  state.activePanel = state.activePanel === 'inventory' ? 'none' : 'inventory';
  render();
});
btnShop.addEventListener('click', () => {
  state.activePanel = state.activePanel === 'shop' ? 'none' : 'shop';
  if (state.activePanel === 'shop' && isStandingOnTown()) ensureShopForTown(state, state.player.pos);
  render();
});

btnMap.addEventListener('click', () => {
  handleAction({ kind: 'toggleMap' });
});

classButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const choice = btn.dataset.class as CharacterClass | undefined;
    if (!choice) return;
    startNewRun(choice);
  });
});

btnLoadFromModal.addEventListener('click', () => {
  doLoad();
  syncRendererUi();
  render();
});

function doSave(): void {
  const dungeons: Dungeon[] = [...state.dungeons.values()];
  const shops: Shop[] = [...state.shops.values()];

  const data: SaveDataV3 = {
    version: 3,
    worldSeed: state.worldSeed,
    mode: state.mode,
    playerId: state.player.id,
    playerClass: state.playerClass,
    entities: state.entities,
    items: state.items,
    dungeons,
    shops,
    entranceReturnPos: state.dungeonStack[0]?.entranceWorldPos,
    activePanel: state.activePanel,
    turnCounter: state.turnCounter,
    quests: state.quests
  };

  saveToLocalStorage(data);
  state.log.push('Saved.');
}

function doLoad(): void {
  const data: SaveDataV3 | undefined = loadFromLocalStorage();
  if (!data) {
    state.log.push('No save found.');
    return;
  }

  const rng: Rng = new Rng(data.worldSeed);
  const overworld: Overworld = new Overworld(data.worldSeed);

  const dungeonsMap: Map<string, Dungeon> = new Map<string, Dungeon>();
  for (const d of data.dungeons) dungeonsMap.set(d.id, d);

  const shopsMap: Map<string, Shop> = new Map<string, Shop>();
  for (const s of data.shops) shopsMap.set(s.id, s);

  const player: Entity | undefined = data.entities.find((e) => e.id === data.playerId);
  if (player && !player.statusEffects) player.statusEffects = [];
  if (!player) {
    state.log.push('Save missing player.');
    return;
  }

  const loadedClass: CharacterClass = data.playerClass ?? player.classType ?? 'warrior';
  ensureClassAttributes(player, loadedClass);

  state = {
    worldSeed: data.worldSeed,
    rng,
    mode: data.mode,
    overworld,
    dungeons: dungeonsMap,
    dungeonStack: rebuildDungeonStackFromPlayer(data, player),
    player,
    playerClass: loadedClass,
    entities: data.entities,
    items: data.items,
    shops: shopsMap,
    rendererMode: state.rendererMode,
    useFov: state.useFov,
    activePanel: (data.activePanel as PanelMode) ?? 'none',
    shopCategory: 'all',
    turnCounter: data.turnCounter ?? 0,
    quests: data.quests ?? [],
    log: new MessageLog(160)
  };

  pendingClass = loadedClass;
  pendingSeed = data.worldSeed;
  hideClassModal();
  state.log.push('Loaded.');
  const loadedCfg: ClassConfig = CLASS_CONFIG[loadedClass];
  state.log.push(`Class: ${loadedCfg.name} • Str ${state.player.strength} • Agi ${state.player.agility} • Int ${state.player.intellect}.`);
}

function rebuildDungeonStackFromPlayer(data: SaveDataV3, player: Entity): DungeonStackFrame[] {
  if (player.mapRef.kind !== 'dungeon') return [];
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
