export type Point = { x: number; y: number };

export type Mode = "overworld" | "dungeon";

export type MapRef =
  | { kind: "overworld" }
  | { kind: "dungeon"; dungeonId: string };

export type EntityKind = "player" | "monster";

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
};

export type ItemKind = "potion" | "weapon" | "armor";

export type Item = {
  id: string;
  kind: ItemKind;
  name: string;

  // If on ground:
  mapRef?: MapRef;
  pos?: Point;

  // Stats:
  healAmount?: number;
  attackBonus?: number;
  defenseBonus?: number;

  // Economy:
  value: number; // buy/sell base price
};

export type Shop = {
  id: string;
  townWorldPos: Point;
  stockItemIds: string[];
};

export type Action =
  | { kind: "move"; dx: number; dy: number }
  | { kind: "use" }
  | { kind: "wait" }
  | { kind: "pickup" }
  | { kind: "toggleInventory" }
  | { kind: "toggleShop" }
  | { kind: "toggleRenderer" }
  | { kind: "toggleFov" }
  | { kind: "help" }
  | { kind: "save" }
  | { kind: "load" };

export type OverworldTile = "water" | "grass" | "forest" | "mountain" | "dungeon" | "town" | "road";
export type DungeonTile = "wall" | "floor" | "stairsUp" | "stairsDown";

export type TileVisibility = "unseen" | "seen" | "visible";

export type Message = { text: string; t: number };
