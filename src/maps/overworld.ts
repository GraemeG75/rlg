import { hash2D } from '../core/hash';
import type { OverworldTile, Point } from '../core/types';

const TERRAIN_SALT: number = 0x51a1c0de;
const FOREST_SALT: number = 0x1f2e3d4c;
const ROAD_SALT: number = 0x7f4a7c2d;
const POI_SALT: number = 0x35c3a1b5;
const CAVE_SALT: number = 0x2d7bb3a9;
const DUNGEON_ID_SALT: number = 0x6a09e667;
const DUNGEON_SEED_SALT: number = 0xbb67ae85;
const CAVE_ID_SALT: number = 0x2f7c3f5b;
const CAVE_SEED_SALT: number = 0x8d2a4d19;
const TOWN_ID_SALT: number = 0x3c6ef372;
const TOWN_SEED_SALT: number = 0x9b05688c;

const TERRAIN_PRIMARY_FREQ: number = 36;
const TERRAIN_SECONDARY_FREQ: number = 12;
const TERRAIN_SECONDARY_WEIGHT: number = 0.35;
const WATER_LEVEL: number = 0.28;
const WATER_DEEP_LEVEL: number = 0.16;
const MOUNTAIN_LEVEL: number = 0.7;
const MOUNTAIN_SNOW_LEVEL: number = 0.82;
const FOREST_PRIMARY_FREQ: number = 18;
const FOREST_SECONDARY_FREQ: number = 7;
const FOREST_SECONDARY_WEIGHT: number = 0.45;
const FOREST_DENSITY: number = 0.52;
const ROAD_NOISE_FREQ: number = 18;
const ROAD_BAND_WIDTH: number = 0.03;
const CAVE_PERIOD: number = 1024;
const CAVE_SPAWN_THRESHOLD: number = 4;
const POI_PERIOD: number = 2048;
const DUNGEON_SPAWN_THRESHOLD: number = 3;
const TOWN_RADIUS: number = 1;

/**
 * Procedural overworld map generator and tile query interface.
 */
export class Overworld {
  private readonly seed: number;

  /**
   * Creates a new overworld generator.
   * @param seed The world seed.
   */
  public constructor(seed: number) {
    this.seed = seed | 0;
  }

  /**
   * Returns the overworld tile at the given coordinates.
   * @param x The x coordinate.
   * @param y The y coordinate.
   * @returns The tile id.
   */
  public getTile(x: number, y: number): OverworldTile {
    let tile: OverworldTile = this.baseTerrainAt(x, y);

    const townCenter: { x: number; y: number } | undefined = this.findTownCenter(x, y);
    if (townCenter) {
      return this.townTileAt(x, y, townCenter);
    }

    // Roads are laid on traversable terrain to speed travel between features.
    if (tile !== 'water' && tile !== 'water_deep' && tile !== 'mountain' && tile !== 'mountain_snow') {
      const roadNoise: number = this.sampleNoise(ROAD_SALT, x, y, ROAD_NOISE_FREQ);
      if (Math.abs(roadNoise - 0.5) < ROAD_BAND_WIDTH) {
        tile = 'road';
      }
    }

    // Caves appear along mountain edges on walkable tiles.
    if (tile !== 'water' && tile !== 'water_deep' && tile !== 'mountain' && tile !== 'mountain_snow') {
      if (this.isMountainAdjacent(x, y)) {
        const caveNoise: number = this.sampleFine(CAVE_SALT, x, y) % CAVE_PERIOD;
        if (caveNoise < CAVE_SPAWN_THRESHOLD) {
          tile = 'cave';
        }
      }
    }

    // Points of interest override base terrain but only spawn on walkable tiles.
    if (tile !== 'water' && tile !== 'water_deep' && tile !== 'mountain' && tile !== 'mountain_snow' && tile !== 'cave') {
      const poiNoise: number = this.sampleFine(POI_SALT, x, y) % POI_PERIOD;
      if (poiNoise < DUNGEON_SPAWN_THRESHOLD) {
        tile = 'dungeon';
      }
    }

    return tile;
  }

