import type { Entity } from '../types/entity';
import type { Item } from '../types/item';
import type { CharacterStory } from '../types/story';
import { Rng } from '../core/rng';

export interface GameStateForShops {
  turnCounter: number;
  worldSeed: number;
  items: Item[];
  player: {
    inventory: string[];
  };
}

export interface GameStateForMonsters {
  rng: Rng;
  player: {
    level: number;
  };
  entities: Entity[];
}

export interface GameStateForGear {
  worldSeed: number;
  items: Item[];
  player: {
    inventory: string[];
    equipment: {
      weaponItemId?: string;
      armorItemId?: string;
    };
  };
  log: string[];
}

export interface GameStateForStory {
  turnCounter: number;
  story: CharacterStory;
}
