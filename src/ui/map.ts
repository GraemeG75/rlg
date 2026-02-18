import type { Entity, Item, Point, OverworldMapContext } from '../types';
import type { Overworld } from '../maps/overworld';

/**
 * Renders a small ASCII map of the overworld around the player.
 * @param ctx The map context.
 * @param width The map width in tiles.
 * @param height The map height in tiles.
 * @returns The ASCII map string.
 */
export function renderOverworldMapAscii(ctx: OverworldMapContext, width: number, height: number): string {
  const halfW: number = Math.floor(width / 2);
  const halfH: number = Math.floor(height / 2);

  const originX: number = ctx.player.pos.x;
  const originY: number = ctx.player.pos.y;

  const pathSet: Set<string> = new Set<string>();
  if (ctx.autoPath) {
    for (const p of ctx.autoPath) pathSet.add(`${p.x},${p.y}`);
  }

  let out: string = '';
  for (let y: number = -halfH; y <= halfH; y++) {
    for (let x: number = -halfW; x <= halfW; x++) {
      const wx: number = originX + x;
      const wy: number = originY + y;

      if (x === 0 && y === 0) {
        out += '@';
        continue;
      }

      if (ctx.destination && ctx.destination.x === wx && ctx.destination.y === wy) {
        out += 'X';
        continue;
      }

      const k: string = `${wx},${wy}`;
      if (pathSet.has(k)) {
        out += '*';
        continue;
      }

      const tile = ctx.overworld.getTile(wx, wy);
      out += overworldChar(tile);
    }
    out += '\n';
  }

  return out;
}

/**
 * Maps an overworld tile to a glyph.
 * @param tile The overworld tile.
 * @returns The glyph character.
 */
function overworldChar(tile: string): string {
  switch (tile) {
    case 'water':
      return '~';
    case 'water_deep':
      return '~';
    case 'grass':
      return '.';
    case 'forest':
      return '♣';
    case 'mountain':
      return '^';
    case 'mountain_snow':
      return 'A';
    case 'dungeon':
      return 'D';
    case 'cave':
      return 'C';
    case 'town':
      return 'T';
    case 'town_shop':
      return 'S';
    case 'town_tavern':
      return 'V';
    case 'town_smith':
      return 'F';
    case 'town_house':
      return 'H';
    case 'road':
      return '=';
    default:
      return '?';
  }
}
