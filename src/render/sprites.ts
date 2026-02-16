export type SpriteKey =
  | 'ow_water'
  | 'ow_grass'
  | 'ow_forest'
  | 'ow_mountain'
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

  private patternTownGround(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#2f2720', '#3f352b');
  }

  private patternTownRoad(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#3a2f25', '#4a3b2e');
    ctx.fillStyle = '#c8b08a';
    for (let i: number = 2; i < this.tileSize - 2; i += 4) {
      ctx.fillRect(i, 6, 2, 2);
      ctx.fillRect(i + 1, 10, 2, 2);
    }
  }

  private patternTownSquare(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#3d332a', '#4f4134');
    ctx.strokeStyle = '#d5c1a5';
    ctx.strokeRect(3, 3, 10, 10);
    ctx.fillStyle = '#c9b08e';
    ctx.fillRect(7, 7, 2, 2);
  }

  private patternTownBuilding(ctx: CanvasRenderingContext2D, wall: string, roof: string): void {
    this.fill(ctx, '#2f2720', '#3f352b');
    ctx.fillStyle = wall;
    ctx.fillRect(3, 7, 10, 6);
    ctx.fillStyle = roof;
    ctx.fillRect(4, 4, 8, 4);
    ctx.fillStyle = '#1a1410';
    ctx.fillRect(7, 9, 2, 4);
  }

  private patternTownWall(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#232a34', '#343f4d');
    ctx.fillStyle = '#47556b';
    ctx.fillRect(2, 6, 12, 4);
  }

  private patternTownGate(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#232a34', '#343f4d');
    ctx.fillStyle = '#b89a74';
    ctx.fillRect(6, 6, 4, 8);
    ctx.fillStyle = '#1a1410';
    ctx.fillRect(7, 8, 2, 4);
  }

  private patternTownInteriorFloor(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#1d1a16', '#2b241d');
    ctx.fillStyle = '#3a3026';
    ctx.fillRect(6, 5, 1, 1);
    ctx.fillRect(10, 11, 1, 1);
  }

  private patternTownInteriorWall(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#2a2430', '#3a3242');
    ctx.fillStyle = '#4a4256';
    ctx.fillRect(2, 6, 12, 4);
  }

  private patternTownInteriorRoad(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#2b241d', '#3a2f25');
    ctx.fillStyle = '#a88f73';
    for (let i: number = 2; i < this.tileSize - 2; i += 4) {
      ctx.fillRect(i, 7, 2, 2);
    }
  }

  private patternTownInteriorSquare(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#2f2924', '#3d352f');
    ctx.strokeStyle = '#cdb89a';
    ctx.strokeRect(3, 3, 10, 10);
    ctx.fillStyle = '#b9a186';
    ctx.fillRect(7, 7, 2, 2);
  }

  private patternTownInteriorGate(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, '#2a2430', '#3a3242');
    ctx.fillStyle = '#b08d65';
    ctx.fillRect(6, 6, 4, 8);
    ctx.fillStyle = '#1a1410';
    ctx.fillRect(7, 8, 2, 4);
  }

  private patternTownInteriorBuilding(ctx: CanvasRenderingContext2D, wall: string, roof: string): void {
    this.fill(ctx, '#1d1a16', '#2b241d');
    ctx.fillStyle = wall;
    ctx.fillRect(3, 7, 10, 6);
    ctx.fillStyle = roof;
    ctx.fillRect(4, 4, 8, 4);
    ctx.fillStyle = '#1a1410';
    ctx.fillRect(7, 9, 2, 4);
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
