import type { Entity, Item, RenderContext } from '../types';
import { DungeonTile, EntityKind, ItemKind, Mode, OverworldTile, TileVisibility, TownTile } from '../types/enums';
import type { Overworld } from '../maps/overworld';
import type { Dungeon } from '../types';
import type { Town } from '../types';
import { getDungeonTile, getVisibility } from '../maps/dungeon';
import { getTownTile } from '../maps/town';

/**
 * Renders a top-down ASCII view of the current game state.
 * @param ctx The render context.
 * @param viewWidth The view width in tiles.
 * @param viewHeight The view height in tiles.
 * @returns The ASCII map string.
 */
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

      if (ctx.mode === Mode.Overworld) {
        const t = ctx.overworld.getTile(wx, wy);
        out += overworldChar(t);
      } else if (ctx.mode === Mode.Dungeon) {
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
          if (v === TileVisibility.Unseen) {
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

/**
 * Finds the glyph for an entity at a coordinate.
 * @param ctx The render context.
 * @param x The x coordinate.
 * @param y The y coordinate.
 * @returns The glyph character, or undefined.
 */
function findEntityChar(ctx: RenderContext, x: number, y: number): string | undefined {
  for (const e of ctx.entities) {
    if (e.kind !== EntityKind.Monster) {
      continue;
    }
    if (e.hp <= 0) {
      continue;
    }

    if (ctx.mode === Mode.Overworld) {
      if (e.mapRef.kind !== Mode.Overworld) {
        continue;
      }
    } else if (ctx.mode === Mode.Dungeon) {
      if (e.mapRef.kind !== Mode.Dungeon) {
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
        if (v !== TileVisibility.Visible) {
          continue;
        }
      }
    } else {
      if (e.mapRef.kind !== Mode.Town) {
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

/**
 * Finds the glyph for an item at a coordinate.
 * @param ctx The render context.
 * @param x The x coordinate.
 * @param y The y coordinate.
 * @returns The glyph character, or undefined.
 */
function findItemChar(ctx: RenderContext, x: number, y: number): string | undefined {
  for (const it of ctx.items) {
    if (!it.mapRef || !it.pos) {
      continue;
    }

    if (ctx.mode === Mode.Overworld) {
      if (it.mapRef.kind !== Mode.Overworld) {
        continue;
      }
    } else if (ctx.mode === Mode.Dungeon) {
      if (it.mapRef.kind !== Mode.Dungeon) {
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
        if (v !== TileVisibility.Visible) {
          continue;
        }
      }
    } else {
      if (it.mapRef.kind !== Mode.Town) {
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

/**
 * Maps an item kind to a glyph character.
 * @param kind The item kind.
 * @returns The glyph character.
 */
function itemChar(kind: ItemKind): string {
  switch (kind) {
    case ItemKind.Potion:
      return '!';
    case ItemKind.Weapon:
      return ')';
    case ItemKind.Armor:
      return ']';
    default:
      return '?';
  }
}

/**
 * Maps an overworld tile to a glyph character.
 * @param tile The overworld tile.
 * @returns The glyph character.
 */
function overworldChar(tile: OverworldTile): string {
  switch (tile) {
    case OverworldTile.Water:
      return '~';
    case OverworldTile.WaterDeep:
      return '~';
    case OverworldTile.Grass:
      return '.';
    case OverworldTile.Forest:
      return '♣';
    case OverworldTile.Mountain:
      return '^';
    case OverworldTile.MountainSnow:
      return 'A';
    case OverworldTile.Dungeon:
      return 'D';
    case OverworldTile.Cave:
      return 'C';
    case OverworldTile.Town:
      return 'T';
    case OverworldTile.TownShop:
      return 'S';
    case OverworldTile.TownTavern:
      return 'V';
    case OverworldTile.TownSmith:
      return 'F';
    case OverworldTile.TownHouse:
      return 'H';
    case OverworldTile.Road:
      return '=';
    default:
      return '?';
  }
}

/**
 * Maps a dungeon tile to a glyph character.
 * @param tile The dungeon tile.
 * @returns The glyph character.
 */
function dungeonChar(tile: DungeonTile): string {
  switch (tile) {
    case DungeonTile.Wall:
      return '#';
    case DungeonTile.Floor:
      return '.';
    case DungeonTile.BossFloor:
      return '*';
    case DungeonTile.StairsUp:
      return '<';
    case DungeonTile.StairsDown:
      return '>';
    default:
      return '?';
  }
}

/**
 * Maps a town tile to a glyph character.
 * @param tile The town tile.
 * @returns The glyph character.
 */
function townChar(tile: TownTile): string {
  switch (tile) {
    case TownTile.Wall:
      return '#';
    case TownTile.Road:
      return '+';
    case TownTile.Square:
      return 'T';
    case TownTile.Gate:
      return 'G';
    case TownTile.Shop:
      return 'S';
    case TownTile.Tavern:
      return 'V';
    case TownTile.Smith:
      return 'F';
    case TownTile.House:
      return 'H';
    case TownTile.Floor:
    default:
      return '.';
  }
}
