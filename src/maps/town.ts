import type { Point, Town } from '../types';
import { TownTile } from '../types/enums';

// Re-export for backwards compatibility
export type { Town };

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
 * Returns the town tile at the given coordinate.
 * @param town The town instance.
 * @param x The x coordinate.
 * @param y The y coordinate.
 * @returns The town tile.
 */
export function getTownTile(town: Town, x: number, y: number): TownTile {
  return town.tiles[idx(x, y, town.width)];
}

/**
 * Checks whether a town tile is walkable.
 * @param tile The town tile.
 * @returns True if walkable.
 */
export function isTownWalkable(tile: TownTile): boolean {
  return tile !== TownTile.Wall;
}

/**
 * Generates a town layout with fixed buildings.
 * @param townId The town id.
 * @param seed The RNG seed.
 * @returns The generated town.
 */
export function generateTown(townId: string, seed: number): Town {
  const width: number = 21;
  const height: number = 15;
  const tiles: TownTile[] = new Array<TownTile>(width * height).fill(TownTile.Wall);

  for (let y: number = 1; y < height - 1; y++) {
    for (let x: number = 1; x < width - 1; x++) {
      tiles[idx(x, y, width)] = TownTile.Floor;
    }
  }

  const gateX: number = Math.floor(width / 2);
  const gateY: number = height - 2;
  tiles[idx(gateX, gateY, width)] = TownTile.Gate;

  const centerX: number = Math.floor(width / 2);
  const centerY: number = Math.floor(height / 2);
  for (let y: number = centerY - 1; y <= centerY + 1; y++) {
    for (let x: number = centerX - 1; x <= centerX + 1; x++) {
      tiles[idx(x, y, width)] = TownTile.Square;
    }
  }

  for (let y: number = gateY; y >= centerY - 1; y--) {
    tiles[idx(centerX, y, width)] = TownTile.Road;
  }
  for (let x: number = 2; x <= width - 3; x++) {
    tiles[idx(x, centerY, width)] = TownTile.Road;
  }

  placeBuilding(tiles, width, 2, 2, 4, 3, TownTile.Shop);
  placeBuilding(tiles, width, width - 6, 2, 4, 3, TownTile.Tavern);
  placeBuilding(tiles, width, 2, height - 5, 4, 3, TownTile.Smith);
  placeBuilding(tiles, width, width - 6, height - 5, 4, 3, TownTile.House);

  return {
    id: townId,
    width,
    height,
    tiles,
    entrance: { x: gateX, y: gateY }
  };
}

/**
 * Places a rectangular building in the tile grid.
 * @param tiles The town tile grid.
 * @param width The town width.
 * @param x0 The top-left x coordinate.
 * @param y0 The top-left y coordinate.
 * @param w The building width.
 * @param h The building height.
 * @param kind The tile kind for the building.
 */
function placeBuilding(tiles: TownTile[], width: number, x0: number, y0: number, w: number, h: number, kind: TownTile): void {
  for (let y: number = y0; y < y0 + h; y++) {
    for (let x: number = x0; x < x0 + w; x++) {
      tiles[idx(x, y, width)] = kind;
    }
  }
}
