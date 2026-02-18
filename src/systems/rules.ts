import type { Entity, Point } from '../types';
import { Mode } from '../types/enums';
import type { Overworld } from '../maps/overworld';
import type { Dungeon } from '../maps/dungeon';
import type { Town } from '../maps/town';
import { getDungeonTile, isDungeonWalkable } from '../maps/dungeon';
import { getTownTile, isTownWalkable } from '../maps/town';

/**
 * Finds a blocking entity at the given position.
 * @param entities All entities to check.
 * @param mapKind The map kind.
 * @param dungeonId The dungeon id, if applicable.
 * @param townId The town id, if applicable.
 * @param pos The position to test.
 * @returns The blocking entity, or undefined.
 */
export function isBlockedByEntity(
  entities: Entity[],
  mapKind: Mode,
  dungeonId: string | undefined,
  townId: string | undefined,
  pos: Point
): Entity | undefined {
  for (const e of entities) {
    if (mapKind === Mode.Overworld) {
      if (e.mapRef.kind !== Mode.Overworld) {
        continue;
      }
    } else if (mapKind === Mode.Dungeon) {
      if (e.mapRef.kind !== Mode.Dungeon) {
        continue;
      }
      if (e.mapRef.dungeonId !== dungeonId) {
        continue;
      }
    } else {
      if (e.mapRef.kind !== Mode.Town) {
        continue;
      }
      if (e.mapRef.townId !== townId) {
        continue;
      }
    }
    if (e.pos.x === pos.x && e.pos.y === pos.y && e.hp > 0) {
      return e;
    }
  }
  return undefined;
}

/**
 * Checks whether a world position is enterable on the overworld.
 * @param overworld The overworld instance.
 * @param pos The position to test.
 * @returns True if enterable.
 */
export function canEnterOverworldTile(overworld: Overworld, pos: Point): boolean {
  const t = overworld.getTile(pos.x, pos.y);
  return overworld.isWalkable(t);
}

/**
 * Checks whether a dungeon position is enterable.
 * @param dungeon The dungeon instance.
 * @param pos The position to test.
 * @returns True if enterable.
 */
export function canEnterDungeonTile(dungeon: Dungeon, pos: Point): boolean {
  if (pos.x < 0 || pos.y < 0 || pos.x >= dungeon.width || pos.y >= dungeon.height) {
    return false;
  }
  const t = getDungeonTile(dungeon, pos.x, pos.y);
  return isDungeonWalkable(t);
}

/**
 * Checks whether a town position is enterable.
 * @param town The town instance.
 * @param pos The position to test.
 * @returns True if enterable.
 */
export function canEnterTownTile(town: Town, pos: Point): boolean {
  if (pos.x < 0 || pos.y < 0 || pos.x >= town.width || pos.y >= town.height) {
    return false;
  }
  const t = getTownTile(town, pos.x, pos.y);
  return isTownWalkable(t);
}
