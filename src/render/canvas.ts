import type { Entity, Item, Mode } from "../core/types";
import type { Overworld } from "../maps/overworld";
import type { Dungeon, DungeonTheme } from "../maps/dungeon";
import { getDungeonTile, getVisibility } from "../maps/dungeon";
import { SpriteAtlas, type SpriteKey } from "./sprites";

export type CanvasRenderContext = {
  mode: Mode;
  overworld: Overworld;
  dungeon: Dungeon | undefined;
  player: Entity;
  entities: Entity[];
  items: Item[];
  useFov: boolean;
};

export class CanvasRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  public constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const c: CanvasRenderingContext2D | null = canvas.getContext("2d");
    if (!c) throw new Error("Canvas 2D context not available.");
    this.ctx = c;
    this.ctx.font = "12px monospace";
    this.atlas = new SpriteAtlas(16);
  }

  public render(ctx: CanvasRenderContext, viewWidth: number, viewHeight: number): void {
    const tileSize: number = 16;
    const halfW: number = Math.floor(viewWidth / 2);
    const halfH: number = Math.floor(viewHeight / 2);

    const originX: number = ctx.player.pos.x;
    const originY: number = ctx.player.pos.y;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let y: number = -halfH; y <= halfH; y++) {
      for (let x: number = -halfW; x <= halfW; x++) {
        const wx: number = originX + x;
        const wy: number = originY + y;

        const px: number = (x + halfW) * tileSize;
        const py: number = (y + halfH) * tileSize;

        if (ctx.mode === "overworld") {
          const t = ctx.overworld.getTile(wx, wy);
          this.drawOverworldTile(t, px, py, tileSize);
        } else {
          const dungeon: Dungeon | undefined = ctx.dungeon;
          if (!dungeon) continue;
          if (wx < 0 || wy < 0 || wx >= dungeon.width || wy >= dungeon.height) continue;

          if (ctx.useFov) {
            const v = getVisibility(dungeon, wx, wy);
            if (v === "unseen") continue;
            if (v === "seen") {
              this.drawDungeonTile(dungeon.theme, getDungeonTile(dungeon, wx, wy), px, py, tileSize, 0.35);
            } else {
              this.drawDungeonTile(dungeon.theme, getDungeonTile(dungeon, wx, wy), px, py, tileSize, 1.0);
            }
          } else {
            this.drawDungeonTile(dungeon.theme, getDungeonTile(dungeon, wx, wy), px, py, tileSize, 1.0);
          }
        }

        const it: Item | undefined = this.findItemAt(ctx, wx, wy);
        if (it) {
          this.ctx.fillStyle = "#ffd36b";
          this.ctx.fillText(itemGlyph(it.kind), px + 5, py + 12);
        }

        const monster: Entity | undefined = this.findMonsterAt(ctx, wx, wy);
        if (monster) {
          this.ctx.fillStyle = "#7CFF9E";
          this.ctx.fillText(monster.glyph, px + 5, py + 12);
        }

        if (x === 0 && y === 0) {
          this.ctx.fillStyle = "#FFFFFF";
          this.ctx.fillText("@", px + 5, py + 12);
        }
      }
    }
  }

  private findMonsterAt(ctx: CanvasRenderContext, x: number, y: number): Entity | undefined {
    for (const e of ctx.entities) {
      if (e.kind !== "monster") continue;
      if (e.hp <= 0) continue;

      if (ctx.mode === "overworld") {
        if (e.mapRef.kind !== "overworld") continue;
        if (e.pos.x === x && e.pos.y === y) return e;
      } else {
        if (!ctx.dungeon) continue;
        if (e.mapRef.kind !== "dungeon") continue;
        if (e.mapRef.dungeonId !== ctx.dungeon.id) continue;
        if (ctx.useFov) {
          const v = getVisibility(ctx.dungeon, x, y);
          if (v !== "visible") continue;
        }
        if (e.pos.x === x && e.pos.y === y) return e;
      }
    }
    return undefined;
  }

  private findItemAt(ctx: CanvasRenderContext, x: number, y: number): Item | undefined {
    for (const it of ctx.items) {
      if (!it.mapRef || !it.pos) continue;

      if (ctx.mode === "overworld") {
        if (it.mapRef.kind !== "overworld") continue;
      } else {
        if (!ctx.dungeon) continue;
        if (it.mapRef.kind !== "dungeon") continue;
        if (it.mapRef.dungeonId !== ctx.dungeon.id) continue;
        if (ctx.useFov) {
          const v = getVisibility(ctx.dungeon, x, y);
          if (v !== "visible") continue;
        }
      }

      if (it.pos.x === x && it.pos.y === y) return it;
    }
    return undefined;
  }

private drawOverworldTile(tile: string, x: number, y: number, s: number): void {
  const key: SpriteKey =
    tile === "water" ? "ow_water" :
    tile === "grass" ? "ow_grass" :
    tile === "forest" ? "ow_forest" :
    tile === "mountain" ? "ow_mountain" :
    tile === "road" ? "ow_road" :
    tile === "town" ? "ow_town" :
    tile === "dungeon" ? "ow_dungeon" :
    "ow_grass";

  const img: HTMLCanvasElement = this.atlas.get(key);
  this.ctx.drawImage(img, x, y, s, s);
}

private drawDungeonTile(theme: DungeonTheme, tile: string, x: number, y: number, s: number, alpha: number): void {
    this.ctx.globalAlpha = alpha;

    const pal = themePalette(theme);

    switch (tile) {
      case "wall": this.ctx.fillStyle = pal.wall; break;
      case "floor": this.ctx.fillStyle = pal.floor; break;
      case "stairsUp": this.ctx.fillStyle = pal.stairs; break;
      case "stairsDown": this.ctx.fillStyle = pal.stairs; break;
      default: this.ctx.fillStyle = "#222"; break;
    }

    this.ctx.fillRect(x, y, s, s);
    this.ctx.globalAlpha = 1.0;

    if (tile === "stairsUp") {
      this.ctx.fillStyle = pal.glyph;
      this.ctx.fillText("<", x + 5, y + 12);
    }
    if (tile === "stairsDown") {
      this.ctx.fillStyle = pal.glyph;
      this.ctx.fillText(">", x + 5, y + 12);
    }
  }
}

function itemGlyph(kind: string): string {
  switch (kind) {
    case "potion": return "!";
    case "weapon": return ")";
    case "armor": return "]";
    default: return "?";
  }
}

function themePalette(theme: DungeonTheme): { wall: string; floor: string; stairs: string; glyph: string } {
  switch (theme) {
    case "ruins": return { wall: "#202a36", floor: "#0b1320", stairs: "#15243a", glyph: "#cfe3ff" };
    case "caves": return { wall: "#1f2a20", floor: "#0a130c", stairs: "#17301a", glyph: "#cfe3ff" };
    case "crypt": return { wall: "#2a1a2f", floor: "#120914", stairs: "#2c1231", glyph: "#e6d7ff" };
    default: return { wall: "#1b2430", floor: "#0b1320", stairs: "#122033", glyph: "#cfe3ff" };
  }
}
