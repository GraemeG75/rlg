import { Rng } from '../core/rng';
import type { Point, Dungeon, DungeonGenerationConfig, AmbushArenaConfig } from '../types';
import { DungeonTile, TileVisibility, DungeonTheme, DungeonLayout } from '../types/enums';

// Re-export for backwards compatibility
export type { Dungeon, DungeonGenerationConfig, AmbushArenaConfig };
export { DungeonTheme, DungeonLayout };

type Room = { x: number; y: number; w: number; h: number; center: Point };

/**
 * Converts 2D coordinates to a 1D index.
 * @param x The x coordinate.
 * @param y The y coordinate.
 * @param width The grid width.
 * @returns The 1D index.
 */
function idx(x: number, y: number, width: number): number {
  return y * width + x;
}

/**
 * Checks whether a dungeon tile is walkable.
 * @param tile The dungeon tile.
 * @returns True if walkable.
 */
export function isDungeonWalkable(tile: DungeonTile): boolean {
  return tile === DungeonTile.Floor || tile === DungeonTile.BossFloor || tile === DungeonTile.StairsUp || tile === DungeonTile.StairsDown;
}

/**
 * Checks whether a dungeon tile blocks line of sight.
 * @param tile The dungeon tile.
 * @returns True if opaque.
 */
export function isDungeonOpaque(tile: DungeonTile): boolean {
  return tile === DungeonTile.Wall;
}

/**
 * Returns the dungeon tile at the given coordinate.
 * @param dungeon The dungeon instance.
 * @param x The x coordinate.
 * @param y The y coordinate.
 * @returns The dungeon tile.
 */
export function getDungeonTile(dungeon: Dungeon, x: number, y: number): DungeonTile {
  return dungeon.tiles[idx(x, y, dungeon.width)];
}

/**
 * Returns the visibility state for a tile.
 * @param dungeon The dungeon instance.
 * @param x The x coordinate.
 * @param y The y coordinate.
 * @returns The visibility state.
 */
export function getVisibility(dungeon: Dungeon, x: number, y: number): TileVisibility {
  return dungeon.visibility[idx(x, y, dungeon.width)];
}

/**
 * Sets the visibility state for a tile.
 * @param dungeon The dungeon instance.
 * @param x The x coordinate.
 * @param y The y coordinate.
 * @param v The visibility state to set.
 */
export function setVisibility(dungeon: Dungeon, x: number, y: number, v: TileVisibility): void {
  dungeon.visibility[idx(x, y, dungeon.width)] = v;
}

export class DungeonGenerator {
  /**
   * Creates a new dungeon generator instance.
   * @param config The dungeon generation configuration.
   */
  public constructor(private readonly config: DungeonGenerationConfig) {}

  /**
   * Generates a dungeon layout based on the configuration.
   * @returns The generated dungeon.
   */
  public generate(): Dungeon {
    switch (this.config.layout) {
      case DungeonLayout.Caves:
        return this.generateCaveLayout();
      case DungeonLayout.Maze:
        return this.generateMazeLayout();
      default:
        return this.generateRoomLayout();
    }
  }

