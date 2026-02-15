import type { Point } from "../core/types";
import { clamp } from "../core/util";
import type { Dungeon } from "../maps/dungeon";
import { getDungeonTile, isDungeonOpaque, setVisibility } from "../maps/dungeon";

function bresenhamLine(a: Point, b: Point): Point[] {
  const points: Point[] = [];
  let x0: number = a.x;
  let y0: number = a.y;
  const x1: number = b.x;
  const y1: number = b.y;

  const dx: number = Math.abs(x1 - x0);
  const dy: number = Math.abs(y1 - y0);
  const sx: number = x0 < x1 ? 1 : -1;
  const sy: number = y0 < y1 ? 1 : -1;

  let err: number = dx - dy;

  while (true) {
    points.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;

    const e2: number = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }

  return points;
}

export function decayVisibilityToSeen(dungeon: Dungeon): void {
  for (let i: number = 0; i < dungeon.visibility.length; i++) {
    if (dungeon.visibility[i] === "visible") dungeon.visibility[i] = "seen";
  }
}

export function computeDungeonFov(dungeon: Dungeon, origin: Point, radius: number): Set<string> {
  const visible: Set<string> = new Set<string>();

  const minX: number = clamp(origin.x - radius, 0, dungeon.width - 1);
  const maxX: number = clamp(origin.x + radius, 0, dungeon.width - 1);
  const minY: number = clamp(origin.y - radius, 0, dungeon.height - 1);
  const maxY: number = clamp(origin.y + radius, 0, dungeon.height - 1);

  const r2: number = radius * radius;

  for (let y: number = minY; y <= maxY; y++) {
    for (let x: number = minX; x <= maxX; x++) {
      const dx: number = x - origin.x;
      const dy: number = y - origin.y;
      if ((dx * dx + dy * dy) > r2) continue;

      const line: Point[] = bresenhamLine(origin, { x, y });

      for (let i: number = 0; i < line.length; i++) {
        const p: Point = line[i];
        if (p.x < 0 || p.y < 0 || p.x >= dungeon.width || p.y >= dungeon.height) break;

        const k: string = `${p.x},${p.y}`;
        visible.add(k);
        setVisibility(dungeon, p.x, p.y, "visible");

        if (p.x === x && p.y === y) break;

        const tile = getDungeonTile(dungeon, p.x, p.y);
        if (isDungeonOpaque(tile) && !(p.x === origin.x && p.y === origin.y)) break;
      }
    }
  }

  return visible;
}