  /**
   * Checks whether an overworld tile is walkable.
   * @param tile The overworld tile.
   * @returns True if walkable.
   */
  public isWalkable(tile: OverworldTile): boolean {
    if (tile === 'water' || tile === 'water_deep') {
      return false;
    }
    if (tile === 'mountain' || tile === 'mountain_snow') {
      return false;
    }
    return true;
  }

  /**
   * Returns the movement cost for the given overworld tile.
   * @param tile The overworld tile.
   * @returns The movement cost.
   */
  public movementCost(tile: OverworldTile): number {
    if (tile === 'road') {
      return 1;
    }
    if (tile === 'grass' || tile === 'town' || tile === 'dungeon' || tile === 'cave') {
      return 1.4;
    }
    if (tile === 'town_shop' || tile === 'town_tavern' || tile === 'town_smith' || tile === 'town_house') {
      return 1.4;
    }
    if (tile === 'forest') {
      return 2.2;
    }
    if (tile === 'mountain' || tile === 'mountain_snow' || tile === 'water' || tile === 'water_deep') {
      return Number.POSITIVE_INFINITY;
    }
    return 1.4;
  }

  /**
   * Returns the town center for the given coordinate if within a town.
   * @param x The x coordinate.
   * @param y The y coordinate.
   * @returns The town center point, or undefined.
   */
  public getTownCenter(x: number, y: number): { x: number; y: number } | undefined {
    return this.findTownCenter(x, y);
  }

  /**
   * Computes the base terrain tile prior to POI overlays.
   * @param x The x coordinate.
   * @param y The y coordinate.
   * @returns The base terrain tile.
   */
  private baseTerrainAt(x: number, y: number): OverworldTile {
    const terrainValue: number = this.sampleOctave(TERRAIN_SALT, x, y, TERRAIN_PRIMARY_FREQ, TERRAIN_SECONDARY_FREQ, TERRAIN_SECONDARY_WEIGHT);
    if (terrainValue < WATER_DEEP_LEVEL) {
      return 'water_deep';
    }
    if (terrainValue < WATER_LEVEL) {
      return 'water';
    }
    if (terrainValue > MOUNTAIN_SNOW_LEVEL) {
      return 'mountain_snow';
    }
    if (terrainValue > MOUNTAIN_LEVEL) {
      return 'mountain';
    }
    const forestValue: number = this.sampleOctave(FOREST_SALT, x, y, FOREST_PRIMARY_FREQ, FOREST_SECONDARY_FREQ, FOREST_SECONDARY_WEIGHT);
    return forestValue < FOREST_DENSITY ? 'forest' : 'grass';
  }

  /**
   * Checks whether a tile is adjacent to mountains.
   * @param x The x coordinate.
   * @param y The y coordinate.
   * @returns True if adjacent to mountains.
   */
  private isMountainAdjacent(x: number, y: number): boolean {
    const neighbors: Point[] = [
      { x: x + 1, y },
      { x: x - 1, y },
      { x, y: y + 1 },
      { x, y: y - 1 }
    ];

    for (const n of neighbors) {
      const base: OverworldTile = this.baseTerrainAt(n.x, n.y);
      if (base === 'mountain' || base === 'mountain_snow') {
        return true;
      }
    }
    return false;
  }

  /**
   * Finds the town center that influences the given coordinate.
   * @param x The x coordinate.
   * @param y The y coordinate.
   * @returns The town center, or undefined.
   */
  private findTownCenter(x: number, y: number): { x: number; y: number } | undefined {
    for (let dy: number = -TOWN_RADIUS; dy <= TOWN_RADIUS; dy++) {
      for (let dx: number = -TOWN_RADIUS; dx <= TOWN_RADIUS; dx++) {
        const cx: number = x + dx;
        const cy: number = y + dy;
        const poiNoise: number = this.sampleFine(POI_SALT, cx, cy) % POI_PERIOD;
        if (poiNoise !== 0) {
          continue;
        }
        const base: OverworldTile = this.baseTerrainAt(cx, cy);
        if (base === 'water' || base === 'water_deep' || base === 'mountain' || base === 'mountain_snow') {
          continue;
        }
        return { x: cx, y: cy };
      }
    }
    return undefined;
  }

