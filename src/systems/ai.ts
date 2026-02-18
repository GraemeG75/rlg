import type { Entity, Point } from '../types';
import { Mode } from '../types/enums';
import type { Dungeon } from '../maps/dungeon';
import { AStarPathfinder } from './astar';
import { canEnterDungeonTile, isBlockedByEntity } from './rules';

/**
 * Simple monster AI helper that manages pathfinding toward the player.
 */
export class MonsterAI {
  private readonly pathfinder: AStarPathfinder = new AStarPathfinder();

  public constructor(
    private readonly dungeon: Dungeon,
    private readonly entities: Entity[]
  ) {}

  /**
   * Computes the next step for a monster toward the player.
   * @param monster The monster entity.
   * @param player The player entity.
   * @returns The next step, or undefined if no path.
   */
  public nextStep(monster: Entity, player: Entity): Point | undefined {
    const path: Point[] | undefined = this.pathfinder.findPath(monster.pos, player.pos, {
      isWalkable: (p: Point) => canEnterDungeonTile(this.dungeon, p),
      isBlocked: (p: Point) => !!isBlockedByEntity(this.entities, Mode.Dungeon, this.dungeon.id, undefined, p)
    });

    if (!path || path.length < 2) {
      return undefined;
    }
    return path[1];
  }
}
