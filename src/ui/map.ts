import type { Entity, Item, Point } from "../core/types";
import type { Overworld } from "../maps/overworld";

export type OverworldMapContext = {
  overworld: Overworld;
  player: Entity;
  destination?: Point;
  autoPath?: Point[];
  items: Item[];
};

export function renderOverworldMapAscii(ctx: OverworldMapContext, width: number, height: number): string {
  const halfW: number = Math.floor(width / 2);
  const halfH: number = Math.floor(height / 2);

  const originX: number = ctx.player.pos.x;
  const originY: number = ctx.player.pos.y;

  const pathSet: Set<string> = new Set<string>();
  if (ctx.autoPath) {
    for (const p of ctx.autoPath) pathSet.add(`${p.x},${p.y}`);
  }

  let out: string = "";
  for (let y: number = -halfH; y <= halfH; y++) {
    for (let x: number = -halfW; x <= halfW; x++) {
      const wx: number = originX + x;
      const wy: number = originY + y;

      if (x === 0 && y === 0) { out += "@"; continue; }

      if (ctx.destination && ctx.destination.x === wx && ctx.destination.y === wy) { out += "X"; continue; }

      const k: string = `${wx},${wy}`;
      if (pathSet.has(k)) { out += "*"; continue; }

      const tile = ctx.overworld.getTile(wx, wy);
      out += overworldChar(tile);
    }
    out += "\n";
  }

  return out;
}

function overworldChar(tile: string): string {
  switch (tile) {
    case "water": return "~";
    case "grass": return ".";
    case "forest": return "♣";
    case "mountain": return "^";
    case "dungeon": return "D";
    case "town": return "T";
    case "road": return "=";
    default: return "?";
  }
}
