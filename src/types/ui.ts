import type { Point } from './common';
import type { Entity } from './entity';
import type { Item } from './item';
import type { Shop, ShopEconomy } from './shop';
import type { Quest } from './quest';
import type { CharacterStory } from './story';
import type { PanelMode, ShopSpecialty } from './enums';

export type PanelContext = {
  mode: PanelMode;
  player: Entity;
  items: Item[];
  activeShop?: Shop;
  canShop: boolean;
  quests: Quest[];
  story: CharacterStory;
  activeTownId?: string;
  shopCategory: ShopSpecialty;
  shopEconomy?: ShopEconomy;
  shopBuyPrices?: Record<string, number>;
  shopSellPrices?: Record<string, number>;
};

export type MinimapContext = {
  overworld: any; // Circular dependency, use any or import type from overworld
  playerPos: Point;
  destination?: Point;
  discoveredPois: { kind: 'town' | 'dungeon' | 'cave'; pos: Point }[];
};

export type OverworldMapContext = {
  overworld: any; // Circular dependency
  player: Entity;
  destination?: Point;
  autoPath?: Point[];
  items: Item[];
};

export type RenderContext = {
  mode: any; // Mode enum from enums.ts
  overworld: any;
  dungeon: any;
  town: any;
  player: Entity;
  entities: Entity[];
  items: Item[];
  useFov: boolean;
};

export type I18nVars = Record<string, string | number>;

export type SpriteKey =
  | 'ow_water_deep'
  | 'ow_water'
  | 'ow_grass'
  | 'ow_forest'
  | 'ow_mountain'
  | 'ow_mountain_snow'
  | 'ow_road'
  | 'ow_town'
  | 'ow_town_ground'
  | 'ow_town_road'
  | 'ow_town_square'
  | 'ow_town_shop'
  | 'ow_town_tavern'
  | 'ow_town_smith'
  | 'ow_town_house'
  | 'ow_town_wall'
  | 'ow_town_gate'
  | 'ow_dungeon'
  | 'ow_cave'
  | 'tn_floor'
  | 'tn_wall'
  | 'tn_road'
  | 'tn_square'
  | 'tn_gate'
  | 'tn_shop'
  | 'tn_tavern'
  | 'tn_smith'
  | 'tn_house'
  | 'dg_wall_ruins'
  | 'dg_floor_ruins'
  | 'dg_boss_floor_ruins'
  | 'dg_stairs_ruins'
  | 'dg_wall_caves'
  | 'dg_floor_caves'
  | 'dg_boss_floor_caves'
  | 'dg_stairs_caves'
  | 'dg_wall_crypt'
  | 'dg_floor_crypt'
  | 'dg_boss_floor_crypt'
  | 'dg_stairs_crypt'
  | 'ent_player'
  | 'ent_slime'
  | 'ent_goblin'
  | 'ent_orc'
  | 'ent_wraith'
  | 'ent_boss'
  | 'it_potion'
  | 'it_weapon'
  | 'it_armor'
  | 'ui_path'
  | 'ui_destination';
