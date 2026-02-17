export type SpriteKey =
  | 'ow_water_deep'
  | 'ow_water'
  | 'ow_grass'
  | 'ow_forest'
  | 'ow_mountain'
  | 'ow_mountain_snow'
  | 'ow_road'
  | 'ow_town'
  | 'ow_town_ground'
  | 'ow_town_road'
  | 'ow_town_square'
  | 'ow_town_shop'
  | 'ow_town_tavern'
  | 'ow_town_smith'
  | 'ow_town_house'
  | 'ow_town_wall'
  | 'ow_town_gate'
  | 'ow_dungeon'
  | 'ow_cave'
  | 'tn_floor'
  | 'tn_wall'
  | 'tn_road'
  | 'tn_square'
  | 'tn_gate'
  | 'tn_shop'
  | 'tn_tavern'
  | 'tn_smith'
  | 'tn_house'
  | 'dg_wall_ruins'
  | 'dg_floor_ruins'
  | 'dg_boss_floor_ruins'
  | 'dg_stairs_ruins'
  | 'dg_wall_caves'
  | 'dg_floor_caves'
  | 'dg_boss_floor_caves'
  | 'dg_stairs_caves'
  | 'dg_wall_crypt'
  | 'dg_floor_crypt'
  | 'dg_boss_floor_crypt'
  | 'dg_stairs_crypt'
  | 'ent_player'
  | 'ent_slime'
  | 'ent_goblin'
  | 'ent_orc'
  | 'ent_wraith'
  | 'ent_boss'
  | 'it_potion'
  | 'it_weapon'
  | 'it_armor'
  | 'ui_path'
  | 'ui_destination';

type SheetEntry = {
  key: SpriteKey;
  x: number;
  y: number;
  w?: number;
  h?: number;
};

const SPRITE_SHEET_URL: string = '/assets/tiles.svg';
const SPRITE_SHEET_TILE_SIZE: number = 16;
const SPRITE_SHEET_TILES: readonly SheetEntry[] = [
  { key: 'ow_water_deep', x: 0, y: 0 },
  { key: 'ow_water', x: 16, y: 0 },
  { key: 'ow_grass', x: 32, y: 0 },
  { key: 'ow_forest', x: 48, y: 0 },
  { key: 'ow_mountain', x: 64, y: 0 },
  { key: 'ow_mountain_snow', x: 80, y: 0 },
  { key: 'ow_road', x: 96, y: 0 },
  { key: 'ow_town', x: 112, y: 0 },
  { key: 'ow_town_ground', x: 128, y: 0 },
  { key: 'ow_town_road', x: 144, y: 0 },
  { key: 'ow_town_square', x: 160, y: 0 },
  { key: 'ow_town_shop', x: 176, y: 0 },
  { key: 'ow_town_tavern', x: 192, y: 0 },
  { key: 'ow_town_smith', x: 208, y: 0 },
  { key: 'ow_town_house', x: 224, y: 0 },
  { key: 'ow_town_wall', x: 240, y: 0 },
  { key: 'ow_town_gate', x: 256, y: 0 },
  { key: 'ow_dungeon', x: 272, y: 0 },
  { key: 'ow_cave', x: 288, y: 0 },
  { key: 'tn_floor', x: 0, y: 16 },
  { key: 'tn_wall', x: 16, y: 16 },
  { key: 'tn_road', x: 32, y: 16 },
  { key: 'tn_square', x: 48, y: 16 },
  { key: 'tn_gate', x: 64, y: 16 },
  { key: 'tn_shop', x: 80, y: 16 },
  { key: 'tn_tavern', x: 96, y: 16 },
  { key: 'tn_smith', x: 112, y: 16 },
  { key: 'tn_house', x: 128, y: 16 },
  { key: 'dg_wall_ruins', x: 0, y: 32 },
  { key: 'dg_floor_ruins', x: 16, y: 32 },
  { key: 'dg_boss_floor_ruins', x: 32, y: 32 },
  { key: 'dg_stairs_ruins', x: 48, y: 32 },
  { key: 'dg_wall_caves', x: 0, y: 48 },
  { key: 'dg_floor_caves', x: 16, y: 48 },
  { key: 'dg_boss_floor_caves', x: 32, y: 48 },
  { key: 'dg_stairs_caves', x: 48, y: 48 },
  { key: 'dg_wall_crypt', x: 0, y: 64 },
  { key: 'dg_floor_crypt', x: 16, y: 64 },
  { key: 'dg_boss_floor_crypt', x: 32, y: 64 },
  { key: 'dg_stairs_crypt', x: 48, y: 64 }
] as const;

