import { Rng } from "../core/rng";
import type { DungeonTile, Point, TileVisibility } from "../core/types";

export type Dungeon = {
  id: string;
  baseId: string;
  depth: number;

  width: number;
  height: number;

  tiles: DungeonTile[];         // width*height
  visibility: TileVisibility[]; // width*height (fog of war)

  stairsUp: Point;
  stairsDown: Point;
};

function idx(x: number, y: number, width: number): number {
  return y * width + x;
}

export function isDungeonWalkable(tile: DungeonTile): boolean {
  return tile === "floor" || tile === "stairsUp" || tile === "stairsDown";
}

export function isDungeonOpaque(tile: DungeonTile): boolean {
  return tile === "wall";
}

export function getDungeonTile(dungeon: Dungeon, x: number, y: number): DungeonTile {
  return dungeon.tiles[idx(x, y, dungeon.width)];
}

export function setDungeonTile(dungeon: Dungeon, x: number, y: number, tile: DungeonTile): void {
  dungeon.tiles[idx(x, y, dungeon.width)] = tile;
}

export function getVisibility(dungeon: Dungeon, x: number, y: number): TileVisibility {
  return dungeon.visibility[idx(x, y, dungeon.width)];
}

export function setVisibility(dungeon: Dungeon, x: number, y: number, v: TileVisibility): void {
  dungeon.visibility[idx(x, y, dungeon.width)] = v;
}

export function generateDungeon(dungeonId: string, baseId: string, depth: number, seed: number, width: number, height: number): Dungeon {
  const rng: Rng = new Rng(seed);

  const tiles: DungeonTile[] = new Array<DungeonTile>(width * height).fill("wall");
  const visibility: TileVisibility[] = new Array<TileVisibility>(width * height).fill("unseen");

  const rooms: { x: number; y: number; w: number; h: number; center: Point }[] = [];

  function carveRoom(rx: number, ry: number, rw: number, rh: number): void {
    for (let y: number = ry; y < ry + rh; y++) {
      for (let x: number = rx; x < rx + rw; x++) {
        tiles[idx(x, y, width)] = "floor";
      }
    }
  }

  function carveCorridor(a: Point, b: Point): void {
    let x: number = a.x;
    let y: number = a.y;

    if (rng.nextInt(0, 2) === 0) {
      while (x !== b.x) {
        tiles[idx(x, y, width)] = "floor";
        x += x < b.x ? 1 : -1;
      }
      while (y !== b.y) {
        tiles[idx(x, y, width)] = "floor";
        y += y < b.y ? 1 : -1;
      }
    } else {
      while (y !== b.y) {
        tiles[idx(x, y, width)] = "floor";
        y += y < b.y ? 1 : -1;
      }
      while (x !== b.x) {
        tiles[idx(x, y, width)] = "floor";
        x += x < b.x ? 1 : -1;
      }
    }

    tiles[idx(x, y, width)] = "floor";
  }

  const maxRooms: number = 14;

  for (let i: number = 0; i < maxRooms; i++) {
    const rw: number = rng.nextInt(6, 13);
    const rh: number = rng.nextInt(5, 11);
    const rx: number = rng.nextInt(1, Math.max(2, width - rw - 1));
    const ry: number = rng.nextInt(1, Math.max(2, height - rh - 1));

    let overlaps: boolean = false;
    for (const r of rooms) {
      const pad: number = 1;
      if (
        rx < r.x + r.w + pad &&
        rx + rw + pad > r.x &&
        ry < r.y + r.h + pad &&
        ry + rh + pad > r.y
      ) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;

    carveRoom(rx, ry, rw, rh);
    const center: Point = { x: rx + Math.floor(rw / 2), y: ry + Math.floor(rh / 2) };
    rooms.push({ x: rx, y: ry, w: rw, h: rh, center });

    if (rooms.length > 1) {
      carveCorridor(rooms[rooms.length - 2].center, center);
    }
  }

  const stairsUp: Point = rooms.length > 0 ? rooms[0].center : { x: 2, y: 2 };
  const stairsDown: Point = rooms.length > 0 ? rooms[rooms.length - 1].center : { x: width - 3, y: height - 3 };

  tiles[idx(stairsUp.x, stairsUp.y, width)] = "stairsUp";
  tiles[idx(stairsDown.x, stairsDown.y, width)] = "stairsDown";

  return { id: dungeonId, baseId, depth, width, height, tiles, visibility, stairsUp, stairsDown };
}

export function randomFloorPoint(dungeon: Dungeon, seed: number): Point {
  const rng: Rng = new Rng(seed);
  for (let i: number = 0; i < 2000; i++) {
    const x: number = rng.nextInt(1, dungeon.width - 1);
    const y: number = rng.nextInt(1, dungeon.height - 1);
    const t: DungeonTile = dungeon.tiles[idx(x, y, dungeon.width)];
    if (t === "floor") return { x, y };
  }
  return { x: dungeon.stairsDown.x, y: dungeon.stairsDown.y };
}
