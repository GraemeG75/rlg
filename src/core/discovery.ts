import type { Point } from "./types";
import type { Overworld } from "../maps/overworld";

export type DiscoveredPoiKind = "town" | "dungeon";

export type DiscoveredPoi = {
  id: string;
  kind: DiscoveredPoiKind;
  name: string;
  pos: Point;
  discoveredTurn: number;
};

export function poiId(kind: DiscoveredPoiKind, pos: Point): string {
  return `${kind}:${pos.x},${pos.y}`;
}

export function maybeDiscoverPois(
  overworld: Overworld,
  playerPos: Point,
  discovered: DiscoveredPoi[],
  turnCounter: number,
): boolean {
  const tile: string = overworld.getTile(playerPos.x, playerPos.y);
  if (tile !== "town" && tile !== "dungeon") return false;

  const kind: DiscoveredPoiKind = tile === "town" ? "town" : "dungeon";
  const id: string = poiId(kind, playerPos);
  if (discovered.some((p) => p.id === id)) return false;

  const name: string = kind === "town"
    ? `Town ${discovered.filter((p) => p.kind === "town").length + 1}`
    : `Dungeon ${discovered.filter((p) => p.kind === "dungeon").length + 1}`;

  discovered.push({ id, kind, name, pos: { x: playerPos.x, y: playerPos.y }, discoveredTurn: turnCounter });
  return true;
}
