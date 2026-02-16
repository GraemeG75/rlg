import type { Entity, Point } from '../core/types';
import type { Overworld } from '../maps/overworld';
import type { Dungeon } from '../maps/dungeon';
import type { Town } from '../maps/town';
import { getDungeonTile, isDungeonWalkable } from '../maps/dungeon';
import { getTownTile, isTownWalkable } from '../maps/town';

export function isBlockedByEntity(
  entities: Entity[],
  mapKind: 'overworld' | 'dungeon' | 'town',
  dungeonId: string | undefined,
  townId: string | undefined,
  pos: Point
): Entity | undefined {
  for (const e of entities) {
    if (mapKind === 'overworld') {
      if (e.mapRef.kind !== 'overworld') {
        continue;
      }
    } else if (mapKind === 'dungeon') {
      if (e.mapRef.kind !== 'dungeon') {
        continue;
      }
      if (e.mapRef.dungeonId !== dungeonId) {
        continue;
      }
    } else {
      if (e.mapRef.kind !== 'town') {
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

export function canEnterOverworldTile(overworld: Overworld, pos: Point): boolean {
  const t = overworld.getTile(pos.x, pos.y);
  return overworld.isWalkable(t);
}

export function canEnterDungeonTile(dungeon: Dungeon, pos: Point): boolean {
  if (pos.x < 0 || pos.y < 0 || pos.x >= dungeon.width || pos.y >= dungeon.height) {
    return false;
  }
  const t = getDungeonTile(dungeon, pos.x, pos.y);
  return isDungeonWalkable(t);
}

export function canEnterTownTile(town: Town, pos: Point): boolean {
  if (pos.x < 0 || pos.y < 0 || pos.x >= town.width || pos.y >= town.height) {
    return false;
  }
  const t = getTownTile(town, pos.x, pos.y);
  return isTownWalkable(t);
}
