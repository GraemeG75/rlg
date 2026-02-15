import type { Entity, Item } from "./types";
import type { Dungeon } from "../maps/dungeon";

export const SAVE_KEY: string = "web-roguelike-starter-save-v1";

export type SaveDataV1 = {
  version: 1;
  worldSeed: number;
  mode: "overworld" | "dungeon";
  entranceReturnPos?: { x: number; y: number };

  playerId: string;

  entities: Entity[];
  items: Item[];

  dungeons: Dungeon[];
};

export function saveToLocalStorage(data: SaveDataV1): void {
  const json: string = JSON.stringify(data);
  localStorage.setItem(SAVE_KEY, json);
}

export function loadFromLocalStorage(): SaveDataV1 | undefined {
  const json: string | null = localStorage.getItem(SAVE_KEY);
  if (!json) return undefined;
  const parsed: unknown = JSON.parse(json);
  const d = parsed as SaveDataV1;
  if (!d || d.version !== 1) return undefined;
  return d;
}
