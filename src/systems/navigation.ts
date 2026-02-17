import type { Point } from '../core/types';
import type { Overworld } from '../maps/overworld';
import { aStar } from './astar';
import { canEnterOverworldTile } from './rules';

export type OverworldNavOptions = {
  preferRoads: boolean;
  maxNodes: number;
};

/**
 * Finds the nearest matching overworld tile within a radius.
 * @param overworld The overworld instance.
 * @param from The start point.
 * @param wanted The desired tile kind.
 * @param maxRadius The maximum search radius.
 * @returns The matching point, or undefined if not found.
 */
export function findNearestOverworldTile(
  overworld: Overworld,
  from: Point,
  wanted: 'town' | 'dungeon' | 'cave',
  maxRadius: number
): Point | undefined {
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
        const tile: string = overworld.getTile(p.x, p.y);
        const matchesTown: boolean = wanted === 'town' && (tile === 'town' || tile.startsWith('town_'));
        if (!matchesTown && tile !== wanted) {
          continue;
        }
        if (!canEnterOverworldTile(overworld, p)) {
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
 * @param overworld The overworld instance.
 * @param from The start point.
 * @param to The goal point.
 * @param options Navigation options.
 * @returns The path, or undefined if not found.
 */
export function findOverworldPath(overworld: Overworld, from: Point, to: Point, options: OverworldNavOptions): Point[] | undefined {
  const cost = (p: Point): number => {
    if (!options.preferRoads) {
      return 1;
    }
    const tile: string = overworld.getTile(p.x, p.y);
    if (tile === 'road') {
      return 0.35;
    }
    if (tile.startsWith('town_')) {
      return 0.8;
    }
    if (tile === 'grass') {
      return 1.0;
    }
    if (tile === 'forest') {
      return 1.4;
    }
    if (tile === 'mountain' || tile === 'mountain_snow') {
      return 9999;
    }
    if (tile === 'water' || tile === 'water_deep') {
      return 9999;
    }
    // towns/dungeons/caves should be reachable, treat like grass
    return 1.0;
  };

  const path = aStar(
    from,
    to,
    (p: Point) => canEnterOverworldTile(overworld, p),
    (_p: Point) => false,
    options.maxNodes,
    cost
  );

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
export function canvasClickToWorldPoint(
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
