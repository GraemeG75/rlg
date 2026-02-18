import type { Point } from './common';

export type OverworldNavOptions = {
  preferRoads: boolean;
  maxNodes: number;
};

export type AStarCostFn = (p: Point) => number;

export type AStarSearchOptions = {
  isWalkable: (p: Point) => boolean;
  isBlocked?: (p: Point) => boolean;
  stepCost?: AStarCostFn;
  maxIterations?: number;
};
