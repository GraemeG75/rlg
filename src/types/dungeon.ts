import type { Point } from './common';
import type { DungeonTheme, DungeonLayout, DungeonTile, TileVisibility } from './enums';

export type Dungeon = {
  id: string;
  baseId: string;
  depth: number;
  theme: DungeonTheme;
  isAmbush?: boolean;
  ambushCleared?: boolean;

  width: number;
  height: number;

  tiles: DungeonTile[];
  visibility: TileVisibility[];

  stairsUp: Point;
  stairsDown: Point;
  bossRoom?: { x: number; y: number; w: number; h: number; center: Point };
};

export type DungeonGenerationConfig = {
  dungeonId: string;
  baseId: string;
  depth: number;
  seed: number;
  width: number;
  height: number;
  layout: DungeonLayout;
};

export type AmbushArenaConfig = {
  dungeonId: string;
  baseId: string;
  depth: number;
  seed: number;
  width?: number;
  height?: number;
  theme?: DungeonTheme;
};
