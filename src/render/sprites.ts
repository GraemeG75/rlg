export type SpriteKey =
  | 'ow_water'
  | 'ow_grass'
  | 'ow_forest'
  | 'ow_mountain'
  | 'ow_road'
  | 'ow_town'
  | 'ow_dungeon'
  | 'dg_wall_ruins'
  | 'dg_floor_ruins'
  | 'dg_stairs_ruins'
  | 'dg_wall_caves'
  | 'dg_floor_caves'
  | 'dg_stairs_caves'
  | 'dg_wall_crypt'
  | 'dg_floor_crypt'
  | 'dg_stairs_crypt'
  | 'ent_player'
  | 'ent_slime'
  | 'ent_goblin'
  | 'ent_orc'
  | 'it_potion'
  | 'it_weapon'
  | 'it_armor'
  | 'ui_path'
  | 'ui_destination';

export class SpriteAtlas {
  private readonly tileSize: number;
  private readonly sprites: Map<SpriteKey, HTMLCanvasElement>;

  public constructor(tileSize: number) {
    this.tileSize = tileSize;
    this.sprites = new Map<SpriteKey, HTMLCanvasElement>();
    this.buildAll();
  }

  public get(key: SpriteKey): HTMLCanvasElement {
    const s: HTMLCanvasElement | undefined = this.sprites.get(key);
    if (!s) {
      throw new Error(`Missing sprite: ${key}`);
    }
    return s;
  }

  private buildAll(): void {
    // Overworld
    this.sprites.set(
      'ow_water',
      this.make((c) => this.fill(c, '#0c2f4a', '#0f496d'))
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
      'ow_road',
      this.make((c) => this.patternRoad(c))
    );
    this.sprites.set(
      'ow_town',
      this.make((c) => this.patternTown(c))
    );
    this.sprites.set(
      'ow_dungeon',
      this.make((c) => this.patternDungeonEntrance(c))
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

  private patternForest(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#0e2a1b', '#184a2f');
    ctx.fillStyle = '#1e6a45';
    ctx.fillRect(4, 4, 2, 6);
    ctx.fillRect(10, 3, 2, 7);
    ctx.fillStyle = '#0b1320';
    ctx.fillRect(5, 10, 1, 2);
    ctx.fillRect(11, 10, 1, 2);
  }

  private patternMountain(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#3a3f46', '#555b63');
    ctx.fillStyle = '#9aa1ab';
    ctx.beginPath();
    ctx.moveTo(2, 13);
    ctx.lineTo(7, 4);
    ctx.lineTo(12, 13);
    ctx.closePath();
    ctx.fill();
  }

  private patternRoad(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#2b251c', '#3a2e21');
    ctx.fillStyle = '#d4c3a3';
    for (let x: number = 2; x < this.tileSize - 2; x += 3) {
      ctx.fillRect(x, 8, 1, 1);
    }
  }

  private patternTown(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#3b2f23', '#4a3a2b');
    ctx.fillStyle = '#f4e6cc';
    ctx.fillRect(5, 8, 6, 5);
    ctx.fillRect(6, 6, 4, 2);
    ctx.fillStyle = '#1a1410';
    ctx.fillRect(7, 10, 2, 3);
  }

  private patternDungeonEntrance(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#4b2f1f', '#5d3a24');
    ctx.fillStyle = '#f0d9b8';
    ctx.fillRect(5, 6, 6, 8);
    ctx.fillStyle = '#1b120b';
    ctx.fillRect(6, 8, 4, 6);
  }

  private patternStone(ctx: CanvasRenderingContext2D, base: string, highlight: string): void {
    this.fill(ctx, base, highlight);
    ctx.fillStyle = highlight;
    ctx.fillRect(2, 3, 5, 2);
    ctx.fillRect(8, 9, 6, 2);
  }

  private patternFloor(ctx: CanvasRenderingContext2D, base: string, highlight: string): void {
    this.fill(ctx, base, highlight);
    ctx.fillStyle = highlight;
    ctx.fillRect(4, 4, 1, 1);
    ctx.fillRect(11, 11, 1, 1);
  }

  private patternStairs(ctx: CanvasRenderingContext2D, base: string, glyph: string): void {
    this.fill(ctx, base, '#1a2433');
    this.glyph(ctx, '>', glyph);
  }

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
