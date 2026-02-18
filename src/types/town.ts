import type { Point } from './common';
import type { TownTile } from './enums';

export type Town = {
  id: string;
  width: number;
  height: number;
  tiles: TownTile[];
  entrance: Point;
};