/**
 * Generates and stores small canvas-based sprites for tiles and entities.
 */
export class SpriteAtlas {
  private readonly tileSize: number;
  private readonly sprites: Map<SpriteKey, HTMLCanvasElement>;
  public onUpdate?: () => void;

  /**
   * Creates a new atlas for a given tile size.
   * @param tileSize The tile size in pixels.
   */
  public constructor(tileSize: number) {
    this.tileSize = tileSize;
    this.sprites = new Map<SpriteKey, HTMLCanvasElement>();
    this.buildAll();
    this.loadSpriteSheet();
  }

  /**
   * Returns the sprite canvas for a given key.
   * @param key The sprite key.
   * @returns The sprite canvas.
   */
  public get(key: SpriteKey): HTMLCanvasElement {
    const s: HTMLCanvasElement | undefined = this.sprites.get(key);
    if (!s) {
      throw new Error(`Missing sprite: ${key}`);
    }
    return s;
  }

  /**
   * Builds all sprites into the atlas.
   */
  private buildAll(): void {
    // Overworld
    this.sprites.set(
      'ow_water',
      this.make((c) => this.fill(c, '#0c2f4a', '#0f496d'))
    );
    this.sprites.set(
      'ow_water_deep',
      this.make((c) => this.fill(c, '#071d2e', '#0b2b44'))
    );
    this.sprites.set(
      'ow_grass',
      this.make((c) => this.fill(c, '#1f3a24', '#2f5433'))
    );
    this.sprites.set(
      'ow_forest',
      this.make((c) => this.patternForest(c))
    );
    this.sprites.set(
      'ow_mountain',
      this.make((c) => this.patternMountain(c))
    );
    this.sprites.set(
      'ow_mountain_snow',
      this.make((c) => this.patternMountainSnow(c))
    );
    this.sprites.set(
      'ow_road',
      this.make((c) => this.patternRoad(c))
    );
    this.sprites.set(
      'ow_town',
      this.make((c) => this.patternTown(c))
    );
    this.sprites.set(
      'ow_town_ground',
      this.make((c) => this.patternTownGround(c))
    );
    this.sprites.set(
      'ow_town_road',
      this.make((c) => this.patternTownRoad(c))
    );
    this.sprites.set(
      'ow_town_square',
      this.make((c) => this.patternTownSquare(c))
    );
    this.sprites.set(
      'ow_town_shop',
      this.make((c) => this.patternTownBuilding(c, '#e7d2b2', '#3a2a1d'))
    );
    this.sprites.set(
      'ow_town_tavern',
      this.make((c) => this.patternTownBuilding(c, '#d9c19f', '#2b1f16'))
    );
    this.sprites.set(
      'ow_town_smith',
      this.make((c) => this.patternTownBuilding(c, '#cdb59a', '#2b2b33'))
    );
    this.sprites.set(
      'ow_town_house',
      this.make((c) => this.patternTownBuilding(c, '#dcc9ad', '#43332a'))
    );
    this.sprites.set(
      'ow_town_wall',
      this.make((c) => this.patternTownWall(c))
    );
    this.sprites.set(
      'ow_town_gate',
      this.make((c) => this.patternTownGate(c))
    );
    this.sprites.set(
      'ow_dungeon',
      this.make((c) => this.patternDungeonEntrance(c))
    );
    this.sprites.set(
      'ow_cave',
      this.make((c) => this.patternCaveEntrance(c))
    );

    // Town interior
    this.sprites.set(
      'tn_floor',
      this.make((c) => this.patternTownInteriorFloor(c))
    );
    this.sprites.set(
      'tn_wall',
      this.make((c) => this.patternTownInteriorWall(c))
    );
    this.sprites.set(
      'tn_road',
      this.make((c) => this.patternTownInteriorRoad(c))
    );
    this.sprites.set(
      'tn_square',
      this.make((c) => this.patternTownInteriorSquare(c))
    );
    this.sprites.set(
      'tn_gate',
      this.make((c) => this.patternTownInteriorGate(c))
    );
    this.sprites.set(
      'tn_shop',
      this.make((c) => this.patternTownInteriorBuilding(c, '#d9c1a3', '#2b1f16'))
    );
    this.sprites.set(
      'tn_tavern',
      this.make((c) => this.patternTownInteriorBuilding(c, '#cfb592', '#3a2a1d'))
    );
    this.sprites.set(
      'tn_smith',
      this.make((c) => this.patternTownInteriorBuilding(c, '#c3b6a9', '#1f232b'))
    );
    this.sprites.set(
      'tn_house',
      this.make((c) => this.patternTownInteriorBuilding(c, '#dcc9ad', '#3f2e25'))
    );

    // Dungeon themes
    this.sprites.set(
      'dg_wall_ruins',
      this.make((c) => this.patternStone(c, '#202a36', '#2d3a4b'))
    );
    this.sprites.set(
      'dg_floor_ruins',
      this.make((c) => this.patternFloor(c, '#0f141a', '#1c262f'))
    );
    this.sprites.set(
      'dg_boss_floor_ruins',
      this.make((c) => this.patternBossFloor(c, '#0f141a', '#1c262f', '#b38d4f'))
    );
    this.sprites.set(
      'dg_stairs_ruins',
      this.make((c) => this.patternStairs(c, '#15243a', '#cfe3ff'))
    );

    this.sprites.set(
      'dg_wall_caves',
      this.make((c) => this.patternStone(c, '#1f2a20', '#2c3a2e'))
    );
    this.sprites.set(
      'dg_floor_caves',
      this.make((c) => this.patternFloor(c, '#0f1510', '#1b241a'))
    );
    this.sprites.set(
      'dg_boss_floor_caves',
      this.make((c) => this.patternBossFloor(c, '#0f1510', '#1b241a', '#7fa974'))
    );
    this.sprites.set(
      'dg_stairs_caves',
      this.make((c) => this.patternStairs(c, '#17301a', '#cfe3ff'))
    );

    this.sprites.set(
      'dg_wall_crypt',
      this.make((c) => this.patternStone(c, '#2a1a2f', '#3b2442'))
    );
    this.sprites.set(
      'dg_floor_crypt',
      this.make((c) => this.patternFloor(c, '#170d19', '#231526'))
    );
    this.sprites.set(
      'dg_boss_floor_crypt',
      this.make((c) => this.patternBossFloor(c, '#170d19', '#231526', '#b07bd6'))
    );
    this.sprites.set(
      'dg_stairs_crypt',
      this.make((c) => this.patternStairs(c, '#2c1231', '#e6d7ff'))
    );

    // Entities/items
    this.sprites.set(
      'ent_player',
      this.make((c) => this.glyph(c, '@', '#f6f1e5'))
    );
    this.sprites.set(
      'ent_slime',
      this.make((c) => this.glyph(c, 's', '#7be0a3'))
    );
    this.sprites.set(
      'ent_goblin',
      this.make((c) => this.glyph(c, 'g', '#a1d67a'))
    );
    this.sprites.set(
      'ent_orc',
      this.make((c) => this.glyph(c, 'O', '#d59b6a'))
    );
    this.sprites.set(
      'ent_wraith',
      this.make((c) => this.glyph(c, 'w', '#7cc8f2'))
    );
    this.sprites.set(
      'ent_boss',
      this.make((c) => this.glyph(c, 'B', '#f28b6a'))
    );

    this.sprites.set(
      'it_potion',
      this.make((c) => this.glyph(c, '!', '#f2b36d'))
    );
    this.sprites.set(
      'it_weapon',
      this.make((c) => this.glyph(c, ')', '#d9c1a3'))
    );
    this.sprites.set(
      'it_armor',
      this.make((c) => this.glyph(c, ']', '#c7b6a1'))
    );

    // UI overlay
    this.sprites.set(
      'ui_path',
      this.make((c) => this.glyph(c, '•', '#d6c5a2'))
    );
    this.sprites.set(
      'ui_destination',
      this.make((c) => this.glyph(c, 'X', '#f6e6c7'))
    );
  }

