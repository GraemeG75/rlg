import { Application, Container, Sprite, Texture } from 'pixi.js';
import type { Entity, Item, Mode } from '../core/types';
import type { Overworld } from '../maps/overworld';
import type { Dungeon, DungeonTheme } from '../maps/dungeon';
import { getDungeonTile, getVisibility } from '../maps/dungeon';
import { SpriteAtlas, type SpriteKey } from './sprites';

type PixiRenderContext = {
  mode: Mode;
  overworld: Overworld;
  dungeon: Dungeon | undefined;
  player: Entity;
  entities: Entity[];
  items: Item[];
  useFov: boolean;
};

export class PixiRenderer {
  private readonly app: Application;
  private readonly atlas: SpriteAtlas;
  private readonly ready: Promise<void>;
  private tileLayer!: Container;
  private entityLayer!: Container;
  private overlayLayer!: Container;
  private readonly textures: Map<SpriteKey | string, Texture>;
  private readonly tileSize: number;
  private readonly canvas: HTMLCanvasElement;
  private tileSprites: Sprite[];
  private viewWidth: number;
  private viewHeight: number;
  private initialized: boolean;
  private pendingRender?: { ctx: PixiRenderContext; viewWidth: number; viewHeight: number };

  public constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.tileSize = 16;
    this.atlas = new SpriteAtlas(this.tileSize);
    this.textures = new Map<SpriteKey | string, Texture>();
    this.tileSprites = [];
    this.viewWidth = 0;
    this.viewHeight = 0;
    this.initialized = false;

