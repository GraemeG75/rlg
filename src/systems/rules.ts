import type { Entity, Point } from "../core/types";
import type { Overworld } from "../maps/overworld";
import type { Dungeon } from "../maps/dungeon";
import { getDungeonTile, isDungeonWalkable } from "../maps/dungeon";

export function isBlockedByEntity(entities: Entity[], mapKind: "overworld" | "dungeon", dungeonId: string | undefined, pos: Point): Entity | undefined {
  for (const e of entities) {
    if (mapKind === "overworld") {
      if (e.mapRef.kind !== "overworld") continue;
    } else {
      if (e.mapRef.kind !== "dungeon") continue;
      if (e.mapRef.dungeonId !== dungeonId) continue;
    }
    if (e.pos.x === pos.x && e.pos.y === pos.y && e.hp > 0) return e;
  }
  return undefined;
}

export function canEnterOverworldTile(overworld: Overworld, pos: Point): boolean {
  const t = overworld.getTile(pos.x, pos.y);
  return overworld.isWalkable(t);
}

export function canEnterDungeonTile(dungeon: Dungeon, pos: Point): boolean {
  if (pos.x < 0 || pos.y < 0 || pos.x >= dungeon.width || pos.y >= dungeon.height) return false;
  const t = getDungeonTile(dungeon, pos.x, pos.y);
  return isDungeonWalkable(t);
}
