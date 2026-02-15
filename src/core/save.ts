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
  const json: string = serializeSaveData(data);
  localStorage.setItem(SAVE_KEY, json);
}

export function loadFromLocalStorage(): SaveDataV3 | undefined {
  const json: string | null = localStorage.getItem(SAVE_KEY);
  if (!json) {
    return undefined;
  }
  return loadFromJsonString(json);
}

export function serializeSaveData(data: SaveDataV3): string {
  return JSON.stringify(data);
}

const BASE62_ALPHABET: string = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function encodeBase62(bytes: Uint8Array): string {
  let leadingZeros: number = 0;
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) {
    leadingZeros += 1;
  }

  let value: bigint = 0n;
  for (const byte of bytes) {
    value = value * 256n + BigInt(byte);
  }

  let encoded: string = '';
  while (value > 0n) {
    const rem: number = Number(value % 62n);
    encoded = BASE62_ALPHABET[rem] + encoded;
    value /= 62n;
  }

  return '0'.repeat(leadingZeros) + encoded;
}

function decodeBase62(input: string): Uint8Array | undefined {
  const text: string = input.trim();
  if (!text) {
    return undefined;
  }

  let leadingZeros: number = 0;
  while (leadingZeros < text.length && text[leadingZeros] === '0') {
    leadingZeros += 1;
  }

  let value: bigint = 0n;
  for (let i: number = leadingZeros; i < text.length; i += 1) {
    const ch: string = text[i];
    const idx: number = BASE62_ALPHABET.indexOf(ch);
    if (idx < 0) {
      return undefined;
    }
    value = value * 62n + BigInt(idx);
  }

  const bytes: number[] = [];
  while (value > 0n) {
    bytes.unshift(Number(value % 256n));
    value /= 256n;
  }

  if (leadingZeros > 0) {
    bytes.unshift(...new Array<number>(leadingZeros).fill(0));
  }

  return new Uint8Array(bytes);
}

export function serializeSaveDataBase62(data: SaveDataV3): string {
  const json: string = serializeSaveData(data);
  const bytes: Uint8Array = new TextEncoder().encode(json);
  return encodeBase62(bytes);
}

export function loadFromBase62String(code: string): SaveDataV3 | undefined {
  const bytes: Uint8Array | undefined = decodeBase62(code);
  if (!bytes) {
    return undefined;
  }
  const json: string = new TextDecoder().decode(bytes);
  return loadFromJsonString(json);
}

export function loadFromJsonString(json: string): SaveDataV3 | undefined {
  try {
    const parsed: unknown = JSON.parse(json);
    const d = parsed as SaveDataV3;
    if (!d || d.version !== 3) {
      return undefined;
    }
    return d;
  } catch {
    return undefined;
  }
}
