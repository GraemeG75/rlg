import type { Entity, Item, Mode } from '../core/types';
import type { Overworld } from '../maps/overworld';
import type { Dungeon } from '../maps/dungeon';
import type { Town } from '../maps/town';
import { getDungeonTile, getVisibility } from '../maps/dungeon';
import { getTownTile } from '../maps/town';

export type RenderContext = {
  mode: Mode;
  overworld: Overworld;
  dungeon: Dungeon | undefined;
  town: Town | undefined;
  player: Entity;
  entities: Entity[];
  items: Item[];
  useFov: boolean;
};

export function renderAscii(ctx: RenderContext, viewWidth: number, viewHeight: number): string {
  const halfW: number = Math.floor(viewWidth / 2);
  const halfH: number = Math.floor(viewHeight / 2);

  const originX: number = ctx.player.pos.x;
  const originY: number = ctx.player.pos.y;

  let out: string = '';

  for (let y: number = -halfH; y <= halfH; y++) {
    for (let x: number = -halfW; x <= halfW; x++) {
      const wx: number = originX + x;
      const wy: number = originY + y;

      if (x === 0 && y === 0) {
        out += '@';
        continue;
      }

      const entityChar: string | undefined = findEntityChar(ctx, wx, wy);
      if (entityChar) {
        out += entityChar;
        continue;
      }

      const itemChar: string | undefined = findItemChar(ctx, wx, wy);
      if (itemChar) {
        out += itemChar;
        continue;
      }

      if (ctx.mode === 'overworld') {
        const t = ctx.overworld.getTile(wx, wy);
        out += overworldChar(t);
      } else if (ctx.mode === 'dungeon') {
        const dungeon: Dungeon | undefined = ctx.dungeon;
        if (!dungeon) {
          out += ' ';
          continue;
        }
        if (wx < 0 || wy < 0 || wx >= dungeon.width || wy >= dungeon.height) {
          out += ' ';
          continue;
        }

        if (ctx.useFov) {
          const v = getVisibility(dungeon, wx, wy);
          if (v === 'unseen') {
            out += ' ';
            continue;
          }
        }

        out += dungeonChar(getDungeonTile(dungeon, wx, wy));
      } else {
        const town: Town | undefined = ctx.town;
        if (!town) {
          out += ' ';
          continue;
        }
        if (wx < 0 || wy < 0 || wx >= town.width || wy >= town.height) {
          out += ' ';
          continue;
        }
        out += townChar(getTownTile(town, wx, wy));
      }
    }
    out += '\n';
  }

  return out;
}

function findEntityChar(ctx: RenderContext, x: number, y: number): string | undefined {
  for (const e of ctx.entities) {
    if (e.kind !== 'monster') {
      continue;
    }
    if (e.hp <= 0) {
      continue;
    }

    if (ctx.mode === 'overworld') {
      if (e.mapRef.kind !== 'overworld') {
        continue;
      }
    } else if (ctx.mode === 'dungeon') {
      if (e.mapRef.kind !== 'dungeon') {
        continue;
      }
      if (!ctx.dungeon) {
        continue;
      }
      if (e.mapRef.dungeonId !== ctx.dungeon.id) {
        continue;
      }

      if (ctx.useFov) {
        const v = getVisibility(ctx.dungeon, x, y);
        if (v !== 'visible') {
          continue;
        }
      }
    } else {
      if (e.mapRef.kind !== 'town') {
        continue;
      }
      if (!ctx.town) {
        continue;
      }
      if (e.mapRef.townId !== ctx.town.id) {
        continue;
      }
    }

    if (e.pos.x === x && e.pos.y === y) {
      return e.glyph;
    }
  }

  return undefined;
}

function findItemChar(ctx: RenderContext, x: number, y: number): string | undefined {
  for (const it of ctx.items) {
    if (!it.mapRef || !it.pos) {
      continue;
    }

    if (ctx.mode === 'overworld') {
      if (it.mapRef.kind !== 'overworld') {
        continue;
      }
    } else if (ctx.mode === 'dungeon') {
      if (it.mapRef.kind !== 'dungeon') {
        continue;
      }
      if (!ctx.dungeon) {
        continue;
      }
      if (it.mapRef.dungeonId !== ctx.dungeon.id) {
        continue;
      }
      if (ctx.useFov) {
        const v = getVisibility(ctx.dungeon, x, y);
        if (v !== 'visible') {
          continue;
        }
      }
    } else {
      if (it.mapRef.kind !== 'town') {
        continue;
      }
      if (!ctx.town) {
        continue;
      }
      if (it.mapRef.townId !== ctx.town.id) {
        continue;
      }
    }

    if (it.pos.x === x && it.pos.y === y) {
      return itemChar(it.kind);
    }
  }

  return undefined;
}

function itemChar(kind: string): string {
  switch (kind) {
    case 'potion':
      return '!';
    case 'weapon':
      return ')';
    case 'armor':
      return ']';
    default:
      return '?';
  }
}

function overworldChar(tile: string): string {
  switch (tile) {
    case 'water':
      return '~';
    case 'grass':
      return '.';
    case 'forest':
      return '♣';
    case 'mountain':
      return '^';
    case 'dungeon':
      return 'D';
    case 'town':
    case 'town_square':
      return 'T';
    case 'town_ground':
      return 't';
    case 'town_road':
      return '+';
    case 'town_gate':
      return 'G';
    case 'town_wall':
      return '#';
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

function dungeonChar(tile: string): string {
  switch (tile) {
    case 'wall':
      return '#';
    case 'floor':
      return '.';
    case 'bossFloor':
      return '*';
    case 'stairsUp':
      return '<';
    case 'stairsDown':
      return '>';
    default:
      return '?';
  }
}

function townChar(tile: string): string {
  switch (tile) {
    case 'wall':
      return '#';
    case 'road':
      return '+';
    case 'square':
      return 'T';
    case 'gate':
      return 'G';
    case 'shop':
      return 'S';
    case 'tavern':
      return 'V';
    case 'smith':
      return 'F';
    case 'house':
      return 'H';
    case 'floor':
    default:
      return '.';
  }
}
