/**
 * Overworld generator variant with NO impassable terrain.
 *
 * - No rivers/water
 * - No mountains
 * - Keeps: grass/forest/road + towns + dungeons
 *
 * Intended as a drop-in replacement for the existing Overworld class.
 * If your current Overworld API differs slightly, adjust the class name/exports
 * to match and keep getTile(x,y).
 */

export type OverworldTile =
  | "grass"
  | "forest"
  | "road"
  | "town"
  | "dungeon";

export class Overworld {
  private readonly seed: number;

  public constructor(seed: number) {
    this.seed = seed | 0;
  }

  public getTile(x: number, y: number): OverworldTile {
    // deterministic pseudo-noise based on coordinates + seed
    const n: number = hash2D(x, y, this.seed);

    // POIs (rare)
    // Using separate hashes so distribution stays stable
    const poi: number = hash2D(x, y, this.seed ^ 0x51a1c0de);
    if (poi % 1100 === 0) return "town";
    if (poi % 900 === 0) return "dungeon";

    // Roads (common-ish, create long-ish stripes)
    // This is a simple "grid-ish" road network so navigation feels good.
    const road: number = hash2D(Math.floor(x / 9), Math.floor(y / 9), this.seed ^ 0x1f2e3d4c);
    if (road % 7 === 0) return "road";

    // Biome-ish: forest vs grass
    if ((n & 0xff) < 70) return "forest";
    return "grass";
  }
}

function hash2D(x: number, y: number, seed: number): number {
  // xorshift-ish integer hash; fast and deterministic
  let h: number = seed ^ (x * 374761393) ^ (y * 668265263);
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  // keep signed 32-bit
  return h | 0;
}