  private loadSpriteSheet(): void {
    const img = new Image();
    img.onload = () => {
      this.replaceFromSheet(img);
      this.onUpdate?.();
    };
    img.onerror = () => {
      return;
    };
    img.src = SPRITE_SHEET_URL;
  }

  private replaceFromSheet(img: HTMLImageElement): void {
    for (const entry of SPRITE_SHEET_TILES) {
      const w = entry.w ?? SPRITE_SHEET_TILE_SIZE;
      const h = entry.h ?? SPRITE_SHEET_TILE_SIZE;
      const canvas = this.makeFromSheet(img, entry.x, entry.y, w, h);
      this.sprites.set(entry.key, canvas);
    }
  }

  private makeFromSheet(img: HTMLImageElement, sx: number, sy: number, sw: number, sh: number): HTMLCanvasElement {
    const c: HTMLCanvasElement = document.createElement('canvas');
    c.width = this.tileSize;
    c.height = this.tileSize;
    const g: CanvasRenderingContext2D | null = c.getContext('2d');
    if (!g) {
      return c;
    }
    g.imageSmoothingEnabled = false;
    g.drawImage(img, sx, sy, sw, sh, 0, 0, this.tileSize, this.tileSize);
    return c;
  }

  /**
   * Creates a sprite canvas and draws with the provided callback.
   * @param draw The draw callback.
   * @returns The sprite canvas.
   */
  private make(draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
    const c: HTMLCanvasElement = document.createElement('canvas');
    c.width = this.tileSize;
    c.height = this.tileSize;
    const g: CanvasRenderingContext2D | null = c.getContext('2d');
    if (!g) {
      throw new Error('Canvas not available.');
    }
    g.imageSmoothingEnabled = false;
    draw(g);
    return c;
  }

