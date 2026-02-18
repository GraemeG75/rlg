import type { Point } from './common';
import type { Mode, CharacterClass, Gender, EntityKind } from './enums';
import type { StatusEffect } from './';

export type MapRef = { kind: Mode.Overworld } | { kind: Mode.Dungeon; dungeonId: string } | { kind: Mode.Town; townId: string };

export type Equipment = {
  weaponItemId?: string;
  armorItemId?: string;
};

export type Entity = {
  id: string;
  kind: EntityKind;
  name: string;
  glyph: string;

  pos: Point;
  mapRef: MapRef;

  hp: number;
  maxHp: number;

  baseAttack: number;
  baseDefense: number;

  level: number;
  xp: number;
  gold: number;

  inventory: string[]; // item ids
  equipment: Equipment;

  classType?: CharacterClass;
  gender?: Gender;
  strength?: number;
  agility?: number;
  intellect?: number;
  statusEffects?: StatusEffect[];
  specialCooldown?: number;
  isBoss?: boolean;
};
