import { Application, Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { Entity, Item, Mode } from '../core/types';
import type { Overworld } from '../maps/overworld';
import type { Dungeon, DungeonTheme } from '../maps/dungeon';
import type { Town } from '../maps/town';
import { getDungeonTile, getVisibility } from '../maps/dungeon';
import { getTownTile } from '../maps/town';
import { SpriteAtlas, type SpriteKey } from './sprites';
import { t } from '../i18n';

type PixiRenderContext = {
  mode: Mode;
  overworld: Overworld;
  dungeon: Dungeon | undefined;
  town: Town | undefined;
  player: Entity;
  entities: Entity[];
  items: Item[];
  useFov: boolean;
};

type PixiRenderMode = 'canvas' | 'isometric';

/**
 * Renderer implementation using Pixi.js. Uses a single sprite sheet for all tiles and entities, with dynamic texture generation for things like lighting and isometric rendering.
 */
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
  private cloudFarSprite?: TilingSprite;
  private cloudFarTexture?: Texture;
  private cloudSprite?: TilingSprite;
  private cloudTexture?: Texture;
  private fogOffsetX: number;
  private fogOffsetY: number;
  private lastFogTime: number;
  private cloudFarOffsetX: number;
  private cloudFarOffsetY: number;
  private lastCloudFarTime: number;
  private cloudOffsetX: number;
  private cloudOffsetY: number;
  private lastCloudTime: number;
  private levelUpUntil: number;
  private levelUpPulseStart: number;
  private levelUpQueued: boolean;
  private bannerLabel: string;
  private bannerDurationMs: number;
  private levelUpBanner?: Sprite;
  private levelUpRays?: Sprite;
  private readonly textures: Map<SpriteKey | string, Texture>;
  private readonly tileSize: number;
  private readonly canvas: HTMLCanvasElement;
  private tileSprites: Sprite[];
  private viewWidth: number;
  private viewHeight: number;
  private initialized: boolean;
  private pendingRender?: { ctx: PixiRenderContext; viewWidth: number; viewHeight: number; renderMode: PixiRenderMode };
  private lastRender?: { ctx: PixiRenderContext; viewWidth: number; viewHeight: number; renderMode: PixiRenderMode };

  /**
   * Creates a new PixiRenderer instance.
   * @param canvas The HTML canvas element to render on.
   */
  public constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.tileSize = 16;
    this.atlas = new SpriteAtlas(this.tileSize);
    this.atlas.onUpdate = () => {
      this.textures.clear();
      if (this.initialized && this.lastRender) {
        this.render(this.lastRender.ctx, this.lastRender.viewWidth, this.lastRender.viewHeight, this.lastRender.renderMode);
      }
    };
    this.textures = new Map<SpriteKey | string, Texture>();
    this.tileSprites = [];
    this.viewWidth = 0;
    this.viewHeight = 0;
    this.initialized = false;
    this.fogOffsetX = 0;
    this.fogOffsetY = 0;
    this.lastFogTime = performance.now();
    this.cloudFarOffsetX = 0;
    this.cloudFarOffsetY = 0;
    this.lastCloudFarTime = performance.now();
    this.cloudOffsetX = 0;
    this.cloudOffsetY = 0;
    this.lastCloudTime = performance.now();
    this.levelUpUntil = 0;
    this.levelUpPulseStart = 0;
    this.levelUpQueued = false;
    this.bannerLabel = '';
    this.bannerDurationMs = 1200;

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

        if (this.levelUpQueued) {
          this.levelUpQueued = false;
          this.ensureLevelUpSprites();
        }

        if (this.pendingRender) {
          const pending = this.pendingRender;
          this.pendingRender = undefined;
          this.render(pending.ctx, pending.viewWidth, pending.viewHeight, pending.renderMode);
        }
      })
      .catch((err) => {
        console.error('Pixi renderer init failed', err);
      });
  }

  /**
   * Renders the game scene using Pixi.js.
   * @param ctx The rendering context containing game state.
   * @param viewWidth The width of the view in tiles.
   * @param viewHeight The height of the view in tiles.
   * @param renderMode The rendering mode, either 'canvas' or 'isometric'.
   * @returns void
   */
  public render(ctx: PixiRenderContext, viewWidth: number, viewHeight: number, renderMode: PixiRenderMode = 'canvas'): void {
    this.lastRender = { ctx, viewWidth, viewHeight, renderMode };
    if (!this.initialized) {
      this.pendingRender = { ctx, viewWidth, viewHeight, renderMode };
      return;
    }

    if (viewWidth <= 0 || viewHeight <= 0) {
      return;
    }

    if (viewWidth !== this.viewWidth || viewHeight !== this.viewHeight) {
      this.rebuildView(viewWidth, viewHeight);
    }

    if (renderMode === 'isometric') {
      this.renderIsometric(ctx, viewWidth, viewHeight);
      return;
    }

    this.hideLevelUpEffect();

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
        } else if (ctx.mode === 'dungeon') {
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
        } else {
          const town: Town | undefined = ctx.town;
          if (!town) {
            sprite.visible = false;
            continue;
          }
          if (wx < 0 || wy < 0 || wx >= town.width || wy >= town.height) {
            sprite.visible = false;
            continue;
          }
          const tile = getTownTile(town, wx, wy);
          sprite.texture = this.getTexture(this.townKey(tile));
          sprite.alpha = 1;
          sprite.visible = true;
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

  /**
   * Renders the game scene in isometric view using Pixi.js.
   * @param ctx The rendering context containing game state.
   * @param viewWidth The width of the view in tiles.
   * @param viewHeight The height of the view in tiles.
   */
  private renderIsometric(ctx: PixiRenderContext, viewWidth: number, viewHeight: number): void {
    const isoTileW: number = this.tileSize * 2;
    const isoTileH: number = this.tileSize;
    const needX: number = Math.max(1, Math.ceil(this.app.renderer.width / (isoTileW / 2)) + 2);
    const needY: number = Math.max(1, Math.ceil(this.app.renderer.height / (isoTileH / 2)) + 2);
    const span: number = Math.max(needX, needY);
    const renderW: number = span;
    const renderH: number = span;
    const originX: number = ctx.player.pos.x;
    const originY: number = ctx.player.pos.y;
    const halfW: number = Math.floor(renderW / 2);
    const halfH: number = Math.floor(renderH / 2);
    const lightRadius: number = Math.max(halfW, halfH) + 1;
    const now: number = performance.now();

    const centerX: number = Math.floor(this.app.renderer.width / 2) - Math.floor(isoTileW / 2);
    const centerY: number = Math.floor(this.app.renderer.height / 2) - Math.floor(isoTileH / 2);

    this.tileLayer.removeChildren();
    this.entityLayer.removeChildren();
    this.overlayLayer.removeChildren();

    const tiles: { wx: number; wy: number; kind: 'overworld' | 'dungeon' | 'town'; tile: string; theme?: DungeonTheme; alpha: number }[] = [];

    for (let row: number = 0; row < renderH; row++) {
      for (let col: number = 0; col < renderW; col++) {
        const x: number = col - halfW;
        const y: number = row - halfH;
        const wx: number = originX + x;
        const wy: number = originY + y;

        if (ctx.mode === 'overworld') {
          const tile: string = ctx.overworld.getTile(wx, wy);
          tiles.push({ wx, wy, kind: 'overworld', tile, alpha: 1 });
          continue;
        }

        if (ctx.mode === 'dungeon') {
          const dungeon: Dungeon | undefined = ctx.dungeon;
          if (!dungeon) {
            continue;
          }
          if (wx < 0 || wy < 0 || wx >= dungeon.width || wy >= dungeon.height) {
            continue;
          }
          if (ctx.useFov) {
            const vis = getVisibility(dungeon, wx, wy);
            if (vis === 'unseen') {
              continue;
            }
          }
          const dist: number = Math.max(Math.abs(x), Math.abs(y));
          const lightFactor: number = this.lightFalloff(dist, lightRadius);
          let tileAlpha: number = 1;
          if (ctx.useFov) {
            const vis = getVisibility(dungeon, wx, wy);
            if (vis === 'seen') {
              tileAlpha = 0.35;
            }
          }
          const tile = getDungeonTile(dungeon, wx, wy);
          tiles.push({ wx, wy, kind: 'dungeon', tile, theme: dungeon.theme, alpha: tileAlpha * lightFactor });
          continue;
        }

        const town: Town | undefined = ctx.town;
        if (!town) {
          continue;
        }
        if (wx < 0 || wy < 0 || wx >= town.width || wy >= town.height) {
          continue;
        }
        const tile = getTownTile(town, wx, wy);
        tiles.push({ wx, wy, kind: 'town', tile, alpha: 1 });
      }
    }

    tiles.sort((a, b) => a.wx + a.wy - (b.wx + b.wy) || a.wx - b.wx);

    for (const t of tiles) {
      const tileHeight: number = this.isoTileHeight(t.kind, t.tile, isoTileH);
      const screen = this.isoToScreen(t.wx, t.wy, originX, originY, centerX, centerY, isoTileW, isoTileH);
      const sprite = new Sprite(this.getIsoTileTexture(t.kind, t.tile, t.theme, isoTileW, isoTileH, tileHeight));
      sprite.x = screen.x;
      sprite.y = screen.y - tileHeight;
      sprite.width = isoTileW;
      sprite.height = isoTileH + tileHeight;
      sprite.alpha = t.alpha;
      this.tileLayer.addChild(sprite);

      if (t.kind === 'overworld' && t.tile === 'dungeon') {
        const glow = new Sprite(this.getIsoDungeonGlowTexture(isoTileW, isoTileH));
        const pulse: number = 0.55 + Math.sin(now / 420 + this.phaseFromId(`${t.wx},${t.wy}`)) * 0.2;
        glow.x = screen.x;
        glow.y = screen.y - tileHeight;
        glow.width = isoTileW;
        glow.height = isoTileH;
        glow.alpha = pulse;
        this.overlayLayer.addChild(glow);
      }
    }

    // Highlight the player's tile for readability (under entities).
    const playerBaseHeight: number = this.isoTileHeightAt(ctx, originX, originY, isoTileH);
    const playerTile = this.isoToScreen(originX, originY, originX, originY, centerX, centerY, isoTileW, isoTileH);
    const highlight = new Sprite(this.getIsoHighlightTexture(isoTileW, isoTileH));
    highlight.x = playerTile.x;
    highlight.y = playerTile.y - playerBaseHeight;
    highlight.width = isoTileW;
    highlight.height = isoTileH;
    highlight.alpha = 0.5;
    this.tileLayer.addChild(highlight);

    const draws: { wx: number; wy: number; key: SpriteKey; alpha: number; yOffset: number; bob: number }[] = [];
    const isoEntityXOffset: number = (isoTileW - this.tileSize) / 2;

    for (const it of ctx.items) {
      if (!it.mapRef || !it.pos) {
        continue;
      }
      if (ctx.mode === 'overworld') {
        if (it.mapRef.kind !== 'overworld') {
          continue;
        }
      } else if (ctx.mode === 'dungeon') {
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
      } else {
        const town: Town | undefined = ctx.town;
        if (!town) {
          continue;
        }
        if (it.mapRef.kind !== 'town' || it.mapRef.townId !== town.id) {
          continue;
        }
      }

      const spriteKey: SpriteKey = it.kind === 'potion' ? 'it_potion' : it.kind === 'weapon' ? 'it_weapon' : 'it_armor';
      const dist: number = Math.max(Math.abs(it.pos.x - originX), Math.abs(it.pos.y - originY));
      const alpha: number = ctx.mode === 'dungeon' ? this.lightFalloff(dist, lightRadius) : 1;
      const baseHeight: number = this.isoTileHeightAt(ctx, it.pos.x, it.pos.y, isoTileH);
      draws.push({
        wx: it.pos.x,
        wy: it.pos.y,
        key: spriteKey,
        alpha,
        yOffset: this.tileSize / 2 - isoTileH / 2 + baseHeight,
        bob: Math.sin(now / 320 + this.phaseFromId(it.id)) * 0.6
      });
    }

    for (const entity of ctx.entities) {
      if (entity.kind !== 'monster' || entity.hp <= 0) {
        continue;
      }

      if (ctx.mode === 'overworld') {
        if (entity.mapRef.kind !== 'overworld') {
          continue;
        }
      } else if (ctx.mode === 'dungeon') {
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
      } else {
        const town: Town | undefined = ctx.town;
        if (!town) {
          continue;
        }
        if (entity.mapRef.kind !== 'town' || entity.mapRef.townId !== town.id) {
          continue;
        }
      }

      const dist: number = Math.max(Math.abs(entity.pos.x - originX), Math.abs(entity.pos.y - originY));
      const alpha: number = ctx.mode === 'dungeon' ? this.lightFalloff(dist, lightRadius) : 1;
      const baseHeight: number = this.isoTileHeightAt(ctx, entity.pos.x, entity.pos.y, isoTileH);
      draws.push({
        wx: entity.pos.x,
        wy: entity.pos.y,
        key: this.monsterKey(entity.glyph),
        alpha,
        yOffset: this.tileSize / 2 - isoTileH / 2 + baseHeight,
        bob: Math.sin(now / 520 + this.phaseFromId(entity.id)) * 0.4
      });
    }

    draws.push({
      wx: originX,
      wy: originY,
      key: 'ent_player',
      alpha: ctx.mode === 'dungeon' ? this.lightFalloff(0, lightRadius) : 1,
      yOffset: this.tileSize / 2 - isoTileH / 2 + playerBaseHeight,
      bob: Math.sin(now / 700) * 0.4
    });

    draws.sort((a, b) => a.wx + a.wy - (b.wx + b.wy) || a.wx - b.wx);

    for (const d of draws) {
      const screen = this.isoToScreen(d.wx, d.wy, originX, originY, centerX, centerY, isoTileW, isoTileH);
      const sprite = new Sprite(this.getTexture(d.key));
      sprite.x = screen.x + isoEntityXOffset;
      sprite.y = screen.y - d.yOffset + d.bob;
      sprite.width = this.tileSize;
      sprite.height = this.tileSize;
      sprite.alpha = d.alpha;
      this.entityLayer.addChild(sprite);
    }

    // Highlight rendered under entities.

    if (this.fogSprite) {
      this.fogSprite.visible = ctx.mode === 'dungeon';
    }
    this.updateFogDrift();

    if (this.vignetteSprite) {
      this.vignetteSprite.alpha = ctx.mode === 'dungeon' ? 0.75 : 0.45;
    }

    this.renderLevelUpEffect(now);
    this.app.render();
  }

  /**
   * Creates a texture for highlighting isometric tiles.
   * @param isoTileW The width of the isometric tile.
   * @param isoTileH The height of the isometric tile.
   * @returns The generated texture.
   */
  private getIsoHighlightTexture(isoTileW: number, isoTileH: number): Texture {
    const cacheKey: string = `iso_highlight_${isoTileW}x${isoTileH}`;
    const cached: Texture | undefined = this.textures.get(cacheKey);
    if (cached) {
      return cached;
    }

    const canvas: HTMLCanvasElement = document.createElement('canvas');
    canvas.width = isoTileW;
    canvas.height = isoTileH;
    const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas not available for iso highlight.');
    }

    const w: number = canvas.width;
    const h: number = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w, h / 2);
    ctx.lineTo(w / 2, h);
    ctx.lineTo(0, h / 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 235, 190, 0.3)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 240, 210, 0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const texture: Texture = Texture.from(canvas);
    this.textures.set(cacheKey, texture);
    return texture;
  }

  /**
   * Creates a texture for the dungeon glow effect in isometric view.
   * @param isoTileW The width of the isometric tile.
   * @param isoTileH The height of the isometric tile.
   * @returns The generated texture.
   */
  private getIsoDungeonGlowTexture(isoTileW: number, isoTileH: number): Texture {
    const cacheKey: string = `iso_dungeon_glow_${isoTileW}x${isoTileH}`;
    const cached: Texture | undefined = this.textures.get(cacheKey);
    if (cached) {
      return cached;
    }

    const canvas: HTMLCanvasElement = document.createElement('canvas');
    canvas.width = isoTileW;
    canvas.height = isoTileH;
    const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas not available for iso dungeon glow.');
    }

    const w: number = canvas.width;
    const h: number = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w, h / 2);
    ctx.lineTo(w / 2, h);
    ctx.lineTo(0, h / 2);
    ctx.closePath();
    ctx.clip();

    const gradient: CanvasGradient = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w * 0.55);
    gradient.addColorStop(0, 'rgba(255, 210, 130, 0.9)');
    gradient.addColorStop(0.55, 'rgba(255, 150, 70, 0.45)');
    gradient.addColorStop(1, 'rgba(255, 120, 50, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    const texture: Texture = Texture.from(canvas);
    this.textures.set(cacheKey, texture);
    return texture;
  }

  /**
   * Calculates the height of an isometric tile at a given world position.
   * @param ctx The rendering context containing game state.
   * @param wx The world x-coordinate of the tile.
   * @param wy The world y-coordinate of the tile.
   * @param isoTileH The height of the isometric tile.
   * @returns The height of the isometric tile at the given position.
   */
  private isoTileHeightAt(ctx: PixiRenderContext, wx: number, wy: number, isoTileH: number): number {
    if (ctx.mode === 'overworld') {
      const tile: string = ctx.overworld.getTile(wx, wy);
      return this.isoTileHeight('overworld', tile, isoTileH);
    }
    if (ctx.mode === 'dungeon') {
      const dungeon: Dungeon | undefined = ctx.dungeon;
      if (!dungeon) {
        return 0;
      }
      if (wx < 0 || wy < 0 || wx >= dungeon.width || wy >= dungeon.height) {
        return 0;
      }
      const tile = getDungeonTile(dungeon, wx, wy);
      return this.isoTileHeight('dungeon', tile, isoTileH);
    }
    const town: Town | undefined = ctx.town;
    if (!town) {
      return 0;
    }
    if (wx < 0 || wy < 0 || wx >= town.width || wy >= town.height) {
      return 0;
    }
    const tile = getTownTile(town, wx, wy);
    return this.isoTileHeight('town', tile, isoTileH);
  }

  /**
   * Creates a texture for an isometric tile.
   * @param kind The type of the tile ('overworld', 'dungeon', or 'town').
   * @param tile The tile identifier.
   * @param theme The theme of the dungeon, if applicable.
   * @param isoTileW The width of the isometric tile.
   * @param isoTileH The height of the isometric tile.
   * @param tileHeight The height of the tile in pixels.
   * @returns The generated texture.
   */
  private getIsoTileTexture(
    kind: 'overworld' | 'dungeon' | 'town',
    tile: string,
    theme: DungeonTheme | undefined,
    isoTileW: number,
    isoTileH: number,
    tileHeight: number
  ): Texture {
    const colors = this.isoTileColors(kind, tile, theme);
    const spriteKey: SpriteKey | undefined = this.isoTileSpriteKey(kind, tile, theme);
    const cacheKey: string = `iso_${kind}_${tile}_${theme ?? 'none'}_${spriteKey ?? 'none'}_${colors.base}_${colors.edge}_${isoTileW}x${isoTileH}_${tileHeight}`;
    const cached: Texture | undefined = this.textures.get(cacheKey);
    if (cached) {
      return cached;
    }

    const canvas: HTMLCanvasElement = document.createElement('canvas');
    canvas.width = isoTileW;
    canvas.height = isoTileH + tileHeight;
    const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas not available for iso tile.');
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const w: number = canvas.width;
    const h: number = canvas.height;

    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w, isoTileH / 2);
    ctx.lineTo(w / 2, isoTileH);
    ctx.lineTo(0, isoTileH / 2);
    ctx.closePath();

    if (spriteKey) {
      ctx.save();
      ctx.clip();
      this.drawIsoTopFromSprite(ctx, spriteKey, isoTileW, isoTileH);
      ctx.restore();
    } else {
      ctx.fillStyle = colors.base;
      ctx.fill();
      this.applyIsoTileDetail(ctx, kind, tile, isoTileW, isoTileH);
    }

    ctx.strokeStyle = colors.edge;
    ctx.lineWidth = 1;
    ctx.stroke();

    if (tileHeight > 0) {
      const sideLeft: string = colors.edge;
      const sideRight: string = this.darkenHex(colors.base, 0.2);

      ctx.fillStyle = sideLeft;
      ctx.beginPath();
      ctx.moveTo(0, isoTileH / 2);
      ctx.lineTo(w / 2, isoTileH);
      ctx.lineTo(w / 2, isoTileH + tileHeight);
      ctx.lineTo(0, isoTileH / 2 + tileHeight);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = sideRight;
      ctx.beginPath();
      ctx.moveTo(w, isoTileH / 2);
      ctx.lineTo(w / 2, isoTileH);
      ctx.lineTo(w / 2, isoTileH + tileHeight);
      ctx.lineTo(w, isoTileH / 2 + tileHeight);
      ctx.closePath();
      ctx.fill();
    }

    const texture: Texture = Texture.from(canvas);
    this.textures.set(cacheKey, texture);
    return texture;
  }

  private drawIsoTopFromSprite(ctx: CanvasRenderingContext2D, key: SpriteKey, isoTileW: number, isoTileH: number): void {
    const sprite: HTMLCanvasElement = this.atlas.get(key);
    const s: number = this.tileSize;

    // Create temporary canvas to pre-rotate sprite 45 degrees
    const tempCanvas: HTMLCanvasElement = document.createElement('canvas');
    const diagonal: number = Math.sqrt(2) * s;
    tempCanvas.width = diagonal;
    tempCanvas.height = diagonal;
    const tempCtx: CanvasRenderingContext2D = tempCanvas.getContext('2d')!;
    tempCtx.imageSmoothingEnabled = false;

    // Rotate sprite 45 degrees around center
    tempCtx.translate(diagonal / 2, diagonal / 2);
    tempCtx.rotate(Math.PI / 4);
    tempCtx.drawImage(sprite, -s / 2, -s / 2, s, s);

    // Now apply isometric scaling without shear to preserve vertical orientation
    ctx.save();
    const scaleX: number = isoTileW / diagonal;
    const scaleY: number = isoTileH / diagonal;
    ctx.translate(isoTileW / 2, isoTileH / 2);
    ctx.scale(scaleX, scaleY);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tempCanvas, -diagonal / 2, -diagonal / 2, diagonal, diagonal);
    ctx.restore();
  }

  /**
   * Applies detailed textures to an isometric tile.
   * @param ctx The canvas rendering context.
   * @param kind The type of the tile ('overworld', 'dungeon', or 'town').
   * @param tile The tile identifier.
   * @param isoTileW The width of the isometric tile.
   * @param isoTileH The height of the isometric tile.
   * @returns
   */
  private applyIsoTileDetail(
    ctx: CanvasRenderingContext2D,
    kind: 'overworld' | 'dungeon' | 'town',
    tile: string,
    isoTileW: number,
    isoTileH: number
  ): void {
    if (this.isoTileSpriteKey(kind, tile, undefined)) {
      return;
    }
    if (kind !== 'overworld') {
      return;
    }

    const w: number = isoTileW;
    const h: number = isoTileH;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w, h / 2);
    ctx.lineTo(w / 2, h);
    ctx.lineTo(0, h / 2);
    ctx.closePath();
    ctx.clip();

    if (tile === 'grass') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      for (let i: number = 0; i < 18; i += 1) {
        ctx.fillRect((i * 7) % w, (i * 11) % h, 2, 1);
      }
    } else if (tile === 'forest') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      for (let i: number = 0; i < 8; i += 1) {
        const x: number = (i * 11) % w;
        const y: number = (i * 13) % h;
        ctx.fillRect(x, y, 4, 2);
      }
      // Simple tree silhouettes.
      ctx.fillStyle = 'rgba(22, 52, 30, 0.85)';
      ctx.beginPath();
      ctx.moveTo(w * 0.25, h * 0.7);
      ctx.lineTo(w * 0.35, h * 0.4);
      ctx.lineTo(w * 0.45, h * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(w * 0.55, h * 0.65);
      ctx.lineTo(w * 0.65, h * 0.35);
      ctx.lineTo(w * 0.75, h * 0.65);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(56, 38, 24, 0.8)';
      ctx.fillRect(w * 0.32, h * 0.68, w * 0.03, h * 0.12);
      ctx.fillRect(w * 0.62, h * 0.64, w * 0.03, h * 0.13);
    } else if (tile === 'water' || tile === 'water_deep') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      for (let i: number = 0; i < 4; i += 1) {
        const y: number = h * 0.2 + i * (h * 0.18);
        ctx.beginPath();
        ctx.moveTo(w * 0.1, y);
        ctx.lineTo(w * 0.9, y - h * 0.06);
        ctx.stroke();
      }
    } else if (tile === 'mountain' || tile === 'mountain_snow') {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.lineWidth = 1;
      for (let i: number = 0; i < 5; i += 1) {
        const y: number = h * 0.2 + i * (h * 0.12);
        ctx.beginPath();
        ctx.moveTo(w * 0.15, y);
        ctx.lineTo(w * 0.85, y + h * 0.04);
        ctx.stroke();
      }
      if (tile === 'mountain_snow') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.fillRect(w * 0.25, h * 0.15, w * 0.5, h * 0.15);
      }
    } else if (tile === 'cave') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.6, w * 0.16, h * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.62, w * 0.1, h * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      // Cutout wedge to imply a bite from the cliff face
      ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.32);
      ctx.lineTo(w * 0.72, h * 0.5);
      ctx.lineTo(w * 0.5, h * 0.68);
      ctx.lineTo(w * 0.28, h * 0.5);
      ctx.closePath();
      ctx.fill();
      // Shadow spill on the lower edge
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.fillRect(w * 0.22, h * 0.7, w * 0.56, h * 0.08);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fillRect(w * 0.32, h * 0.36, w * 0.36, h * 0.06);
    }

    ctx.restore();
  }

  /**
   * Determines the colors for an isometric tile based on its type and theme.
   * @param kind The type of the tile ('overworld', 'dungeon', or 'town').
   * @param tile The tile identifier.
   * @param theme The theme of the dungeon, if applicable.
   * @returns An object containing the base and edge colors for the tile.
   */
  private isoTileColors(kind: 'overworld' | 'dungeon' | 'town', tile: string, theme: DungeonTheme | undefined): { base: string; edge: string } {
    if (kind === 'overworld') {
      switch (tile) {
        case 'water':
          return { base: '#0c2f4a', edge: '#0f496d' };
        case 'water_deep':
          return { base: '#071d2e', edge: '#0b2b44' };
        case 'forest':
          return { base: '#0e2a1b', edge: '#184a2f' };
        case 'mountain':
          return { base: '#3a3f46', edge: '#555b63' };
        case 'mountain_snow':
          return { base: '#b9c2cd', edge: '#dde3ea' };
        case 'road':
          return { base: '#4f5359', edge: '#6b727a' };
        case 'cave':
          return { base: '#2a2c2f', edge: '#3b3f45' };
        case 'town_ground':
          return { base: '#2f2720', edge: '#3f352b' };
        case 'town_road':
          return { base: '#3a2f25', edge: '#4a3b2e' };
        case 'town_square':
          return { base: '#3d332a', edge: '#4f4134' };
        case 'town_wall':
        case 'town_gate':
          return { base: '#232a34', edge: '#343f4d' };
        case 'town_shop':
        case 'town_tavern':
        case 'town_smith':
        case 'town_house':
          return { base: '#3b2f23', edge: '#4a3a2b' };
        case 'town':
        case 'grass':
        default:
          return { base: '#1f3a24', edge: '#2f5433' };
      }
    }

    if (kind === 'town') {
      switch (tile) {
        case 'road':
          return { base: '#2b241d', edge: '#3a2f25' };
        case 'square':
          return { base: '#2f2924', edge: '#3d352f' };
        case 'gate':
        case 'wall':
          return { base: '#2a2430', edge: '#3a3242' };
        case 'shop':
        case 'tavern':
        case 'smith':
        case 'house':
          return { base: '#2f2720', edge: '#3f352b' };
        case 'floor':
        default:
          return { base: '#1d1a16', edge: '#2b241d' };
      }
    }

    const palette = themePalette(theme ?? 'ruins');
    switch (tile) {
      case 'wall':
        return { base: palette.wall, edge: palette.stairs };
      case 'stairsUp':
      case 'stairsDown':
        return { base: palette.stairs, edge: palette.glyph };
      case 'bossFloor':
        return { base: palette.floor, edge: '#7f6b4a' };
      case 'floor':
      default:
        return { base: palette.floor, edge: '#2a3340' };
    }
  }

  private isoTileSpriteKey(kind: 'overworld' | 'dungeon' | 'town', tile: string, theme: DungeonTheme | undefined): SpriteKey | undefined {
    if (kind === 'overworld') {
      switch (tile) {
        case 'water':
          return 'ow_water';
        case 'water_deep':
          return 'ow_water_deep';
        case 'grass':
          return 'ow_grass';
        case 'forest':
          return 'ow_forest';
        case 'mountain':
          return 'ow_mountain';
        case 'mountain_snow':
          return 'ow_mountain_snow';
        case 'road':
          return 'ow_road';
        case 'town_ground':
          return 'ow_town_ground';
        case 'town_road':
          return 'ow_town_road';
        case 'town_square':
          return 'ow_town_square';
        case 'town_shop':
          return 'ow_town_shop';
        case 'town_tavern':
          return 'ow_town_tavern';
        case 'town_smith':
          return 'ow_town_smith';
        case 'town_house':
          return 'ow_town_house';
        case 'town_wall':
          return 'ow_town_wall';
        case 'town_gate':
          return 'ow_town_gate';
        case 'dungeon':
          return 'ow_dungeon';
        case 'cave':
          return 'ow_cave';
        case 'town':
          return 'ow_town';
        default:
          return undefined;
      }
    }

    if (kind === 'town') {
      switch (tile) {
        case 'floor':
          return 'tn_floor';
        case 'wall':
          return 'tn_wall';
        case 'road':
          return 'tn_road';
        case 'square':
          return 'tn_square';
        case 'gate':
          return 'tn_gate';
        case 'shop':
          return 'tn_shop';
        case 'tavern':
          return 'tn_tavern';
        case 'smith':
          return 'tn_smith';
        case 'house':
          return 'tn_house';
        default:
          return undefined;
      }
    }

    const suffix: string = theme === 'caves' ? 'caves' : theme === 'crypt' ? 'crypt' : 'ruins';
    switch (tile) {
      case 'wall':
        return `dg_wall_${suffix}` as SpriteKey;
      case 'floor':
        return `dg_floor_${suffix}` as SpriteKey;
      case 'bossFloor':
        return `dg_boss_floor_${suffix}` as SpriteKey;
      case 'stairsUp':
      case 'stairsDown':
        return `dg_stairs_${suffix}` as SpriteKey;
      default:
        return undefined;
    }
  }

  /**
   * Calculates the height of an isometric tile at a given world position.
   * @param kind The type of the tile ('overworld', 'dungeon', or 'town').
   * @param tile The tile identifier.
   * @param isoTileH The height of the isometric tile.
   * @returns The height of the isometric tile at the given position.
   */
  private isoTileHeight(kind: 'overworld' | 'dungeon' | 'town', tile: string, isoTileH: number): number {
    const low: number = Math.max(2, Math.floor(isoTileH * 0.2));
    const high: number = Math.max(5, Math.floor(isoTileH * 0.8));

    if (kind === 'dungeon') {
      return tile === 'wall' ? high : low;
    }
    if (kind === 'town') {
      return tile === 'wall' ? high : low;
    }
    if (kind === 'overworld') {
      if (tile === 'mountain' || tile === 'mountain_snow' || tile === 'town_wall') {
        return high;
      }
      if (tile === 'water') {
        return 0;
      }
      return low;
    }
    return low;
  }

  /**
   * Darkens a hex color by a given amount.
   * @param color The hex color to darken.
   * @param amount The amount to darken the color (0 to 1).
   * @returns The darkened hex color.
   */
  private darkenHex(color: string, amount: number): string {
    const raw: string = color.startsWith('#') ? color.slice(1) : color;
    if (raw.length !== 6) {
      return color;
    }
    const r: number = parseInt(raw.slice(0, 2), 16);
    const g: number = parseInt(raw.slice(2, 4), 16);
    const b: number = parseInt(raw.slice(4, 6), 16);
    const scale: number = Math.max(0, Math.min(1, 1 - amount));
    const nr: number = Math.max(0, Math.min(255, Math.round(r * scale)));
    const ng: number = Math.max(0, Math.min(255, Math.round(g * scale)));
    const nb: number = Math.max(0, Math.min(255, Math.round(b * scale)));
    return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
  }

  /**
   * Triggers the level up effect.
   */
  public triggerLevelUpEffect(): void {
    this.triggerBannerEffect(t('ui.fx.levelUp'));
  }

  /**
   * Triggers a banner effect with a given label and duration.
   * @param label The text to display on the banner.
   * @param durationMs The duration of the banner effect in milliseconds.
   * @returns void
   */
  public triggerBannerEffect(label: string, durationMs: number = 1200): void {
    const now: number = performance.now();
    this.bannerLabel = label;
    this.bannerDurationMs = durationMs;
    this.levelUpUntil = now + durationMs;
    this.levelUpPulseStart = now;
    if (!this.initialized) {
      this.levelUpQueued = true;
      return;
    }
    this.ensureLevelUpSprites();
    if (this.levelUpBanner) {
      this.levelUpBanner.texture = this.getBannerTexture(label);
    }
  }

  /**
   * Ensures that the level up sprites are created and added to the effect layer.
   */
  private ensureLevelUpSprites(): void {
    if (!this.levelUpRays) {
      this.levelUpRays = new Sprite(this.getLevelUpRaysTexture());
      this.levelUpRays.x = 0;
      this.levelUpRays.y = 0;
      this.levelUpRays.alpha = 0;
      this.levelUpRays.visible = false;
      this.effectLayer.addChild(this.levelUpRays);
    }

    if (!this.levelUpBanner) {
      this.levelUpBanner = new Sprite(this.getBannerTexture(this.bannerLabel || t('ui.fx.levelUp')));
      this.levelUpBanner.x = 0;
      this.levelUpBanner.y = 8;
      this.levelUpBanner.alpha = 0;
      this.levelUpBanner.visible = false;
      this.effectLayer.addChild(this.levelUpBanner);
    }
  }

  /**
   * Hides the active banner effect sprites.
   */
  private hideLevelUpEffect(): void {
    if (this.levelUpBanner) {
      this.levelUpBanner.visible = false;
    }
    if (this.levelUpRays) {
      this.levelUpRays.visible = false;
    }
  }

  /**
   * Renders the banner effect for the current frame.
   * @param now The current timestamp in milliseconds.
   */
  private renderLevelUpEffect(now: number): void {
    if (this.levelUpUntil <= now) {
      this.hideLevelUpEffect();
      return;
    }

    this.ensureLevelUpSprites();
    if (!this.levelUpBanner || !this.levelUpRays) {
      return;
    }

    const duration: number = this.bannerDurationMs;
    const remaining: number = this.levelUpUntil - now;
    const progress: number = Math.min(1, Math.max(0, 1 - remaining / duration));
    const fadeIn: number = Math.min(1, progress / 0.18);
    const fadeOut: number = Math.min(1, (1 - progress) / 0.2);
    const alpha: number = Math.min(fadeIn, fadeOut);
    const pulse: number = 0.9 + Math.sin((now - this.levelUpPulseStart) / 140) * 0.1;

    const widthPx: number = this.app.renderer.width;
    const bannerWidth: number = Math.min(widthPx * 0.86, 540);
    const bannerHeight: number = 56;
    const topPad: number = 8;

    this.levelUpBanner.visible = true;
    this.levelUpBanner.width = bannerWidth;
    this.levelUpBanner.height = bannerHeight;
    this.levelUpBanner.x = Math.round((widthPx - bannerWidth) / 2);
    this.levelUpBanner.y = topPad;
    this.levelUpBanner.alpha = alpha * pulse;

    this.levelUpRays.visible = true;
    this.levelUpRays.width = widthPx;
    this.levelUpRays.height = 180;
    this.levelUpRays.x = 0;
    this.levelUpRays.y = 0;
    this.levelUpRays.alpha = alpha * 0.65;
  }

  /**
   * Builds or retrieves a cached banner texture for the given label.
   * @param label The banner text to render.
   * @returns The banner texture.
   */
  private getBannerTexture(label: string): Texture {
    const normalizedLabel: string = label.trim().replace(/\s+/g, '_');
    const cacheKey: string = `fx_banner_${normalizedLabel}`;
    const cached: Texture | undefined = this.textures.get(cacheKey);
    if (cached) {
      return cached;
    }

    const canvas: HTMLCanvasElement = document.createElement('canvas');
    canvas.width = 520;
    canvas.height = 64;
    const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas not available for level-up banner.');
    }

    const w: number = canvas.width;
    const h: number = canvas.height;
    const gradient: CanvasGradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(255, 218, 150, 0.95)');
    gradient.addColorStop(0.55, 'rgba(255, 180, 90, 0.85)');
    gradient.addColorStop(1, 'rgba(140, 70, 24, 0.85)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255, 235, 190, 0.85)';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, w - 4, h - 4);

    ctx.strokeStyle = 'rgba(90, 40, 12, 0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(6, 6, w - 12, h - 12);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(0, 6, w, 12);

    ctx.font = 'bold 26px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(68, 26, 6, 0.85)';
    ctx.fillText(label, w / 2 + 1, h / 2 + 2);
    ctx.fillStyle = 'rgba(255, 244, 214, 0.95)';
    ctx.fillText(label, w / 2, h / 2);

    const texture: Texture = Texture.from(canvas);
    this.textures.set(cacheKey, texture);
    return texture;
  }

  /**
   * Builds or retrieves a cached rays texture used behind banners.
   * @returns The rays texture.
   */
  private getLevelUpRaysTexture(): Texture {
    const cacheKey: string = 'fx_levelup_rays';
    const cached: Texture | undefined = this.textures.get(cacheKey);
    if (cached) {
      return cached;
    }

    const canvas: HTMLCanvasElement = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 200;
    const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas not available for level-up rays.');
    }

    const w: number = canvas.width;
    const h: number = canvas.height;
    const gradient: CanvasGradient = ctx.createRadialGradient(w / 2, 0, 10, w / 2, 0, h * 0.9);
    gradient.addColorStop(0, 'rgba(255, 240, 200, 0.85)');
    gradient.addColorStop(0.4, 'rgba(255, 200, 120, 0.45)');
    gradient.addColorStop(1, 'rgba(255, 150, 80, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255, 230, 180, 0.35)';
    ctx.lineWidth = 2;
    for (let i: number = 0; i < 10; i += 1) {
      const x: number = (w / 10) * i + (i % 2 === 0 ? 8 : 0);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + w * 0.08, h);
      ctx.stroke();
    }

    const texture: Texture = Texture.from(canvas);
    this.textures.set(cacheKey, texture);
    return texture;
  }

  /**
   * Converts world coordinates to isometric screen coordinates.
   * @param wx World x-coordinate.
   * @param wy World y-coordinate.
   * @param originX Camera origin x-coordinate.
   * @param originY Camera origin y-coordinate.
   * @param centerX Screen center x-coordinate.
   * @param centerY Screen center y-coordinate.
   * @param tileW Isometric tile width.
   * @param tileH Isometric tile height.
   * @returns The screen position.
   */
  private isoToScreen(
    wx: number,
    wy: number,
    originX: number,
    originY: number,
    centerX: number,
    centerY: number,
    tileW: number,
    tileH: number
  ): { x: number; y: number } {
    const dx: number = wx - originX;
    const dy: number = wy - originY;
    const x: number = (dx - dy) * (tileW / 2) + centerX;
    const y: number = (dx + dy) * (tileH / 2) + centerY;
    return { x, y };
  }

  /**
   * Rebuilds the base tile grid when the view size changes.
   * @param viewWidth The width of the view in tiles.
   * @param viewHeight The height of the view in tiles.
   */
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

  /**
   * Draws item sprites in the current view.
   * @param ctx The rendering context containing game state.
   * @param originX Camera origin x-coordinate.
   * @param originY Camera origin y-coordinate.
   * @param halfW Half the view width in tiles.
   * @param halfH Half the view height in tiles.
   * @param lightRadius Light falloff radius in tiles.
   * @param now The current timestamp in milliseconds.
   */
  private drawItems(ctx: PixiRenderContext, originX: number, originY: number, halfW: number, halfH: number, lightRadius: number, now: number): void {
    for (const it of ctx.items) {
      if (!it.mapRef || !it.pos) {
        continue;
      }

      if (ctx.mode === 'overworld') {
        if (it.mapRef.kind !== 'overworld') {
          continue;
        }
      } else if (ctx.mode === 'dungeon') {
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
      } else {
        const town: Town | undefined = ctx.town;
        if (!town) {
          continue;
        }
        if (it.mapRef.kind !== 'town' || it.mapRef.townId !== town.id) {
          continue;
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

  /**
   * Draws monster sprites in the current view.
   * @param ctx The rendering context containing game state.
   * @param originX Camera origin x-coordinate.
   * @param originY Camera origin y-coordinate.
   * @param halfW Half the view width in tiles.
   * @param halfH Half the view height in tiles.
   * @param lightRadius Light falloff radius in tiles.
   * @param now The current timestamp in milliseconds.
   */
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
      } else if (ctx.mode === 'dungeon') {
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
      } else {
        const town: Town | undefined = ctx.town;
        if (!town) {
          continue;
        }
        if (entity.mapRef.kind !== 'town' || entity.mapRef.townId !== town.id) {
          continue;
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

  /**
   * Draws the player sprite in the current view.
   * @param originX Camera origin x-coordinate.
   * @param originY Camera origin y-coordinate.
   * @param halfW Half the view width in tiles.
   * @param halfH Half the view height in tiles.
   * @param lightRadius Light falloff radius in tiles.
   * @param now The current timestamp in milliseconds.
   */
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

  /**
   * Computes a simple light falloff value for a distance.
   * @param dist Distance from the light source.
   * @param radius Maximum light radius.
   * @returns The alpha multiplier for lighting.
   */
  private lightFalloff(dist: number, radius: number): number {
    const t: number = Math.min(1, dist / Math.max(1, radius));
    return Math.max(0.25, 1 - t * 0.85);
  }

  /**
   * Generates a stable phase offset from a string id.
   * @param id The id to hash.
   * @returns A pseudo-random phase value.
   */
  private phaseFromId(id: string): number {
    let hash: number = 0;
    for (let i: number = 0; i < id.length; i++) {
      hash = (hash * 31 + id.charCodeAt(i)) | 0;
    }
    return (hash % 628) / 100;
  }

  /**
   * Updates fog textures and sprites to match the current view size.
   * @param widthPx The render width in pixels.
   * @param heightPx The render height in pixels.
   */
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

  /**
   * Updates cloud textures and sprites to match the current view size.
   * @param widthPx The render width in pixels.
   * @param heightPx The render height in pixels.
   */
  private updateClouds(widthPx: number, heightPx: number): void {
    if (this.cloudFarTexture) {
      this.cloudFarTexture.destroy(true);
    }
    if (this.cloudTexture) {
      this.cloudTexture.destroy(true);
    }

    const farCanvas: HTMLCanvasElement = document.createElement('canvas');
    farCanvas.width = 160;
    farCanvas.height = 160;
    const farCtx: CanvasRenderingContext2D | null = farCanvas.getContext('2d');
    if (!farCtx) {
      return;
    }

    farCtx.clearRect(0, 0, farCanvas.width, farCanvas.height);
    for (let i: number = 0; i < 32; i += 1) {
      const x: number = (i * 31) % farCanvas.width;
      const y: number = (i * 47) % farCanvas.height;
      const r: number = 18 + (i % 4) * 5;
      farCtx.fillStyle = `rgba(255, 255, 255, ${0.08 + (i % 3) * 0.02})`;
      farCtx.beginPath();
      farCtx.ellipse(x, y, r * 1.4, r * 0.9, 0, 0, Math.PI * 2);
      farCtx.fill();
    }

    const canvas: HTMLCanvasElement = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i: number = 0; i < 28; i += 1) {
      const x: number = (i * 19) % canvas.width;
      const y: number = (i * 29) % canvas.height;
      const r: number = 14 + (i % 5) * 4;
      ctx.fillStyle = `rgba(255, 255, 255, ${0.12 + (i % 3) * 0.03})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.2, r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    this.cloudTexture = Texture.from(canvas);
    this.cloudFarTexture = Texture.from(farCanvas);
    if (!this.cloudFarSprite) {
      this.cloudFarSprite = new TilingSprite({ texture: this.cloudFarTexture, width: widthPx, height: heightPx });
      this.cloudFarSprite.alpha = 0.16;
      this.cloudFarSprite.tileScale.set(1.15, 1.15);
      this.cloudFarSprite.x = 0;
      this.cloudFarSprite.y = 0;
      this.effectLayer.addChild(this.cloudFarSprite);
    } else {
      this.cloudFarSprite.texture = this.cloudFarTexture;
      this.cloudFarSprite.width = widthPx;
      this.cloudFarSprite.height = heightPx;
      this.cloudFarSprite.tileScale.set(1.15, 1.15);
    }
    if (!this.cloudSprite) {
      this.cloudSprite = new TilingSprite({ texture: this.cloudTexture, width: widthPx, height: heightPx });
      this.cloudSprite.alpha = 0.26;
      this.cloudSprite.tileScale.set(1.25, 1.25);
      this.cloudSprite.x = 0;
      this.cloudSprite.y = 0;
      this.effectLayer.addChild(this.cloudSprite);
    } else {
      this.cloudSprite.texture = this.cloudTexture;
      this.cloudSprite.width = widthPx;
      this.cloudSprite.height = heightPx;
      this.cloudSprite.tileScale.set(1.25, 1.25);
    }
  }

  /**
   * Advances the fog texture drift over time.
   */
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

  /**
   * Advances the near cloud texture drift over time.
   */
  private updateCloudDrift(): void {
    if (!this.cloudSprite) {
      return;
    }
    const now: number = performance.now();
    const dt: number = Math.min(80, now - this.lastCloudTime);
    this.lastCloudTime = now;
    const driftSpeed: number = 0.008;
    this.cloudOffsetX += dt * driftSpeed;
    this.cloudOffsetY += dt * driftSpeed * 0.3;
    this.cloudSprite.tilePosition.x = -this.cloudOffsetX;
    this.cloudSprite.tilePosition.y = -this.cloudOffsetY;
  }

  /**
   * Advances the far cloud texture drift over time.
   */
  private updateCloudFarDrift(): void {
    if (!this.cloudFarSprite) {
      return;
    }
    const now: number = performance.now();
    const dt: number = Math.min(80, now - this.lastCloudFarTime);
    this.lastCloudFarTime = now;
    const driftSpeed: number = 0.0045;
    this.cloudFarOffsetX += dt * driftSpeed;
    this.cloudFarOffsetY += dt * driftSpeed * 0.2;
    this.cloudFarSprite.tilePosition.x = -this.cloudFarOffsetX;
    this.cloudFarSprite.tilePosition.y = -this.cloudFarOffsetY;
  }

  /**
   * Updates the vignette overlay to match the current view size.
   * @param widthPx The render width in pixels.
   * @param heightPx The render height in pixels.
   */
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

  /**
   * Converts world coordinates to top-down screen coordinates.
   * @param wx World x-coordinate.
   * @param wy World y-coordinate.
   * @param originX Camera origin x-coordinate.
   * @param originY Camera origin y-coordinate.
   * @param halfW Half the view width in tiles.
   * @param halfH Half the view height in tiles.
   * @returns The screen position, if visible.
   */
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

  /**
   * Retrieves or creates a texture by sprite key or glyph data.
   * @param key The sprite key or cache key.
   * @param glyph Optional glyph to render.
   * @param color Optional glyph color.
   * @returns The requested texture.
   */
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

  /**
   * Creates a cached texture for a glyph rendered on a tile.
   * @param cacheKey The cache key to reuse.
   * @param glyph The glyph character to render.
   * @param color The glyph color.
   * @returns The glyph texture.
   */
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

  /**
   * Maps overworld tile ids to sprite keys.
   * @param tile The overworld tile id.
   * @returns The sprite key for the tile.
   */
  private overworldKey(tile: string): SpriteKey {
    switch (tile) {
      case 'water':
        return 'ow_water';
      case 'water_deep':
        return 'ow_water_deep';
      case 'grass':
        return 'ow_grass';
      case 'forest':
        return 'ow_forest';
      case 'mountain':
        return 'ow_mountain';
      case 'mountain_snow':
        return 'ow_mountain_snow';
      case 'road':
        return 'ow_road';
      case 'town_ground':
        return 'ow_town_ground';
      case 'town_road':
        return 'ow_town_road';
      case 'town_square':
        return 'ow_town_square';
      case 'town_gate':
        return 'ow_town_gate';
      case 'town_wall':
        return 'ow_town_wall';
      case 'town_shop':
        return 'ow_town_shop';
      case 'town_tavern':
        return 'ow_town_tavern';
      case 'town_smith':
        return 'ow_town_smith';
      case 'town_house':
        return 'ow_town_house';
      case 'town':
        return 'ow_town';
      case 'dungeon':
        return 'ow_dungeon';
      case 'cave':
        return 'ow_cave';
      default:
        return 'ow_grass';
    }
  }

  /**
   * Maps town tile ids to sprite keys.
   * @param tile The town tile id.
   * @returns The sprite key for the tile.
   */
  private townKey(tile: string): SpriteKey {
    switch (tile) {
      case 'wall':
        return 'tn_wall';
      case 'road':
        return 'tn_road';
      case 'square':
        return 'tn_square';
      case 'gate':
        return 'tn_gate';
      case 'shop':
        return 'tn_shop';
      case 'tavern':
        return 'tn_tavern';
      case 'smith':
        return 'tn_smith';
      case 'house':
        return 'tn_house';
      case 'floor':
      default:
        return 'tn_floor';
    }
  }

  /**
   * Maps dungeon tiles to sprite keys based on theme.
   * @param theme The dungeon theme.
   * @param tile The dungeon tile id.
   * @returns The sprite key for the tile.
   */
  private dungeonKey(theme: DungeonTheme, tile: string): SpriteKey {
    switch (tile) {
      case 'wall':
        return theme === 'caves' ? 'dg_wall_caves' : theme === 'crypt' ? 'dg_wall_crypt' : 'dg_wall_ruins';
      case 'floor':
        return theme === 'caves' ? 'dg_floor_caves' : theme === 'crypt' ? 'dg_floor_crypt' : 'dg_floor_ruins';
      case 'bossFloor':
        return theme === 'caves' ? 'dg_boss_floor_caves' : theme === 'crypt' ? 'dg_boss_floor_crypt' : 'dg_boss_floor_ruins';
      case 'stairsUp':
      case 'stairsDown':
        return theme === 'caves' ? 'dg_stairs_caves' : theme === 'crypt' ? 'dg_stairs_crypt' : 'dg_stairs_ruins';
      default:
        return theme === 'caves' ? 'dg_floor_caves' : theme === 'crypt' ? 'dg_floor_crypt' : 'dg_floor_ruins';
    }
  }

  /**
   * Maps monster glyphs to sprite keys.
   * @param glyph The monster glyph.
   * @returns The sprite key for the monster.
   */
  private monsterKey(glyph: string): SpriteKey {
    if (glyph === 's') {
      return 'ent_slime';
    }
    if (glyph === 'O') {
      return 'ent_orc';
    }
    if (glyph === 'w') {
      return 'ent_wraith';
    }
    if (glyph === 'B') {
      return 'ent_boss';
    }
    return 'ent_goblin';
  }
}

/**
 * Returns palette colors for dungeon themes.
 * @param theme The dungeon theme.
 * @returns Color palette for wall, floor, stairs, and glyphs.
 */
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