  /**
   * Fills a base color with a simple speckle pattern.
   * @param ctx The canvas context.
   * @param base The base color.
   * @param speck The speckle color.
   */
  private fill(ctx: CanvasRenderingContext2D, base: string, speck: string): void {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, this.tileSize, this.tileSize);
    ctx.fillStyle = speck;
    for (let i: number = 0; i < 10; i++) {
      const x: number = (i * 7) % this.tileSize;
      const y: number = (i * 11) % this.tileSize;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  /**
   * Draws a forest tile pattern.
   * @param ctx The canvas context.
   */
  private patternForest(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#0e2a1b', '#184a2f');
    ctx.fillStyle = '#1e6a45';
    ctx.fillRect(4, 4, 2, 6);
    ctx.fillRect(10, 3, 2, 7);
    ctx.fillStyle = '#0b1320';
    ctx.fillRect(5, 10, 1, 2);
    ctx.fillRect(11, 10, 1, 2);
  }

  /**
   * Draws a mountain tile pattern.
   * @param ctx The canvas context.
   */
  private patternMountain(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#3a3f46', '#555b63');

    // Large boulder - irregular shape
    ctx.fillStyle = '#9aa1ab';
    ctx.fillRect(1, 8, 2, 3);
    ctx.fillRect(2, 7, 3, 1);
    ctx.fillRect(3, 8, 2, 4);
    ctx.fillRect(5, 9, 1, 2);

    // Dark side
    ctx.fillStyle = '#5b636d';
    ctx.fillRect(4, 9, 2, 3);

    // Darker cracks
    ctx.fillStyle = '#3a3f46';
    ctx.fillRect(3, 9, 1, 1);
    ctx.fillRect(4, 11, 1, 1);

    // Medium rocks cluster
    ctx.fillStyle = '#8a919b';
    ctx.fillRect(7, 10, 2, 2);
    ctx.fillRect(9, 9, 2, 3);
    ctx.fillRect(11, 10, 2, 2);

    // Dark sides on cluster
    ctx.fillStyle = '#6b737d';
    ctx.fillRect(8, 11, 1, 1);
    ctx.fillRect(10, 10, 1, 2);
    ctx.fillRect(12, 11, 1, 1);

    // Small scattered rocks
    ctx.fillStyle = '#9aa1ab';
    ctx.fillRect(6, 7, 2, 1);
    ctx.fillRect(11, 7, 2, 2);
    ctx.fillRect(1, 13, 2, 1);
    ctx.fillRect(13, 12, 1, 2);

    // Highlights
    ctx.fillStyle = '#c5cdd7';
    ctx.fillRect(2, 7, 1, 1);
    ctx.fillRect(3, 8, 1, 1);
    ctx.fillRect(9, 9, 1, 1);
    ctx.fillRect(11, 10, 1, 1);
  }

  /**
   * Draws a snow-capped mountain tile pattern.
   * @param ctx The canvas context.
   */
  private patternMountainSnow(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#4a515b', '#6b737d');

    // Large boulder - irregular shape
    ctx.fillStyle = '#aab2bc';
    ctx.fillRect(1, 8, 2, 3);
    ctx.fillRect(2, 7, 3, 1);
    ctx.fillRect(3, 8, 2, 4);
    ctx.fillRect(5, 9, 1, 2);

    // Dark side
    ctx.fillStyle = '#7b838d';
    ctx.fillRect(4, 9, 2, 3);

    // Medium rocks cluster
    ctx.fillStyle = '#9aa1ab';
    ctx.fillRect(7, 10, 2, 2);
    ctx.fillRect(9, 9, 2, 3);
    ctx.fillRect(11, 10, 2, 2);

    // Dark sides on cluster
    ctx.fillStyle = '#8a919b';
    ctx.fillRect(8, 11, 1, 1);
    ctx.fillRect(10, 10, 1, 2);
    ctx.fillRect(12, 11, 1, 1);

    // Small scattered rocks
    ctx.fillStyle = '#aab2bc';
    ctx.fillRect(6, 7, 2, 1);
    ctx.fillRect(11, 7, 2, 2);
    ctx.fillRect(1, 13, 2, 1);
    ctx.fillRect(13, 12, 1, 2);

    // Snow coverage on large boulder
    ctx.fillStyle = '#f8fcff';
    ctx.fillRect(2, 7, 3, 1);
    ctx.fillRect(1, 8, 2, 1);
    ctx.fillRect(3, 8, 1, 1);

    // Snow on medium rocks
    ctx.fillStyle = '#e6edf5';
    ctx.fillRect(9, 9, 2, 1);
    ctx.fillRect(11, 10, 2, 1);
    ctx.fillRect(7, 10, 1, 1);

    // Snow on small rocks
    ctx.fillStyle = '#f8fcff';
    ctx.fillRect(6, 7, 2, 1);
    ctx.fillRect(11, 7, 2, 1);

    // Bright snow highlights
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(2, 7, 1, 1);
    ctx.fillRect(3, 7, 1, 1);
    ctx.fillRect(9, 9, 1, 1);
    ctx.fillRect(11, 10, 1, 1);

    // Snow patches on ground
    ctx.fillStyle = '#e6edf5';
    ctx.fillRect(0, 12, 2, 1);
    ctx.fillRect(6, 12, 1, 1);
    ctx.fillRect(14, 13, 1, 1);
  }

  /**
   * Draws a road tile pattern.
   * @param ctx The canvas context.
   */
  private patternRoad(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#2b251c', '#3a2e21');
    ctx.fillStyle = '#d4c3a3';
    for (let x: number = 2; x < this.tileSize - 2; x += 3) {
      ctx.fillRect(x, 8, 1, 1);
    }
  }

  /**
   * Draws a town tile pattern.
   * @param ctx The canvas context.
   */
  private patternTown(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#3b2f23', '#4a3a2b');
    ctx.fillStyle = '#f4e6cc';
    ctx.fillRect(5, 8, 6, 5);
    ctx.fillRect(6, 6, 4, 2);
    ctx.fillStyle = '#1a1410';
    ctx.fillRect(7, 10, 2, 3);
  }

  /**
   * Draws a town ground tile pattern.
   * @param ctx The canvas context.
   */
  private patternTownGround(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#2f2720', '#3f352b');
  }

  /**
   * Draws a town road tile pattern.
   * @param ctx The canvas context.
   */
  private patternTownRoad(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#3a2f25', '#4a3b2e');
    ctx.fillStyle = '#c8b08a';
    for (let i: number = 2; i < this.tileSize - 2; i += 4) {
      ctx.fillRect(i, 6, 2, 2);
      ctx.fillRect(i + 1, 10, 2, 2);
    }
  }

  /**
   * Draws a town square tile pattern.
   * @param ctx The canvas context.
   */
  private patternTownSquare(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#3d332a', '#4f4134');
    ctx.strokeStyle = '#d5c1a5';
    ctx.strokeRect(3, 3, 10, 10);
    ctx.fillStyle = '#c9b08e';
    ctx.fillRect(7, 7, 2, 2);
  }

  /**
   * Draws a town building tile pattern.
   * @param ctx The canvas context.
   * @param wall The wall color.
   * @param roof The roof color.
   */
  private patternTownBuilding(ctx: CanvasRenderingContext2D, wall: string, roof: string): void {
    this.fill(ctx, '#2f2720', '#3f352b');
    ctx.fillStyle = wall;
    ctx.fillRect(3, 7, 10, 6);
    ctx.fillStyle = roof;
    ctx.fillRect(4, 4, 8, 4);
    ctx.fillStyle = '#1a1410';
    ctx.fillRect(7, 9, 2, 4);
  }

  /**
   * Draws a town wall tile pattern.
   * @param ctx The canvas context.
   */
  private patternTownWall(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#232a34', '#343f4d');
    ctx.fillStyle = '#47556b';
    ctx.fillRect(2, 6, 12, 4);
  }

  /**
   * Draws a town gate tile pattern.
   * @param ctx The canvas context.
   */
  private patternTownGate(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#232a34', '#343f4d');
    ctx.fillStyle = '#b89a74';
    ctx.fillRect(6, 6, 4, 8);
    ctx.fillStyle = '#1a1410';
    ctx.fillRect(7, 8, 2, 4);
  }

  /**
   * Draws a town interior floor tile pattern.
   * @param ctx The canvas context.
   */
  private patternTownInteriorFloor(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#1d1a16', '#2b241d');
    ctx.fillStyle = '#3a3026';
    ctx.fillRect(6, 5, 1, 1);
    ctx.fillRect(10, 11, 1, 1);
  }

  /**
   * Draws a town interior wall tile pattern.
   * @param ctx The canvas context.
   */
  private patternTownInteriorWall(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#2a2430', '#3a3242');
    ctx.fillStyle = '#4a4256';
    ctx.fillRect(2, 6, 12, 4);
  }

  /**
   * Draws a town interior road tile pattern.
   * @param ctx The canvas context.
   */
  private patternTownInteriorRoad(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#2b241d', '#3a2f25');
    ctx.fillStyle = '#a88f73';
    for (let i: number = 2; i < this.tileSize - 2; i += 4) {
      ctx.fillRect(i, 7, 2, 2);
    }
  }

  /**
   * Draws a town interior square tile pattern.
   * @param ctx The canvas context.
   */
  private patternTownInteriorSquare(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#2f2924', '#3d352f');
    ctx.strokeStyle = '#cdb89a';
    ctx.strokeRect(3, 3, 10, 10);
    ctx.fillStyle = '#b9a186';
    ctx.fillRect(7, 7, 2, 2);
  }

  /**
   * Draws a town interior gate tile pattern.
   * @param ctx The canvas context.
   */
  private patternTownInteriorGate(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#2a2430', '#3a3242');
    ctx.fillStyle = '#b08d65';
    ctx.fillRect(6, 6, 4, 8);
    ctx.fillStyle = '#1a1410';
    ctx.fillRect(7, 8, 2, 4);
  }

  /**
   * Draws a town interior building tile pattern.
   * @param ctx The canvas context.
   * @param wall The wall color.
   * @param roof The roof color.
   */
  private patternTownInteriorBuilding(ctx: CanvasRenderingContext2D, wall: string, roof: string): void {
    this.fill(ctx, '#1d1a16', '#2b241d');
    ctx.fillStyle = wall;
    ctx.fillRect(3, 7, 10, 6);
    ctx.fillStyle = roof;
    ctx.fillRect(4, 4, 8, 4);
    ctx.fillStyle = '#1a1410';
    ctx.fillRect(7, 9, 2, 4);
  }

  /**
   * Draws a dungeon entrance tile pattern.
   * @param ctx The canvas context.
   */
  private patternDungeonEntrance(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#2b2016', '#3a2b1f');
    // Stone surround
    ctx.fillStyle = '#d2b996';
    ctx.fillRect(2, 3, 12, 11);
    ctx.fillStyle = '#3a2a1e';
    ctx.fillRect(3, 4, 10, 9);
    // Stairs descending
    ctx.fillStyle = '#c3a579';
    ctx.fillRect(4, 6, 8, 2);
    ctx.fillStyle = '#ad8f67';
    ctx.fillRect(5, 8, 6, 2);
    ctx.fillStyle = '#967855';
    ctx.fillRect(6, 10, 4, 2);
    ctx.fillStyle = '#0b0a08';
    ctx.fillRect(7, 12, 2, 1);
  }

  /**
   * Draws a cave entrance tile pattern.
   * @param ctx The canvas context.
   */
  private patternCaveEntrance(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#3a3f46', '#555b63');
    ctx.fillStyle = '#0b0b0b';
    ctx.beginPath();
    ctx.ellipse(8, 10, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(8, 11, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9a9082';
    ctx.fillRect(4, 6, 8, 1);
  }

  /**
   * Draws a stone tile pattern.
   * @param ctx The canvas context.
   * @param base The base color.
   * @param highlight The highlight color.
   */
  private patternStone(ctx: CanvasRenderingContext2D, base: string, highlight: string): void {
    this.fill(ctx, base, highlight);
    ctx.fillStyle = highlight;
    ctx.fillRect(2, 3, 5, 2);
    ctx.fillRect(8, 9, 6, 2);
  }

  /**
   * Draws a boss floor tile pattern with a rune.
   * @param ctx The canvas context.
   * @param base The base color.
   * @param highlight The highlight color.
   * @param rune The rune color.
   */
  private patternBossFloor(ctx: CanvasRenderingContext2D, base: string, highlight: string, rune: string): void {
    this.patternFloor(ctx, base, highlight);
    ctx.strokeStyle = rune;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, 2);
    ctx.lineTo(13, 8);
    ctx.lineTo(8, 14);
    ctx.lineTo(3, 8);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = rune;
    ctx.fillRect(7, 7, 2, 2);
  }

  /**
   * Draws a generic floor tile pattern.
   * @param ctx The canvas context.
   * @param base The base color.
   * @param highlight The highlight color.
   */
  private patternFloor(ctx: CanvasRenderingContext2D, base: string, highlight: string): void {
    this.fill(ctx, base, highlight);
    ctx.fillStyle = highlight;
    ctx.fillRect(4, 4, 1, 1);
    ctx.fillRect(11, 11, 1, 1);
  }

  /**
   * Draws a stairs tile pattern with a glyph.
   * @param ctx The canvas context.
   * @param base The base color.
   * @param glyph The glyph color.
   */
  private patternStairs(ctx: CanvasRenderingContext2D, base: string, glyph: string): void {
    this.fill(ctx, base, '#1a2433');
    this.glyph(ctx, '>', glyph);
  }

  /**
   * Draws a glyph onto the tile.
   * @param ctx The canvas context.
   * @param g The glyph character.
   * @param color The glyph color.
   */
  private glyph(ctx: CanvasRenderingContext2D, g: string, color: string): void {
    ctx.clearRect(0, 0, this.tileSize, this.tileSize);
    ctx.font = '12px monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillText(g, 6, 3);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillText(g, 4, 1);
    ctx.fillStyle = color;
    ctx.fillText(g, 5, 2);
  }
}
