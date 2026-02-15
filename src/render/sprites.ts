export type SpriteKey =
  | "ow_water" | "ow_grass" | "ow_forest" | "ow_mountain" | "ow_road" | "ow_town" | "ow_dungeon"
  | "dg_wall_ruins" | "dg_floor_ruins" | "dg_stairs_ruins"
  | "dg_wall_caves" | "dg_floor_caves" | "dg_stairs_caves"
  | "dg_wall_crypt" | "dg_floor_crypt" | "dg_stairs_crypt"
  | "ent_player" | "ent_slime" | "ent_goblin" | "ent_orc"
  | "it_potion" | "it_weapon" | "it_armor"
  | "ui_path" | "ui_destination";

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
    if (!s) throw new Error(`Missing sprite: ${key}`);
    return s;
  }

  private buildAll(): void {
    // Overworld
    this.sprites.set("ow_water", this.make((c) => this.fill(c, "#0b355a", "#0f4d7f")));
    this.sprites.set("ow_grass", this.make((c) => this.fill(c, "#11402a", "#1a5b3c")));
    this.sprites.set("ow_forest", this.make((c) => this.patternForest(c)));
    this.sprites.set("ow_mountain", this.make((c) => this.patternMountain(c)));
    this.sprites.set("ow_road", this.make((c) => this.patternRoad(c)));
    this.sprites.set("ow_town", this.make((c) => this.patternTown(c)));
    this.sprites.set("ow_dungeon", this.make((c) => this.patternDungeonEntrance(c)));

    // Dungeon themes
    this.sprites.set("dg_wall_ruins", this.make((c) => this.patternStone(c, "#202a36", "#2d3a4b")));
    this.sprites.set("dg_floor_ruins", this.make((c) => this.patternFloor(c, "#0b1320", "#0f1b2d")));
    this.sprites.set("dg_stairs_ruins", this.make((c) => this.patternStairs(c, "#15243a", "#cfe3ff")));

    this.sprites.set("dg_wall_caves", this.make((c) => this.patternStone(c, "#1f2a20", "#2c3a2e")));
    this.sprites.set("dg_floor_caves", this.make((c) => this.patternFloor(c, "#0a130c", "#122015")));
    this.sprites.set("dg_stairs_caves", this.make((c) => this.patternStairs(c, "#17301a", "#cfe3ff")));

    this.sprites.set("dg_wall_crypt", this.make((c) => this.patternStone(c, "#2a1a2f", "#3b2442")));
    this.sprites.set("dg_floor_crypt", this.make((c) => this.patternFloor(c, "#120914", "#1b0f1f")));
    this.sprites.set("dg_stairs_crypt", this.make((c) => this.patternStairs(c, "#2c1231", "#e6d7ff")));

    // Entities/items
    this.sprites.set("ent_player", this.make((c) => this.glyph(c, "@", "#ffffff")));
    this.sprites.set("ent_slime", this.make((c) => this.glyph(c, "s", "#7cff9e")));
    this.sprites.set("ent_goblin", this.make((c) => this.glyph(c, "g", "#7cff9e")));
    this.sprites.set("ent_orc", this.make((c) => this.glyph(c, "O", "#7cff9e")));

    this.sprites.set("it_potion", this.make((c) => this.glyph(c, "!", "#ffd36b")));
    this.sprites.set("it_weapon", this.make((c) => this.glyph(c, ")", "#ffd36b")));
    this.sprites.set("it_armor", this.make((c) => this.glyph(c, "]", "#ffd36b")));

    // UI overlay
    this.sprites.set("ui_path", this.make((c) => this.glyph(c, "•", "#93a7c8")));
    this.sprites.set("ui_destination", this.make((c) => this.glyph(c, "X", "#ffffff")));
  }

  private make(draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
    const c: HTMLCanvasElement = document.createElement("canvas");
    c.width = this.tileSize;
    c.height = this.tileSize;
    const g: CanvasRenderingContext2D | null = c.getContext("2d");
    if (!g) throw new Error("Canvas not available.");
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
    this.fill(ctx, "#0e2a1b", "#184a2f");
    ctx.fillStyle = "#1e6a45";
    ctx.fillRect(4, 4, 2, 6);
    ctx.fillRect(10, 3, 2, 7);
    ctx.fillStyle = "#0b1320";
    ctx.fillRect(5, 10, 1, 2);
    ctx.fillRect(11, 10, 1, 2);
  }

  private patternMountain(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, "#3a3f46", "#555b63");
    ctx.fillStyle = "#9aa1ab";
    ctx.beginPath();
    ctx.moveTo(2, 13);
    ctx.lineTo(7, 4);
    ctx.lineTo(12, 13);
    ctx.closePath();
    ctx.fill();
  }

  private patternRoad(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, "#253041", "#2f3f57");
    ctx.fillStyle = "#93a7c8";
    for (let x: number = 2; x < this.tileSize - 2; x += 3) {
      ctx.fillRect(x, 8, 1, 1);
    }
  }

  private patternTown(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, "#2b3b58", "#334a70");
    ctx.fillStyle = "#cfe3ff";
    ctx.fillRect(5, 8, 6, 5);
    ctx.fillRect(6, 6, 4, 2);
    ctx.fillStyle = "#0b1320";
    ctx.fillRect(7, 10, 2, 3);
  }

  private patternDungeonEntrance(ctx: CanvasRenderingContext2D): void {
    this.fill(ctx, "#553a8a", "#6a4fb0");
    ctx.fillStyle = "#e6d7ff";
    ctx.fillRect(5, 6, 6, 8);
    ctx.fillStyle = "#120914";
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
    this.fill(ctx, base, "#1a2433");
    this.glyph(ctx, ">", glyph);
  }

  private glyph(ctx: CanvasRenderingContext2D, g: string, color: string): void {
    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.fillRect(0, 0, this.tileSize, this.tileSize);
    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.fillRect(0, 0, this.tileSize, this.tileSize);

    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.fillRect(0, 0, this.tileSize, this.tileSize);

    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.fillRect(0, 0, this.tileSize, this.tileSize);

    ctx.fillStyle = color;
    ctx.font = "12px monospace";
    ctx.textBaseline = "top";
    ctx.fillText(g, 5, 2);
  }
}