  /**
   * Returns the town tile for a coordinate given its center.
   * @param x The x coordinate.
   * @param y The y coordinate.
   * @param center The town center.
   * @returns The town tile.
   */
  private townTileAt(x: number, y: number, center: { x: number; y: number }): OverworldTile {
    const dx: number = x - center.x;
    const dy: number = y - center.y;
    const buildings: OverworldTile[] = this.townBuildingSet(this.townVariant(center.x, center.y));

    // 2x2 town layout
    if (dx === 0 && dy === 0) {
      return buildings[0]; // top-left
    }
    if (dx === 1 && dy === 0) {
      return buildings[1]; // top-right
    }
    if (dx === 0 && dy === 1) {
      return buildings[2]; // bottom-left
    }
    if (dx === 1 && dy === 1) {
      return buildings[3]; // bottom-right
    }

    return this.baseTerrainAt(x, y);
  }

  /**
   * Computes a variant id for a town layout.
   * @param x The town center x coordinate.
   * @param y The town center y coordinate.
   * @returns The variant id.
   */
  private townVariant(x: number, y: number): number {
    return this.sampleFine(POI_SALT ^ 0x21d4, x, y) % 8;
  }

  /**
   * Rotates a point around the origin by a 90-degree step.
   * @param dx The x offset.
   * @param dy The y offset.
   * @param rot The rotation steps (0-3).
   * @returns The rotated point.
   */
  private rotate(dx: number, dy: number, rot: number): { x: number; y: number } {
    switch (rot) {
      case 1:
        return { x: -dy, y: dx };
      case 2:
        return { x: -dx, y: -dy };
      case 3:
        return { x: dy, y: -dx };
      default:
        return { x: dx, y: dy };
    }
  }

  /**
   * Returns the building tile order for a town variant.
   * @param variant The variant id.
   * @returns The building tiles array.
   */
  private townBuildingSet(variant: number): OverworldTile[] {
    switch (variant % 4) {
      case 1:
        return ['town_tavern', 'town_shop', 'town_house', 'town_smith'];
      case 2:
        return ['town_smith', 'town_house', 'town_shop', 'town_tavern'];
      case 3:
        return ['town_house', 'town_smith', 'town_tavern', 'town_shop'];
      default:
        return ['town_shop', 'town_tavern', 'town_smith', 'town_house'];
    }
  }

  /**
   * Samples a deterministic noise value at tile resolution.
   * @param salt The salt value.
   * @param x The x coordinate.
   * @param y The y coordinate.
   * @returns The noise sample.
   */
  private sampleFine(salt: number, x: number, y: number): number {
    return hash2D((this.seed ^ salt) | 0, x, y) >>> 0;
  }

  /**
   * Samples two noise octaves and blends them.
   * @param salt The salt value.
   * @param x The x coordinate.
   * @param y The y coordinate.
   * @param primaryFreq The primary frequency.
   * @param secondaryFreq The secondary frequency.
   * @param secondaryWeight The blend weight.
   * @returns The blended noise value.
   */
  private sampleOctave(salt: number, x: number, y: number, primaryFreq: number, secondaryFreq: number, secondaryWeight: number): number {
    const base: number = this.sampleNoise(salt, x, y, primaryFreq);
    if (secondaryWeight <= 0) {
      return base;
    }
    const detailSalt: number = salt ^ 0x9e3779b9;
    const detail: number = this.sampleNoise(detailSalt, x, y, secondaryFreq);
    return this.lerp(base, detail, Math.min(1, Math.max(0, secondaryWeight)));
  }

  /**
   * Samples interpolated noise at a given frequency.
   * @param salt The salt value.
   * @param x The x coordinate.
   * @param y The y coordinate.
   * @param frequency The noise frequency.
   * @returns The noise value.
   */
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

