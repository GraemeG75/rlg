import { Application, Container, Sprite, Texture, TilingSprite } from 'pixi.js';
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
  private effectLayer!: Container;
  private vignetteSprite?: Sprite;
  private vignetteTexture?: Texture;
  private fogSprite?: TilingSprite;
  private fogTexture?: Texture;
  private fogOffsetX: number;
  private fogOffsetY: number;
  private lastFogTime: number;
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
    this.fogOffsetX = 0;
    this.fogOffsetY = 0;
    this.lastFogTime = performance.now();

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
        this.effectLayer = new Container();
        this.app.stage.addChild(this.tileLayer);
        this.app.stage.addChild(this.entityLayer);
        this.app.stage.addChild(this.overlayLayer);
        this.app.stage.addChild(this.effectLayer);
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
    const lightRadius: number = Math.max(halfW, halfH) + 1;

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

          const dist: number = Math.max(Math.abs(x), Math.abs(y));
          const lightFactor: number = this.lightFalloff(dist, lightRadius);
          sprite.texture = this.getTexture(this.dungeonKey(dungeon.theme, tile));
          sprite.alpha = tileAlpha * lightFactor;
          sprite.visible = true;

          if (tile === 'stairsUp' || tile === 'stairsDown') {
            const palette = themePalette(dungeon.theme);
            pendingStairs.push({
              wx,
              wy,
              glyph: tile === 'stairsUp' ? '<' : '>',
              color: palette.glyph,
              alpha: tileAlpha * lightFactor
            });
          }
        }
      }
    }

    this.entityLayer.removeChildren();
    this.overlayLayer.removeChildren();

    const now: number = performance.now();
    this.drawItems(ctx, originX, originY, halfW, halfH, lightRadius, now);
    this.drawMonsters(ctx, originX, originY, halfW, halfH, lightRadius, now);
    this.drawPlayer(originX, originY, halfW, halfH, lightRadius, now);

    if (this.fogSprite) {
      this.fogSprite.visible = ctx.mode === 'dungeon';
    }
    this.updateFogDrift();

    if (this.vignetteSprite) {
      this.vignetteSprite.alpha = ctx.mode === 'dungeon' ? 0.75 : 0.45;
    }

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

    this.updateFog(widthPx, heightPx);
    this.updateVignette(widthPx, heightPx);

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

  private drawItems(ctx: PixiRenderContext, originX: number, originY: number, halfW: number, halfH: number, lightRadius: number, now: number): void {
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
      const bob: number = Math.sin(now / 320 + this.phaseFromId(it.id)) * 0.6;
      sprite.x = screen.x;
      sprite.y = screen.y + bob;
      sprite.width = this.tileSize;
      sprite.height = this.tileSize;
      if (ctx.mode === 'dungeon') {
        const dist: number = Math.max(Math.abs(it.pos.x - originX), Math.abs(it.pos.y - originY));
        sprite.alpha = this.lightFalloff(dist, lightRadius);
      }
      this.entityLayer.addChild(sprite);
    }
  }

  private drawMonsters(
    ctx: PixiRenderContext,
    originX: number,
    originY: number,
    halfW: number,
    halfH: number,
    lightRadius: number,
    now: number
  ): void {
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
      const sway: number = Math.sin(now / 520 + this.phaseFromId(entity.id)) * 0.4;
      sprite.x = screen.x;
      sprite.y = screen.y + sway;
      sprite.width = this.tileSize;
      sprite.height = this.tileSize;
      if (ctx.mode === 'dungeon') {
        const dist: number = Math.max(Math.abs(entity.pos.x - originX), Math.abs(entity.pos.y - originY));
        sprite.alpha = this.lightFalloff(dist, lightRadius);
      }
      this.entityLayer.addChild(sprite);
    }
  }

  private drawPlayer(originX: number, originY: number, halfW: number, halfH: number, lightRadius: number, now: number): void {
    const screen = this.worldToScreen(originX, originY, originX, originY, halfW, halfH);
    if (!screen) {
      return;
    }
    const sprite = new Sprite(this.getTexture('ent_player'));
    const pulse: number = Math.sin(now / 700) * 0.4;
    sprite.x = screen.x;
    sprite.y = screen.y + pulse;
    sprite.width = this.tileSize;
    sprite.height = this.tileSize;
    const dist: number = 0;
    sprite.alpha = this.lightFalloff(dist, lightRadius);
    this.overlayLayer.addChild(sprite);
  }

  private lightFalloff(dist: number, radius: number): number {
    const t: number = Math.min(1, dist / Math.max(1, radius));
    return Math.max(0.25, 1 - t * 0.85);
  }

  private phaseFromId(id: string): number {
    let hash: number = 0;
    for (let i: number = 0; i < id.length; i++) {
      hash = (hash * 31 + id.charCodeAt(i)) | 0;
    }
    return (hash % 628) / 100;
  }

  private updateFog(widthPx: number, heightPx: number): void {
    if (this.fogTexture) {
      this.fogTexture.destroy(true);
    }

    const canvas: HTMLCanvasElement = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    for (let i: number = 0; i < 120; i += 1) {
      const x: number = (i * 23) % canvas.width;
      const y: number = (i * 37) % canvas.height;
      ctx.beginPath();
      ctx.arc(x, y, (i % 7) + 3, 0, Math.PI * 2);
      ctx.fill();
    }

    this.fogTexture = Texture.from(canvas);
    if (!this.fogSprite) {
      this.fogSprite = new TilingSprite({ texture: this.fogTexture, width: widthPx, height: heightPx });
      this.fogSprite.alpha = 0.18;
      this.fogSprite.x = 0;
      this.fogSprite.y = 0;
      this.effectLayer.addChild(this.fogSprite);
    } else {
      this.fogSprite.texture = this.fogTexture;
      this.fogSprite.width = widthPx;
      this.fogSprite.height = heightPx;
    }
  }

  private updateFogDrift(): void {
    if (!this.fogSprite) {
      return;
    }
    const now: number = performance.now();
    const dt: number = Math.min(80, now - this.lastFogTime);
    this.lastFogTime = now;
    const driftSpeed: number = 0.006;
    this.fogOffsetX += dt * driftSpeed;
    this.fogOffsetY += dt * driftSpeed * 0.6;
    this.fogSprite.tilePosition.x = -this.fogOffsetX;
    this.fogSprite.tilePosition.y = -this.fogOffsetY;
  }

  private updateVignette(widthPx: number, heightPx: number): void {
    if (this.vignetteTexture) {
      this.vignetteTexture.destroy(true);
    }

    const canvas: HTMLCanvasElement = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const cx: number = widthPx / 2;
    const cy: number = heightPx / 2;
    const radius: number = Math.max(widthPx, heightPx) * 0.7;
    const gradient: CanvasGradient = ctx.createRadialGradient(cx, cy, radius * 0.08, cx, cy, radius);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.2)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.75)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, widthPx, heightPx);

    this.vignetteTexture = Texture.from(canvas);
    if (!this.vignetteSprite) {
      this.vignetteSprite = new Sprite(this.vignetteTexture);
      this.vignetteSprite.x = 0;
      this.vignetteSprite.y = 0;
      this.vignetteSprite.width = widthPx;
      this.vignetteSprite.height = heightPx;
      this.effectLayer.addChild(this.vignetteSprite);
    } else {
      this.vignetteSprite.texture = this.vignetteTexture;
      this.vignetteSprite.width = widthPx;
      this.vignetteSprite.height = heightPx;
    }
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