  /**
   * Generates a dungeon layout with rooms and corridors.
   * @returns The generated dungeon layout.
   */
  private generateRoomLayout(): Dungeon {
    const { dungeonId, baseId, depth, seed, width, height } = this.config;
    const rng: Rng = new Rng(seed);
    const tiles: DungeonTile[] = new Array<DungeonTile>(width * height).fill(DungeonTile.Wall);
    const visibility: TileVisibility[] = new Array<TileVisibility>(width * height).fill(TileVisibility.Unseen);
    const rooms: Room[] = [];

    const carveRoom = (x: number, y: number, w: number, h: number): void => {
      for (let yy: number = y; yy < y + h; yy++) {
        for (let xx: number = x; xx < x + w; xx++) {
          tiles[idx(xx, yy, width)] = DungeonTile.Floor;
        }
      }
    };

    const carveCorridor = (a: Point, b: Point): void => {
      let cx: number = a.x;
      let cy: number = a.y;

      if (rng.nextInt(0, 2) === 0) {
        while (cx !== b.x) {
          tiles[idx(cx, cy, width)] = DungeonTile.Floor;
          cx += cx < b.x ? 1 : -1;
        }
        while (cy !== b.y) {
          tiles[idx(cx, cy, width)] = DungeonTile.Floor;
          cy += cy < b.y ? 1 : -1;
        }
      } else {
        while (cy !== b.y) {
          tiles[idx(cx, cy, width)] = DungeonTile.Floor;
          cy += cy < b.y ? 1 : -1;
        }
        while (cx !== b.x) {
          tiles[idx(cx, cy, width)] = DungeonTile.Floor;
          cx += cx < b.x ? 1 : -1;
        }
      }

      tiles[idx(cx, cy, width)] = DungeonTile.Floor;
    };

    const maxRooms: number = 14;
    for (let i: number = 0; i < maxRooms; i += 1) {
      const rw: number = rng.nextInt(6, 13);
      const rh: number = rng.nextInt(5, 11);
      const rx: number = rng.nextInt(1, Math.max(2, width - rw - 1));
      const ry: number = rng.nextInt(1, Math.max(2, height - rh - 1));

      let overlaps: boolean = false;
      for (const r of rooms) {
        const pad: number = 1;
        if (rx < r.x + r.w + pad && rx + rw + pad > r.x && ry < r.y + r.h + pad && ry + rh + pad > r.y) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) {
        continue;
      }

      carveRoom(rx, ry, rw, rh);
      const center: Point = { x: rx + Math.floor(rw / 2), y: ry + Math.floor(rh / 2) };
      rooms.push({ x: rx, y: ry, w: rw, h: rh, center });

      if (rooms.length > 1) {
        carveCorridor(rooms[rooms.length - 2].center, center);
      }
    }

    const stairsUp: Point = rooms.length > 0 ? rooms[0].center : { x: 2, y: 2 };
    const stairsDown: Point = rooms.length > 0 ? rooms[rooms.length - 1].center : { x: width - 3, y: height - 3 };

    const bossRoom: Room | undefined = depth >= 3 && rooms.length > 0 ? rooms[rooms.length - 1] : undefined;

    tiles[idx(stairsUp.x, stairsUp.y, width)] = DungeonTile.StairsUp;
    tiles[idx(stairsDown.x, stairsDown.y, width)] = DungeonTile.StairsDown;

    if (bossRoom) {
      for (let y: number = bossRoom.y; y < bossRoom.y + bossRoom.h; y++) {
        for (let x: number = bossRoom.x; x < bossRoom.x + bossRoom.w; x++) {
          if ((x === stairsUp.x && y === stairsUp.y) || (x === stairsDown.x && y === stairsDown.y)) {
            continue;
          }
          const t: DungeonTile = tiles[idx(x, y, width)];
          if (t === DungeonTile.Floor) {
            tiles[idx(x, y, width)] = DungeonTile.BossFloor;
          }
        }
      }
    }

    const theme: DungeonTheme = this.pickTheme(depth);

    return {
      id: dungeonId,
      baseId,
      depth,
      theme,
      layout: this.config.layout,
      width,
      height,
      tiles,
      visibility,
      stairsUp,
      stairsDown,
      bossRoom: bossRoom ? { ...bossRoom } : undefined
    };
  }

