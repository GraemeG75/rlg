import type { Entity, Point, Dungeon } from '../types';
import { EntityKind, Mode, DungeonTile } from '../types/enums';
import type { GameStateForMonsters } from '../interfaces';
import { getDungeonTile, randomFloorPoint } from '../maps/dungeon';
import { Rng } from '../core/rng';
import { MONSTER_SCALING, MONSTER_SPAWN } from '../core/const';
import { StoryManager } from '../game/story';

export class MonsterManager {
  constructor(private storyManager: StoryManager) {}

  public spawnMonstersInDungeon(state: GameStateForMonsters, dungeon: Dungeon, seed: number): void {
    const monsterCount: number = MONSTER_SPAWN.baseCount + Math.min(MONSTER_SPAWN.depthCap, dungeon.depth * MONSTER_SPAWN.depthMultiplier);
    const rng: Rng = new Rng(seed ^ 0xbeef);
    const playerLevel: number = state.player.level;

    for (let i: number = 0; i < monsterCount; i++) {
      const p: Point = randomFloorPoint(dungeon, seed + 1000 + i * 17);

      const roll: number = rng.nextInt(0, 100);
      const monster = this.createMonsterForDepth(dungeon.depth, roll, state.rng, dungeon.id, i, p, playerLevel);

      state.entities.push(monster);
    }
  }

  public spawnAmbushMonsters(state: GameStateForMonsters, dungeon: Dungeon, seed: number, playerLevel: number): void {
    const rng: Rng = new Rng(seed ^ 0xa51d);
    const desired: number = Math.max(
      MONSTER_SPAWN.ambushMin,
      Math.min(MONSTER_SPAWN.ambushMax, MONSTER_SPAWN.ambushBase + Math.floor(playerLevel / MONSTER_SPAWN.ambushLevelDiv))
    );
    const depth: number = Math.max(1, Math.floor((playerLevel + 1) / 2));
    const used: Set<string> = new Set<string>();

    for (let i: number = 0; i < desired; i++) {
      let spawn: Point | undefined;
      for (let attempts: number = 0; attempts < 200; attempts++) {
        const candidate: Point = randomFloorPoint(dungeon, seed + 2000 + i * 37 + attempts * 11);
        if ((candidate.x === dungeon.stairsUp.x && candidate.y === dungeon.stairsUp.y) || used.has(`${candidate.x},${candidate.y}`)) {
          continue;
        }
        spawn = candidate;
        used.add(`${candidate.x},${candidate.y}`);
        break;
      }
      if (!spawn) {
        const fx: number = Math.max(1, Math.min(dungeon.width - 2, dungeon.stairsUp.x + (i % 2 === 0 ? 1 : -1)));
        const fy: number = Math.max(1, Math.min(dungeon.height - 2, dungeon.stairsUp.y));
        if (getDungeonTile(dungeon, fx, fy) === DungeonTile.Wall) {
          const altY: number = Math.max(1, Math.min(dungeon.height - 2, dungeon.stairsUp.y + (i % 2 === 0 ? 1 : -1)));
          spawn = { x: dungeon.stairsUp.x, y: altY };
        } else {
          spawn = { x: fx, y: fy };
        }
        used.add(`${spawn.x},${spawn.y}`);
      }

      const roll: number = rng.nextInt(0, 100);
      const monster: Entity = this.createMonsterForDepth(depth, roll, state.rng, dungeon.id, i, spawn, playerLevel);
      state.entities.push(monster);
    }
  }

