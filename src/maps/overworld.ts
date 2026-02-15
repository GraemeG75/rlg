import { hash2D } from '../core/hash';
import type { OverworldTile } from '../core/types';

const TERRAIN_SALT: number = 0x51a1c0de;
const FOREST_SALT: number = 0x1f2e3d4c;
const ROAD_SALT: number = 0x7f4a7c2d;
const POI_SALT: number = 0x35c3a1b5;
const DUNGEON_ID_SALT: number = 0x6a09e667;
const DUNGEON_SEED_SALT: number = 0xbb67ae85;
const TOWN_ID_SALT: number = 0x3c6ef372;

const TERRAIN_PRIMARY_FREQ: number = 36;
const TERRAIN_SECONDARY_FREQ: number = 12;
const TERRAIN_SECONDARY_WEIGHT: number = 0.35;
const WATER_LEVEL: number = 0.28;
const MOUNTAIN_LEVEL: number = 0.7;
const FOREST_PRIMARY_FREQ: number = 18;
const FOREST_SECONDARY_FREQ: number = 7;
const FOREST_SECONDARY_WEIGHT: number = 0.45;
const FOREST_DENSITY: number = 0.52;
const ROAD_NOISE_FREQ: number = 18;
const ROAD_BAND_WIDTH: number = 0.06;
const POI_PERIOD: number = 4096;

export class Overworld {
  private readonly seed: number;

  public constructor(seed: number) {
    this.seed = seed | 0;
  }

  public getTile(x: number, y: number): OverworldTile {
    const terrainValue: number = this.sampleOctave(TERRAIN_SALT, x, y, TERRAIN_PRIMARY_FREQ, TERRAIN_SECONDARY_FREQ, TERRAIN_SECONDARY_WEIGHT);

    let tile: OverworldTile;
    if (terrainValue < WATER_LEVEL) {
      tile = 'water';
    } else if (terrainValue > MOUNTAIN_LEVEL) {
      tile = 'mountain';
    } else {
      const forestValue: number = this.sampleOctave(FOREST_SALT, x, y, FOREST_PRIMARY_FREQ, FOREST_SECONDARY_FREQ, FOREST_SECONDARY_WEIGHT);
      tile = forestValue < FOREST_DENSITY ? 'forest' : 'grass';
    }

    // Roads are laid on traversable terrain to speed travel between features.
    if (tile !== 'water' && tile !== 'mountain') {
      const roadNoise: number = this.sampleNoise(ROAD_SALT, x, y, ROAD_NOISE_FREQ);
      if (Math.abs(roadNoise - 0.5) < ROAD_BAND_WIDTH) {
        tile = 'road';
      }
    }

    // Points of interest override base terrain but only spawn on walkable tiles.
    if (tile !== 'water' && tile !== 'mountain') {
      const poiNoise: number = this.sampleFine(POI_SALT, x, y) % POI_PERIOD;
      if (poiNoise === 0) {
        tile = 'town';
      } else if (poiNoise === 1) {
        tile = 'dungeon';
      }
    }

    return tile;
  }

  public isWalkable(tile: OverworldTile): boolean {
    if (tile === 'water') {
      return false;
    }
    if (tile === 'mountain') {
      return false;
    }
    return true;
  }

  public movementCost(tile: OverworldTile): number {
    if (tile === 'road') {
      return 1;
    }
    if (tile === 'grass' || tile === 'town' || tile === 'dungeon') {
      return 1.4;
    }
    if (tile === 'forest') {
      return 2.2;
    }
    if (tile === 'mountain' || tile === 'water') {
      return Number.POSITIVE_INFINITY;
    }
    return 1.4;
  }

  private sampleFine(salt: number, x: number, y: number): number {
    return hash2D((this.seed ^ salt) | 0, x, y) >>> 0;
  }

  private sampleOctave(salt: number, x: number, y: number, primaryFreq: number, secondaryFreq: number, secondaryWeight: number): number {
    const base: number = this.sampleNoise(salt, x, y, primaryFreq);
    if (secondaryWeight <= 0) {
      return base;
    }
    const detailSalt: number = salt ^ 0x9e3779b9;
    const detail: number = this.sampleNoise(detailSalt, x, y, secondaryFreq);
    return this.lerp(base, detail, Math.min(1, Math.max(0, secondaryWeight)));
  }

  private sampleNoise(salt: number, x: number, y: number, frequency: number): number {
    const freq: number = Math.max(1, frequency);
    const fx: number = x / freq;
    const fy: number = y / freq;

    const x0: number = Math.floor(fx);
    const y0: number = Math.floor(fy);
    const tx: number = fx - x0;
    const ty: number = fy - y0;

    const v00: number = this.sampleLattice(salt, x0, y0);
    const v10: number = this.sampleLattice(salt, x0 + 1, y0);
    const v01: number = this.sampleLattice(salt, x0, y0 + 1);
    const v11: number = this.sampleLattice(salt, x0 + 1, y0 + 1);

    const fadeX: number = this.fade(tx);
    const fadeY: number = this.fade(ty);

    const ix0: number = this.lerp(v00, v10, fadeX);
    const ix1: number = this.lerp(v01, v11, fadeX);

    return this.lerp(ix0, ix1, fadeY);
  }

  private sampleLattice(salt: number, lx: number, ly: number): number {
    const hashed: number = hash2D((this.seed ^ salt) | 0, lx, ly) >>> 0;
    return hashed / 0xffffffff;
  }

  private fade(t: number): number {
    return t * t * (3 - 2 * t);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }
}

export function dungeonBaseIdFromWorldPos(worldSeed: number, x: number, y: number): string {
  return formatId('dungeon', worldSeed, x, y, DUNGEON_ID_SALT);
}

export function dungeonLevelId(baseId: string, depth: number): string {
  return `${baseId}:L${depth}`;
}

export function dungeonSeedFromWorldPos(worldSeed: number, x: number, y: number): number {
  return hash2D((worldSeed ^ DUNGEON_SEED_SALT) | 0, x, y);
}

export function townIdFromWorldPos(worldSeed: number, x: number, y: number): string {
  return formatId('town', worldSeed, x, y, TOWN_ID_SALT);
}

function formatId(prefix: string, worldSeed: number, x: number, y: number, salt: number): string {
  const hash: number = hash2D((worldSeed ^ salt) | 0, x, y) >>> 0;
  const suffix: string = hash.toString(16).padStart(8, '0');
  return `${prefix}_${x}_${y}_${suffix}`;
}
