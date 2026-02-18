import type { Point } from '../types';
import { TileVisibility } from '../types/enums';
import { clamp } from '../core/util';
import type { Dungeon } from '../maps/dungeon';
import { getDungeonTile, isDungeonOpaque, setVisibility } from '../maps/dungeon';

/**
 * Field-of-view helper that encapsulates dungeon visibility calculations.
 */
export class FieldOfView {
  public constructor(private readonly dungeon: Dungeon) {}

  /**
   * Converts all visible tiles in the tracked dungeon to seen tiles.
   */
  public decayVisibility(): void {
    for (let i: number = 0; i < this.dungeon.visibility.length; i++) {
      if (this.dungeon.visibility[i] === TileVisibility.Visible) {
        this.dungeon.visibility[i] = TileVisibility.Seen;
      }
    }
  }

  /**
   * Computes field of view and marks visible tiles.
   * @param origin The origin point.
   * @param radius The view radius.
   * @returns A set of visible tile keys.
   */
  public compute(origin: Point, radius: number): Set<string> {
    const visible: Set<string> = new Set<string>();

    const minX: number = clamp(origin.x - radius, 0, this.dungeon.width - 1);
    const maxX: number = clamp(origin.x + radius, 0, this.dungeon.width - 1);
    const minY: number = clamp(origin.y - radius, 0, this.dungeon.height - 1);
    const maxY: number = clamp(origin.y + radius, 0, this.dungeon.height - 1);

    const r2: number = radius * radius;

    for (let y: number = minY; y <= maxY; y++) {
      for (let x: number = minX; x <= maxX; x++) {
        const dx: number = x - origin.x;
        const dy: number = y - origin.y;
        if (dx * dx + dy * dy > r2) {
          continue;
        }

        const line: Point[] = FieldOfView.bresenhamLine(origin, { x, y });

        for (let i: number = 0; i < line.length; i++) {
          const p: Point = line[i];
          if (p.x < 0 || p.y < 0 || p.x >= this.dungeon.width || p.y >= this.dungeon.height) {
            break;
          }

          const key: string = `${p.x},${p.y}`;
          visible.add(key);
          setVisibility(this.dungeon, p.x, p.y, TileVisibility.Visible);

          if (p.x === x && p.y === y) {
            break;
          }

          const tile = getDungeonTile(this.dungeon, p.x, p.y);
          if (isDungeonOpaque(tile) && !(p.x === origin.x && p.y === origin.y)) {
            break;
          }
        }
      }
    }

    return visible;
  }

  /**
   * Computes a Bresenham line between two points.
   */
  private static bresenhamLine(a: Point, b: Point): Point[] {
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
      if (x0 === x1 && y0 === y1) {
        break;
      }

      const e2: number = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }

    return points;
  }
}