  public createMonsterForDepth(depth: number, roll: number, rng: Rng, dungeonId: string, i: number, p: Point, playerLevel: number): Entity {
    // Monster level scales primarily with player level, with some depth influence
    const weightedLevel = Math.floor(playerLevel * MONSTER_SCALING.levelPlayerWeight + depth * (1 - MONSTER_SCALING.levelPlayerWeight));
    const monsterLevel: number = Math.max(MONSTER_SCALING.levelMinimum, weightedLevel);

    // Slime: weak, Orc: tougher, Goblin: baseline
    if (roll < 30) {
      const stats = MONSTER_SCALING.hp.slime;
      const attackStats = MONSTER_SCALING.attack.slime;
      const defenseStats = MONSTER_SCALING.defense.slime;
      const hp = Math.floor(stats.base + monsterLevel * stats.perLevel);
      const attack = Math.floor(attackStats.base + monsterLevel * attackStats.perLevel);
      const defense = Math.floor(defenseStats.base + monsterLevel * defenseStats.perLevel);

      return {
        id: `m_${dungeonId}_${i}`,
        kind: EntityKind.Monster,
        name: this.storyManager.monsterName('slime'),
        glyph: 's',
        pos: p,
        mapRef: { kind: Mode.Dungeon, dungeonId },
        hp,
        maxHp: hp,
        baseAttack: attack,
        baseDefense: defense,
        level: Math.max(monsterLevel, 2),
        xp: 0,
        gold: 0,
        inventory: [],
        equipment: {}
      };
    }

    if (roll < 60) {
      const stats = MONSTER_SCALING.hp.goblin;
      const attackStats = MONSTER_SCALING.attack.goblin;
      const defenseStats = MONSTER_SCALING.defense.goblin;
      const hp = Math.floor(stats.base + monsterLevel * stats.perLevel);
      const attack = Math.floor(attackStats.base + monsterLevel * attackStats.perLevel);
      const defense = Math.floor(defenseStats.base + monsterLevel * defenseStats.perLevel);

      return {
        id: `m_${dungeonId}_${i}`,
        kind: EntityKind.Monster,
        name: this.storyManager.monsterName('goblin'),
        glyph: 'g',
        pos: p,
        mapRef: { kind: Mode.Dungeon, dungeonId },
        hp,
        maxHp: hp,
        baseAttack: attack,
        baseDefense: defense,
        level: Math.max(monsterLevel, 3),
        xp: 0,
        gold: 0,
        inventory: [],
        equipment: {}
      };
    }

    if (depth >= 2 && roll < 82) {
      const stats = MONSTER_SCALING.hp.wraith;
      const attackStats = MONSTER_SCALING.attack.wraith;
      const defenseStats = MONSTER_SCALING.defense.wraith;
      const hp = Math.floor(stats.base + monsterLevel * stats.perLevel);
      const attack = Math.floor(attackStats.base + monsterLevel * attackStats.perLevel);
      const defense = Math.floor(defenseStats.base + monsterLevel * defenseStats.perLevel);

      return {
        id: `m_${dungeonId}_${i}`,
        kind: EntityKind.Monster,
        name: this.storyManager.monsterName('wraith'),
        glyph: 'w',
        pos: p,
        mapRef: { kind: Mode.Dungeon, dungeonId },
        hp,
        maxHp: hp,
        baseAttack: attack,
        baseDefense: defense,
        level: Math.max(monsterLevel, 4),
        xp: 0,
        gold: 0,
        inventory: [],
        equipment: {},
        statusEffects: [],
        specialCooldown: 0
      };
    }

    const stats = MONSTER_SCALING.hp.orc;
    const attackStats = MONSTER_SCALING.attack.orc;
    const defenseStats = MONSTER_SCALING.defense.orc;
    const hp = Math.floor(stats.base + monsterLevel * stats.perLevel);
    const attack = Math.floor(attackStats.base + monsterLevel * attackStats.perLevel);
    const defense = Math.floor(defenseStats.base + monsterLevel * defenseStats.perLevel);

    return {
      id: `m_${dungeonId}_${i}`,
      kind: EntityKind.Monster,
      name: this.storyManager.monsterName('orc'),
      glyph: 'O',
      pos: p,
      mapRef: { kind: Mode.Dungeon, dungeonId },
      hp,
      maxHp: hp,
      baseAttack: attack,
      baseDefense: defense,
      level: Math.max(monsterLevel, 5),
      xp: 0,
      gold: 0,
      inventory: [],
      equipment: {},
      statusEffects: []
    };
  }
}
