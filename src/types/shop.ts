import type { Point } from './common';
import type { ShopSpecialty } from './enums';

export type Shop = {
  id: string;
  townWorldPos: Point;
  stockItemIds: string[];
};

export type ShopEconomy = {
  moodLabel: string;
  specialty: ShopSpecialty;
  buyMultiplier: number;
  sellMultiplier: number;
  featuredItemId?: string;
  restockIn: number;
};
