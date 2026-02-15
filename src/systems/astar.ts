import type { Point } from '../core/types';
import { manhattan, keyPoint, parseKeyPoint } from '../core/util';

export function aStar(
  start: Point,
  goal: Point,
  isWalkable: (p: Point) => boolean,
  isBlocked: (p: Point) => boolean,
  maxIterations: number = 5000,
  stepCost?: (p: Point) => number
): Point[] | undefined {
  const startKey: string = keyPoint(start);
  const goalKey: string = keyPoint(goal);

  const openSet: Set<string> = new Set<string>([startKey]);
  const cameFrom: Map<string, string> = new Map<string, string>();

  const gScore: Map<string, number> = new Map<string, number>();
  gScore.set(startKey, 0);

  const fScore: Map<string, number> = new Map<string, number>();
  fScore.set(startKey, manhattan(start, goal));

  let iterations: number = 0;

  while (openSet.size > 0 && iterations < maxIterations) {
    iterations++;

    let currentKey: string | undefined;
    let currentF: number = Number.POSITIVE_INFINITY;
    for (const k of openSet) {
      const f: number = fScore.get(k) ?? Number.POSITIVE_INFINITY;
      if (f < currentF) {
        currentF = f;
        currentKey = k;
      }
    }
    if (!currentKey) {
      break;
    }

    if (currentKey === goalKey) {
      return reconstructPath(cameFrom, currentKey);
    }

    openSet.delete(currentKey);

    const current: Point | undefined = parseKeyPoint(currentKey);
    if (!current) {
      break;
    }

    const neighbors: Point[] = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 }
    ];

    for (const nb of neighbors) {
      if (!isWalkable(nb)) {
        continue;
      }

      const nbKey: string = keyPoint(nb);
      if (isBlocked(nb) && nbKey !== goalKey) {
        continue;
      }

      const moveCost: number = Math.max(0.0001, stepCost ? stepCost(nb) : 1);
      if (!Number.isFinite(moveCost)) {
        continue;
      }

      const tentativeG: number = (gScore.get(currentKey) ?? Number.POSITIVE_INFINITY) + moveCost;
      const nbG: number = gScore.get(nbKey) ?? Number.POSITIVE_INFINITY;

      if (tentativeG < nbG) {
        cameFrom.set(nbKey, currentKey);
        gScore.set(nbKey, tentativeG);
        fScore.set(nbKey, tentativeG + manhattan(nb, goal));
        openSet.add(nbKey);
      }
    }
  }

  return undefined;
}

function reconstructPath(cameFrom: Map<string, string>, currentKey: string): Point[] {
  const totalPathKeys: string[] = [currentKey];
  while (cameFrom.has(currentKey)) {
    currentKey = cameFrom.get(currentKey)!;
    totalPathKeys.push(currentKey);
  }
  totalPathKeys.reverse();

  const pts: Point[] = [];
  for (const k of totalPathKeys) {
    const p: Point | undefined = parseKeyPoint(k);
    if (p) {
      pts.push(p);
    }
  }
  return pts;
}
