import type { Point, TownTile } from '../core/types';

export type Town = {
  id: string;
  width: number;
  height: number;
  tiles: TownTile[];
  entrance: Point;
};

function idx(x: number, y: number, width: number): number {
  return y * width + x;
}

export function getTownTile(town: Town, x: number, y: number): TownTile {
  return town.tiles[idx(x, y, town.width)];
}

export function isTownWalkable(tile: TownTile): boolean {
  return tile !== 'wall';
}

export function generateTown(townId: string, seed: number): Town {
  const width: number = 21;
  const height: number = 15;
  const tiles: TownTile[] = new Array<TownTile>(width * height).fill('wall');

  for (let y: number = 1; y < height - 1; y++) {
    for (let x: number = 1; x < width - 1; x++) {
      tiles[idx(x, y, width)] = 'floor';
    }
  }

  const gateX: number = Math.floor(width / 2);
  const gateY: number = height - 2;
  tiles[idx(gateX, gateY, width)] = 'gate';

  const centerX: number = Math.floor(width / 2);
  const centerY: number = Math.floor(height / 2);
  for (let y: number = centerY - 1; y <= centerY + 1; y++) {
    for (let x: number = centerX - 1; x <= centerX + 1; x++) {
      tiles[idx(x, y, width)] = 'square';
    }
  }

  for (let y: number = gateY; y >= centerY - 1; y--) {
    tiles[idx(centerX, y, width)] = 'road';
  }
  for (let x: number = 2; x <= width - 3; x++) {
    tiles[idx(x, centerY, width)] = 'road';
  }

  placeBuilding(tiles, width, 2, 2, 4, 3, 'shop');
  placeBuilding(tiles, width, width - 6, 2, 4, 3, 'tavern');
  placeBuilding(tiles, width, 2, height - 5, 4, 3, 'smith');
  placeBuilding(tiles, width, width - 6, height - 5, 4, 3, 'house');

  return {
    id: townId,
    width,
    height,
    tiles,
    entrance: { x: gateX, y: gateY }
  };
}

function placeBuilding(tiles: TownTile[], width: number, x0: number, y0: number, w: number, h: number, kind: TownTile): void {
  for (let y: number = y0; y < y0 + h; y++) {
    for (let x: number = x0; x < x0 + w; x++) {
      tiles[idx(x, y, width)] = kind;
    }
  }
}
