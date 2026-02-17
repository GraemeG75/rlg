import type { Entity, Item, Mode, PanelMode, Shop } from './types';
import type { Dungeon } from '../maps/dungeon';

export const SAVE_KEY: string = 'web-roguelike-starter-save-v3';

export type SaveDataV3 = {
  version: 3;
  worldSeed: number;
  mode: Mode;

  playerId: string;
  playerClass?: import('./types').CharacterClass;
  playerGender?: import('./types').Gender;
  story?: import('./types').CharacterStory;

  entities: Entity[];
  items: Item[];
  dungeons: Dungeon[];

  // For reconstructing dungeon stack and town context.
  entranceReturnPos?: { x: number; y: number };
  townReturnPos?: { x: number; y: number };
  townId?: string;
  shops: Shop[];

  // Progression
  turnCounter: number;
  quests: import('./types').Quest[];

  // UI state (optional)
  activePanel: PanelMode;
  preferRoads?: boolean;
};

/**
 * Persists save data to localStorage.
 * @param data The save data to persist.
 */
export function saveToLocalStorage(data: SaveDataV3): void {
  const json: string = serializeSaveData(data);
  localStorage.setItem(SAVE_KEY, json);
}

/**
 * Loads save data from localStorage.
 * @returns The save data, or undefined if missing or invalid.
 */
export function loadFromLocalStorage(): SaveDataV3 | undefined {
  const json: string | null = localStorage.getItem(SAVE_KEY);
  if (!json) {
    return undefined;
  }
  return loadFromJsonString(json);
}

/**
 * Serializes save data to JSON.
 * @param data The save data to serialize.
 * @returns The JSON string.
 */
export function serializeSaveData(data: SaveDataV3): string {
  return JSON.stringify(data);
}

const BASE62_ALPHABET: string = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Encodes bytes into a base62 string.
 * @param bytes The bytes to encode.
 * @returns The base62 string.
 */
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

/**
 * Decodes a base62 string to bytes.
 * @param input The base62 string.
 * @returns The decoded bytes, or undefined if invalid.
 */
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

/**
 * Serializes save data to a base62 string.
 * @param data The save data to serialize.
 * @returns The base62-encoded save string.
 */
export function serializeSaveDataBase62(data: SaveDataV3): string {
  const json: string = serializeSaveData(data);
  const bytes: Uint8Array = new TextEncoder().encode(json);
  return encodeBase62(bytes);
}

/**
 * Loads save data from a base62 string.
 * @param code The base62 save string.
 * @returns The save data, or undefined if invalid.
 */
export function loadFromBase62String(code: string): SaveDataV3 | undefined {
  const bytes: Uint8Array | undefined = decodeBase62(code);
  if (!bytes) {
    return undefined;
  }
  const json: string = new TextDecoder().decode(bytes);
  return loadFromJsonString(json);
}

/**
 * Loads save data from a JSON string.
 * @param json The JSON string.
 * @returns The save data, or undefined if invalid.
 */
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