  /**
   * Samples the noise lattice at integer coordinates.
   * @param salt The salt value.
   * @param lx The lattice x coordinate.
   * @param ly The lattice y coordinate.
   * @returns The lattice noise value.
   */
  private sampleLattice(salt: number, lx: number, ly: number): number {
    const hashed: number = hash2D((this.seed ^ salt) | 0, lx, ly) >>> 0;
    return hashed / 0xffffffff;
  }

  /**
   * Smooths a value for interpolation.
   * @param t The interpolation factor.
   * @returns The smoothed factor.
   */
  private fade(t: number): number {
    return t * t * (3 - 2 * t);
  }

  /**
   * Linearly interpolates between two values.
   * @param a The start value.
   * @param b The end value.
   * @param t The interpolation factor.
   * @returns The interpolated value.
   */
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }
}

/**
 * Builds a dungeon base id from a world position.
 * @param worldSeed The world seed.
 * @param x The x coordinate.
 * @param y The y coordinate.
 * @returns The dungeon base id.
 */
export function dungeonBaseIdFromWorldPos(worldSeed: number, x: number, y: number): string {
  return formatId('dungeon', worldSeed, x, y, DUNGEON_ID_SALT);
}

/**
 * Builds a full dungeon level id from a base id and depth.
 * @param baseId The dungeon base id.
 * @param depth The dungeon depth.
 * @returns The dungeon level id.
 */
export function dungeonLevelId(baseId: string, depth: number): string {
  return `${baseId}:L${depth}`;
}

/**
 * Computes the dungeon seed for a world position.
 * @param worldSeed The world seed.
 * @param x The x coordinate.
 * @param y The y coordinate.
 * @returns The dungeon seed.
 */
export function dungeonSeedFromWorldPos(worldSeed: number, x: number, y: number): number {
  return hash2D((worldSeed ^ DUNGEON_SEED_SALT) | 0, x, y);
}

/**
 * Builds a cave base id from a world position.
 * @param worldSeed The world seed.
 * @param x The x coordinate.
 * @param y The y coordinate.
 * @returns The cave base id.
 */
export function caveBaseIdFromWorldPos(worldSeed: number, x: number, y: number): string {
  return formatId('cave', worldSeed, x, y, CAVE_ID_SALT);
}

/**
 * Computes the cave seed for a world position.
 * @param worldSeed The world seed.
 * @param x The x coordinate.
 * @param y The y coordinate.
 * @returns The cave seed.
 */
export function caveSeedFromWorldPos(worldSeed: number, x: number, y: number): number {
  return hash2D((worldSeed ^ CAVE_SEED_SALT) | 0, x, y);
}

/**
 * Builds a town id from a world position.
 * @param worldSeed The world seed.
 * @param x The x coordinate.
 * @param y The y coordinate.
 * @returns The town id.
 */
export function townIdFromWorldPos(worldSeed: number, x: number, y: number): string {
  return formatId('town', worldSeed, x, y, TOWN_ID_SALT);
}

/**
 * Computes the town seed for a world position.
 * @param worldSeed The world seed.
 * @param x The x coordinate.
 * @param y The y coordinate.
 * @returns The town seed.
 */
export function townSeedFromWorldPos(worldSeed: number, x: number, y: number): number {
  return hash2D((worldSeed ^ TOWN_SEED_SALT) | 0, x, y);
}

/**
 * Formats a stable id for a POI based on world coordinates.
 * @param prefix The id prefix.
 * @param worldSeed The world seed.
 * @param x The x coordinate.
 * @param y The y coordinate.
 * @param salt The hashing salt.
 * @returns The formatted id.
 */
function formatId(prefix: string, worldSeed: number, x: number, y: number, salt: number): string {
  const hash: number = hash2D((worldSeed ^ salt) | 0, x, y) >>> 0;
  const suffix: string = hash.toString(16).padStart(8, '0');
  return `${prefix}_${x}_${y}_${suffix}`;
}
