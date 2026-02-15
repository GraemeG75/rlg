import type { Entity, Item, Shop } from "./types";
import type { Dungeon } from "../maps/dungeon";

export const SAVE_KEY: string = "web-roguelike-starter-save-v2";

export type SaveDataV2 = {
  version: 2;
  worldSeed: number;
  mode: "overworld" | "dungeon";

  playerId: string;

  entities: Entity[];
  items: Item[];
  dungeons: Dungeon[];

  // For reconstructing dungeon stack and town context.
  entranceReturnPos?: { x: number; y: number };
  shops: Shop[];

  // UI state (optional)
  activePanel: "none" | "inventory" | "shop";
};

export function saveToLocalStorage(data: SaveDataV2): void {
  const json: string = JSON.stringify(data);
  localStorage.setItem(SAVE_KEY, json);
}

export function loadFromLocalStorage(): SaveDataV2 | undefined {
  const json: string | null = localStorage.getItem(SAVE_KEY);
  if (!json) return undefined;
  const parsed: unknown = JSON.parse(json);
  const d = parsed as SaveDataV2;
  if (!d || d.version !== 2) return undefined;
  return d;
}
