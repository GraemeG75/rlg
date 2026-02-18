import type { Point, OverworldNavOptions } from '../types';
import { OverworldTile } from '../types/enums';
import { AStarPathfinder } from './astar';
import { canEnterOverworldTile } from './rules';
import type { Overworld } from '../maps/overworld';

const TOWN_TILES: ReadonlySet<OverworldTile> = new Set<OverworldTile>([
  OverworldTile.Town,
  OverworldTile.TownShop,
  OverworldTile.TownTavern,
  OverworldTile.TownSmith,
  OverworldTile.TownHouse
]);

/**
 * Navigation helper that encapsulates pathfinding and tile queries on the overworld map.
 */
export class OverworldNavigator {
  private readonly pathfinder: AStarPathfinder = new AStarPathfinder();

  public constructor(private readonly overworld: Overworld) {}

  /**
   * Finds the nearest matching overworld tile within a radius.
   * @param from The start point.
   * @param wanted The desired tile kind.
   * @param maxRadius The maximum search radius.
   * @returns The matching point, or undefined if not found.
   */
  public findNearestTile(from: Point, wanted: OverworldTile, maxRadius: number): Point | undefined {
    for (let radius: number = 1; radius <= maxRadius; radius++) {
      for (let dx: number = -radius; dx <= radius; dx++) {
        const dy: number = radius - Math.abs(dx);

        const candidates: Point[] =
          dy === 0
            ? [{ x: from.x + dx, y: from.y }]
            : [
                { x: from.x + dx, y: from.y + dy },
                { x: from.x + dx, y: from.y - dy }
              ];

        for (const p of candidates) {
          const tile: OverworldTile = this.overworld.getTile(p.x, p.y);
          const matchesTown: boolean = wanted === OverworldTile.Town && TOWN_TILES.has(tile);
          if (!matchesTown && tile !== wanted) {
            continue;
          }
          if (!canEnterOverworldTile(this.overworld, p)) {
            continue;
          }
          return p;
        }
      }
    }

    return undefined;
  }

  /**
   * Finds a path on the overworld using A* with optional road bias.
   * @param from The start point.
   * @param to The goal point.
   * @param options Navigation options.
   * @returns The path, or undefined if not found.
   */
  public findPath(from: Point, to: Point, options: OverworldNavOptions): Point[] | undefined {
    const cost = (p: Point): number => {
      const tile: OverworldTile = this.overworld.getTile(p.x, p.y);
      let value: number = this.overworld.movementCost(tile);
      if (!Number.isFinite(value)) {
        return 9999;
      }
      if (options.preferRoads && tile === OverworldTile.Road) {
        value *= 0.35;
      }
      return Math.max(0.0001, value);
    };

    const path = this.pathfinder.findPath(from, to, {
      isWalkable: (p: Point) => canEnterOverworldTile(this.overworld, p),
      isBlocked: () => false,
      maxIterations: options.maxNodes,
      stepCost: cost
    });

    return path ?? undefined;
  }

  /**
   * Converts a canvas click into a world point centered on the player.
   * @param canvas The canvas element.
   * @param e The mouse event.
   * @param playerPos The player position.
   * @param viewWidthTiles The view width in tiles.
   * @param viewHeightTiles The view height in tiles.
   * @param tileSizePx The tile size in pixels.
   * @returns The world point.
   */
  public static canvasClickToWorldPoint(
    canvas: HTMLCanvasElement,
    e: MouseEvent,
    playerPos: Point,
    viewWidthTiles: number,
    viewHeightTiles: number,
    tileSizePx: number
  ): Point {
    const rect: DOMRect = canvas.getBoundingClientRect();
    const localX: number = e.clientX - rect.left;
    const localY: number = e.clientY - rect.top;

    const halfW: number = Math.floor(viewWidthTiles / 2);
    const halfH: number = Math.floor(viewHeightTiles / 2);

    const tileX: number = Math.floor(localX / tileSizePx);
    const tileY: number = Math.floor(localY / tileSizePx);

    const dx: number = tileX - halfW;
    const dy: number = tileY - halfH;

    return { x: playerPos.x + dx, y: playerPos.y + dy };
  }
}
