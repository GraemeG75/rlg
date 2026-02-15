import type { Entity, Point } from "../core/types";
import type { Dungeon } from "../maps/dungeon";
import { aStar } from "./astar";
import { canEnterDungeonTile, isBlockedByEntity } from "./rules";

export function nextMonsterStep(
  monster: Entity,
  player: Entity,
  dungeon: Dungeon,
  entities: Entity[]
): Point | undefined {
  const path: Point[] | undefined = aStar(
    monster.pos,
    player.pos,
    (p: Point) => canEnterDungeonTile(dungeon, p),
    (p: Point) => !!isBlockedByEntity(entities, "dungeon", dungeon.id, p)
  );

  // path includes start; next step is index 1
  if (!path || path.length < 2) return undefined;
  return path[1];
}