  /**
   * Generates a dungeon layout with a maze.
   * @returns The generated dungeon layout.
   */
  private generateMazeLayout(): Dungeon {
    const { dungeonId, baseId, depth, seed, width, height } = this.config;
    const rng: Rng = new Rng(seed ^ 0x4a7c92d3);
    const tiles: DungeonTile[] = new Array<DungeonTile>(width * height).fill(DungeonTile.Wall);
    const visibility: TileVisibility[] = new Array<TileVisibility>(width * height).fill(TileVisibility.Unseen);

    // Generate maze using recursive backtracking
    const visited: Set<string> = new Set<string>();
    const directions: Array<[number, number]> = [
      [0, -2], // Up
      [2, 0], // Right
      [0, 2], // Down
      [-2, 0] // Left
    ];

    const carvePassage = (x: number, y: number): void => {
      visited.add(`${x},${y}`);
      tiles[idx(x, y, width)] = DungeonTile.Floor;

      // Shuffle directions for randomness
      const shuffled = directions.map((d) => d).sort(() => rng.nextInt(0, 2) - 1);

      for (const [dx, dy] of shuffled) {
        const nx: number = x + dx;
        const ny: number = y + dy;

        if (nx > 0 && nx < width - 1 && ny > 0 && ny < height - 1 && !visited.has(`${nx},${ny}`)) {
          // Carve passage between cells
          tiles[idx(x + dx / 2, y + dy / 2, width)] = DungeonTile.Floor;
          carvePassage(nx, ny);
        }
      }
    };

    // Start maze generation from a random odd position
    const startX: number = 1 + rng.nextInt(0, Math.floor((width - 2) / 2)) * 2;
    const startY: number = 1 + rng.nextInt(0, Math.floor((height - 2) / 2)) * 2;
    carvePassage(startX, startY);

    // Find all floor tiles
    const floors: Point[] = [];
    for (let y: number = 1; y < height - 1; y++) {
      for (let x: number = 1; x < width - 1; x++) {
        if (tiles[idx(x, y, width)] === DungeonTile.Floor) {
          floors.push({ x, y });
        }
      }
    }

    // Place stairs at far corners
    const stairsUp: Point = floors.length > 0 ? floors[0] : { x: 1, y: 1 };
    let stairsDown: Point = stairsUp;

    if (floors.length > 1) {
      let maxDist: number = 0;
      for (const floor of floors) {
        const dist: number = Math.abs(floor.x - stairsUp.x) + Math.abs(floor.y - stairsUp.y);
        if (dist > maxDist) {
          maxDist = dist;
          stairsDown = floor;
        }
      }
    }

    tiles[idx(stairsUp.x, stairsUp.y, width)] = DungeonTile.StairsUp;
    tiles[idx(stairsDown.x, stairsDown.y, width)] = DungeonTile.StairsDown;

    const theme: DungeonTheme = this.pickTheme(depth);

    return {
      id: dungeonId,
      baseId,
      depth,
      theme,
      layout: this.config.layout,
      width,
      height,
      tiles,
      visibility,
      stairsUp,
      stairsDown,
      bossRoom: undefined
    };
  }

  /**
   * Generates the layout for a cave dungeon.
   * @returns The generated dungeon layout.
   */
  private generateCaveLayout(): Dungeon {
    const { dungeonId, baseId, depth, seed, width, height } = this.config;
    const rng: Rng = new Rng(seed ^ 0x6d2b79f5);
    const tiles: DungeonTile[] = new Array<DungeonTile>(width * height).fill(DungeonTile.Wall);
    const visibility: TileVisibility[] = new Array<TileVisibility>(width * height).fill(TileVisibility.Unseen);

    for (let y: number = 1; y < height - 1; y++) {
      for (let x: number = 1; x < width - 1; x++) {
        tiles[idx(x, y, width)] = rng.nextInt(0, 100) < 45 ? DungeonTile.Wall : DungeonTile.Floor;
      }
    }

    for (let i: number = 0; i < 4; i += 1) {
      const next: DungeonTile[] = tiles.slice();
      for (let y: number = 1; y < height - 1; y++) {
        for (let x: number = 1; x < width - 1; x++) {
          let walls: number = 0;
          for (let oy: number = -1; oy <= 1; oy++) {
            for (let ox: number = -1; ox <= 1; ox++) {
              if (ox === 0 && oy === 0) {
                continue;
              }
              if (tiles[idx(x + ox, y + oy, width)] === DungeonTile.Wall) {
                walls += 1;
              }
            }
          }
          next[idx(x, y, width)] = walls >= 5 ? DungeonTile.Wall : DungeonTile.Floor;
        }
      }
      for (let y: number = 1; y < height - 1; y++) {
        for (let x: number = 1; x < width - 1; x++) {
          tiles[idx(x, y, width)] = next[idx(x, y, width)];
        }
      }
    }

    const floors: Point[] = [];
    for (let y: number = 1; y < height - 1; y++) {
      for (let x: number = 1; x < width - 1; x++) {
        if (tiles[idx(x, y, width)] === DungeonTile.Floor) {
          floors.push({ x, y });
        }
      }
    }

    if (floors.length === 0) {
      const cx: number = Math.floor(width / 2);
      const cy: number = Math.floor(height / 2);
      for (let y: number = cy - 2; y <= cy + 2; y++) {
        for (let x: number = cx - 2; x <= cx + 2; x++) {
          tiles[idx(x, y, width)] = DungeonTile.Floor;
          floors.push({ x, y });
        }
      }
    }

    const stairsUp: Point = floors[rng.nextInt(0, floors.length)];
    let stairsDown: Point = stairsUp;
    for (let i: number = 0; i < 60; i += 1) {
      const candidate: Point = floors[rng.nextInt(0, floors.length)];
      const dist: number = Math.abs(candidate.x - stairsUp.x) + Math.abs(candidate.y - stairsUp.y);
      if (dist > Math.max(6, Math.floor((width + height) * 0.2))) {
        stairsDown = candidate;
        break;
      }
      stairsDown = candidate;
    }

    tiles[idx(stairsUp.x, stairsUp.y, width)] = DungeonTile.StairsUp;
    tiles[idx(stairsDown.x, stairsDown.y, width)] = DungeonTile.StairsDown;

    return {
      id: dungeonId,
      baseId,
      depth,
      theme: DungeonTheme.Caves,
      layout: this.config.layout,
      width,
      height,
      tiles,
      visibility,
      stairsUp,
      stairsDown,
      bossRoom: undefined
    };
  }

