import type { Entity, Item, Shop } from './types';
import type { Dungeon } from '../maps/dungeon';

export const SAVE_KEY: string = 'web-roguelike-starter-save-v3';

export type SaveDataV3 = {
  version: 3;
  worldSeed: number;
  mode: 'overworld' | 'dungeon';

  playerId: string;
  playerClass?: import('./types').CharacterClass;

  entities: Entity[];
  items: Item[];
  dungeons: Dungeon[];

  // For reconstructing dungeon stack and town context.
  entranceReturnPos?: { x: number; y: number };
  shops: Shop[];

  // Progression
  turnCounter: number;
  quests: import('./types').Quest[];

  // UI state (optional)
  activePanel: 'none' | 'inventory' | 'shop' | 'quest';
};

export function saveToLocalStorage(data: SaveDataV3): void {
  const json: string = JSON.stringify(data);
  localStorage.setItem(SAVE_KEY, json);
}

export function loadFromLocalStorage(): SaveDataV3 | undefined {
  const json: string | null = localStorage.getItem(SAVE_KEY);
  if (!json) return undefined;
  const parsed: unknown = JSON.parse(json);
  const d = parsed as SaveDataV3;
  if (!d || d.version !== 3) return undefined;
  return d;
}