    this.app = new Application();
    this.ready = this.app
      .init({
        canvas,
        width: canvas.width || this.tileSize,
        height: canvas.height || this.tileSize,
        backgroundAlpha: 0,
        antialias: false,
        autoDensity: true
      })
      .then(() => {
        this.app.ticker.stop();

        this.tileLayer = new Container();
        this.entityLayer = new Container();
        this.overlayLayer = new Container();
        this.app.stage.addChild(this.tileLayer);
        this.app.stage.addChild(this.entityLayer);
        this.app.stage.addChild(this.overlayLayer);
        this.initialized = true;

        if (this.pendingRender) {
          const pending = this.pendingRender;
          this.pendingRender = undefined;
          this.render(pending.ctx, pending.viewWidth, pending.viewHeight);
        }
      })
      .catch((err) => {
        console.error('Pixi renderer init failed', err);
      });
  }

  public render(ctx: PixiRenderContext, viewWidth: number, viewHeight: number): void {
    if (!this.initialized) {
      this.pendingRender = { ctx, viewWidth, viewHeight };
      return;
    }

    if (viewWidth <= 0 || viewHeight <= 0) {
      return;
    }

    if (viewWidth !== this.viewWidth || viewHeight !== this.viewHeight) {
      this.rebuildView(viewWidth, viewHeight);
    }

    const dungeon: Dungeon | undefined = ctx.dungeon;
    const halfW: number = Math.floor(viewWidth / 2);
    const halfH: number = Math.floor(viewHeight / 2);
    const originX: number = ctx.player.pos.x;
    const originY: number = ctx.player.pos.y;

    const pendingStairs: { wx: number; wy: number; glyph: string; color: string; alpha: number }[] = [];

    for (let row: number = 0; row < viewHeight; row++) {
      for (let col: number = 0; col < viewWidth; col++) {
        const x: number = col - halfW;
        const y: number = row - halfH;
        const wx: number = originX + x;
        const wy: number = originY + y;
        const idx: number = row * viewWidth + col;
        const sprite: Sprite = this.tileSprites[idx];

        if (ctx.mode === 'overworld') {
          const tile: string = ctx.overworld.getTile(wx, wy);
          sprite.texture = this.getTexture(this.overworldKey(tile));
          sprite.alpha = 1;
          sprite.visible = true;
        } else {
          if (!dungeon) {
            sprite.visible = false;
            continue;
          }
          if (wx < 0 || wy < 0 || wx >= dungeon.width || wy >= dungeon.height) {
            sprite.visible = false;
            continue;
          }

          const tile = getDungeonTile(dungeon, wx, wy);
          let tileAlpha: number = 1;

          if (ctx.useFov) {
            const vis = getVisibility(dungeon, wx, wy);
            if (vis === 'unseen') {
              sprite.visible = false;
              continue;
            }
            if (vis === 'seen') {
              tileAlpha = 0.35;
            }
          }

          sprite.texture = this.getTexture(this.dungeonKey(dungeon.theme, tile));
          sprite.alpha = tileAlpha;
          sprite.visible = true;

          if (tile === 'stairsUp' || tile === 'stairsDown') {
            const palette = themePalette(dungeon.theme);
            pendingStairs.push({
              wx,
              wy,
              glyph: tile === 'stairsUp' ? '<' : '>',
              color: palette.glyph,
              alpha: tileAlpha
            });
          }
        }
      }
    }

    this.entityLayer.removeChildren();
    this.overlayLayer.removeChildren();

    this.drawItems(ctx, originX, originY, halfW, halfH);
    this.drawMonsters(ctx, originX, originY, halfW, halfH);
    this.drawPlayer(originX, originY, halfW, halfH);

    for (const s of pendingStairs) {
      const screen = this.worldToScreen(s.wx, s.wy, originX, originY, halfW, halfH);
      if (!screen) {
        continue;
      }
      const sprite = new Sprite(this.getGlyphTexture(`${s.glyph}_${s.color}`, s.glyph, s.color));
      sprite.x = screen.x;
      sprite.y = screen.y;
      sprite.width = this.tileSize;
      sprite.height = this.tileSize;
      sprite.alpha = s.alpha;
      this.overlayLayer.addChild(sprite);
    }

    this.app.render();
  }

  private rebuildView(viewWidth: number, viewHeight: number): void {
    this.viewWidth = viewWidth;
    this.viewHeight = viewHeight;

    const widthPx: number = viewWidth * this.tileSize;
    const heightPx: number = viewHeight * this.tileSize;

    this.app.renderer.resize(widthPx, heightPx);

    this.tileSprites = [];
    this.tileLayer.removeChildren();

    for (let row: number = 0; row < viewHeight; row++) {
      for (let col: number = 0; col < viewWidth; col++) {
        const sprite: Sprite = new Sprite(this.getTexture('ow_grass'));
        sprite.x = col * this.tileSize;
        sprite.y = row * this.tileSize;
        sprite.width = this.tileSize;
        sprite.height = this.tileSize;
        sprite.alpha = 1;
        sprite.visible = true;
        this.tileLayer.addChild(sprite);
        this.tileSprites.push(sprite);
      }
    }
  }

  private drawItems(ctx: PixiRenderContext, originX: number, originY: number, halfW: number, halfH: number): void {
    for (const it of ctx.items) {
      if (!it.mapRef || !it.pos) {
        continue;
      }

      if (ctx.mode === 'overworld') {
        if (it.mapRef.kind !== 'overworld') {
          continue;
        }
      } else {
        const dungeon: Dungeon | undefined = ctx.dungeon;
        if (!dungeon) {
          continue;
        }
        if (it.mapRef.kind !== 'dungeon' || it.mapRef.dungeonId !== dungeon.id) {
          continue;
        }
        if (ctx.useFov) {
          const vis = getVisibility(dungeon, it.pos.x, it.pos.y);
          if (vis !== 'visible') {
            continue;
          }
        }
      }

      const screen = this.worldToScreen(it.pos.x, it.pos.y, originX, originY, halfW, halfH);
      if (!screen) {
        continue;
      }
      const spriteKey: SpriteKey = it.kind === 'potion' ? 'it_potion' : it.kind === 'weapon' ? 'it_weapon' : 'it_armor';
      const sprite = new Sprite(this.getTexture(spriteKey));
      sprite.x = screen.x;
      sprite.y = screen.y;
      sprite.width = this.tileSize;
      sprite.height = this.tileSize;
      this.entityLayer.addChild(sprite);
    }
  }

  private drawMonsters(ctx: PixiRenderContext, originX: number, originY: number, halfW: number, halfH: number): void {
    for (const entity of ctx.entities) {
      if (entity.kind !== 'monster' || entity.hp <= 0) {
        continue;
      }

      if (ctx.mode === 'overworld') {
        if (entity.mapRef.kind !== 'overworld') {
          continue;
        }
      } else {
        const dungeon: Dungeon | undefined = ctx.dungeon;
        if (!dungeon) {
          continue;
        }
        if (entity.mapRef.kind !== 'dungeon' || entity.mapRef.dungeonId !== dungeon.id) {
          continue;
        }
        if (ctx.useFov) {
          const vis = getVisibility(dungeon, entity.pos.x, entity.pos.y);
          if (vis !== 'visible') {
            continue;
          }
        }
      }

      const screen = this.worldToScreen(entity.pos.x, entity.pos.y, originX, originY, halfW, halfH);
      if (!screen) {
        continue;
      }
      const spriteKey = this.monsterKey(entity.glyph);
      const sprite = new Sprite(this.getTexture(spriteKey));
      sprite.x = screen.x;
      sprite.y = screen.y;
      sprite.width = this.tileSize;
      sprite.height = this.tileSize;
      this.entityLayer.addChild(sprite);
    }
  }

  private drawPlayer(originX: number, originY: number, halfW: number, halfH: number): void {
    const screen = this.worldToScreen(originX, originY, originX, originY, halfW, halfH);
    if (!screen) {
      return;
    }
    const sprite = new Sprite(this.getTexture('ent_player'));
    sprite.x = screen.x;
    sprite.y = screen.y;
    sprite.width = this.tileSize;
    sprite.height = this.tileSize;
    this.overlayLayer.addChild(sprite);
  }

  private worldToScreen(
    wx: number,
    wy: number,
    originX: number,
    originY: number,
    halfW: number,
    halfH: number
  ): { x: number; y: number } | undefined {
    const dx: number = wx - originX;
    const dy: number = wy - originY;
    if (Math.abs(dx) > halfW || Math.abs(dy) > halfH) {
      return undefined;
    }
    const col: number = dx + halfW;
    const row: number = dy + halfH;
    return { x: col * this.tileSize, y: row * this.tileSize };
  }

  private getTexture(key: SpriteKey): Texture;
  private getTexture(key: string, glyph?: string, color?: string): Texture;
  private getTexture(key: SpriteKey | string, glyph?: string, color?: string): Texture {
    const existing: Texture | undefined = this.textures.get(key);
    if (existing) {
      return existing;
    }
    let texture: Texture;
    if (glyph && color) {
      texture = this.getGlyphTexture(key, glyph, color);
    } else {
      texture = Texture.from(this.atlas.get(key as SpriteKey));
    }
    this.textures.set(key, texture);
    return texture;
  }

  private getGlyphTexture(cacheKey: string, glyph: string, color: string): Texture {
    const cached: Texture | undefined = this.textures.get(cacheKey);
    if (cached) {
      return cached;
    }
    const canvas: HTMLCanvasElement = document.createElement('canvas');
    canvas.width = this.tileSize;
    canvas.height = this.tileSize;
    const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas not available for glyph.');
    }
    ctx.clearRect(0, 0, this.tileSize, this.tileSize);
    ctx.fillStyle = color;
    ctx.font = '12px monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(glyph, 5, 2);
    const texture: Texture = Texture.from(canvas);
    this.textures.set(cacheKey, texture);
    return texture;
  }

  private overworldKey(tile: string): SpriteKey {
    switch (tile) {
      case 'water':
        return 'ow_water';
      case 'grass':
        return 'ow_grass';
      case 'forest':
        return 'ow_forest';
      case 'mountain':
        return 'ow_mountain';
      case 'road':
        return 'ow_road';
      case 'town':
        return 'ow_town';
      case 'dungeon':
        return 'ow_dungeon';
      default:
        return 'ow_grass';
    }
  }

  private dungeonKey(theme: DungeonTheme, tile: string): SpriteKey {
    switch (tile) {
      case 'wall':
        return theme === 'caves' ? 'dg_wall_caves' : theme === 'crypt' ? 'dg_wall_crypt' : 'dg_wall_ruins';
      case 'floor':
        return theme === 'caves' ? 'dg_floor_caves' : theme === 'crypt' ? 'dg_floor_crypt' : 'dg_floor_ruins';
      case 'stairsUp':
      case 'stairsDown':
        return theme === 'caves' ? 'dg_stairs_caves' : theme === 'crypt' ? 'dg_stairs_crypt' : 'dg_stairs_ruins';
      default:
        return theme === 'caves' ? 'dg_floor_caves' : theme === 'crypt' ? 'dg_floor_crypt' : 'dg_floor_ruins';
    }
  }

  private monsterKey(glyph: string): SpriteKey {
    if (glyph === 's') {
      return 'ent_slime';
    }
    if (glyph === 'O') {
      return 'ent_orc';
    }
    return 'ent_goblin';
  }
}

function themePalette(theme: DungeonTheme): { wall: string; floor: string; stairs: string; glyph: string } {
  switch (theme) {
    case 'ruins':
      return { wall: '#202a36', floor: '#0b1320', stairs: '#15243a', glyph: '#cfe3ff' };
    case 'caves':
      return { wall: '#1f2a20', floor: '#0a130c', stairs: '#17301a', glyph: '#cfe3ff' };
    case 'crypt':
      return { wall: '#2a1a2f', floor: '#120914', stairs: '#2c1231', glyph: '#e6d7ff' };
    default:
      return { wall: '#1b2430', floor: '#0b1320', stairs: '#122033', glyph: '#cfe3ff' };
  }
}