  /**
   * Selects a dungeon theme based on depth.
   * @param depth The dungeon depth.
   * @returns The chosen theme.
   */

  private pickTheme(depth: number): DungeonTheme {
    if (depth < 3) {
      return DungeonTheme.Ruins;
    }
    if (depth < 6) {
      return DungeonTheme.Caves;
    }
    return DungeonTheme.Crypt;
  }
}

/**
 * Picks a random walkable floor point within the dungeon.
 * @param dungeon The dungeon instance.
 * @param seed The RNG seed.
 * @returns A floor point.
 */
export function randomFloorPoint(dungeon: Dungeon, seed: number): Point {
  const rng: Rng = new Rng(seed);
  for (let i: number = 0; i < 2000; i++) {
    const x: number = rng.nextInt(1, dungeon.width - 1);
    const y: number = rng.nextInt(1, dungeon.height - 1);
    const t: DungeonTile = dungeon.tiles[idx(x, y, dungeon.width)];
    if (t === DungeonTile.Floor || t === DungeonTile.BossFloor) {
      return { x, y };
    }
  }
  return { x: dungeon.stairsDown.x, y: dungeon.stairsDown.y };
}

export function generateAmbushArena(config: AmbushArenaConfig): Dungeon {
  const width: number = Math.max(12, config.width ?? 12);
  const height: number = Math.max(12, config.height ?? 12);
  const theme: DungeonTheme = config.theme ?? DungeonTheme.Ruins;
  const tiles: DungeonTile[] = new Array<DungeonTile>(width * height).fill(DungeonTile.Wall);
  const visibility: TileVisibility[] = new Array<TileVisibility>(width * height).fill(TileVisibility.Unseen);

  const innerStartX: number = Math.floor(width / 2) - 3;
  const innerEndX: number = Math.floor(width / 2) + 3;
  const innerStartY: number = Math.floor(height / 2) - 3;
  const innerEndY: number = Math.floor(height / 2) + 3;

  for (let y: number = innerStartY; y <= innerEndY; y++) {
    for (let x: number = innerStartX; x <= innerEndX; x++) {
      tiles[idx(x, y, width)] = DungeonTile.Floor;
    }
  }

  const center: Point = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
  tiles[idx(center.x, center.y, width)] = DungeonTile.StairsUp;

  const down: Point = { x: center.x, y: Math.min(height - 2, center.y + 3) };

  return {
    id: config.dungeonId,
    baseId: config.baseId,
    depth: config.depth,
    theme,
    layout: DungeonLayout.Rooms,
    isAmbush: true,
    ambushCleared: false,
    width,
    height,
    tiles,
    visibility,
    stairsUp: center,
    stairsDown: down,
    bossRoom: undefined
  };
}
