
type Tile = "water" | "grass" | "mountain" | "dungeon" | "wall" | "floor" | "stairsUp";

type Mode = "overworld" | "dungeon";

const WORLD_SIZE: number = 200;
const DUNGEON_WIDTH: number = 60;
const DUNGEON_HEIGHT: number = 40;

const gameEl: HTMLElement = document.getElementById("game")!;

let mode: Mode = "overworld";

let player = { x: 100, y: 100 };

let overworld: Tile[][] = [];
let dungeon: Tile[][] = [];

function random(seed: number): () => number {
  let s: number = seed;
  return function (): number {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function generateOverworld(): void {
  const rng = random(12345);
  for (let y: number = 0; y < WORLD_SIZE; y++) {
    overworld[y] = [];
    for (let x: number = 0; x < WORLD_SIZE; x++) {
      const r: number = rng();
      if (r < 0.2) overworld[y][x] = "water";
      else if (r > 0.85) overworld[y][x] = "mountain";
      else overworld[y][x] = "grass";
    }
  }

  // place some dungeons
  for (let i: number = 0; i < 30; i++) {
    const dx: number = Math.floor(rng() * WORLD_SIZE);
    const dy: number = Math.floor(rng() * WORLD_SIZE);
    overworld[dy][dx] = "dungeon";
  }
}

function generateDungeon(): void {
  dungeon = [];
  for (let y: number = 0; y < DUNGEON_HEIGHT; y++) {
    dungeon[y] = [];
    for (let x: number = 0; x < DUNGEON_WIDTH; x++) {
      dungeon[y][x] = "wall";
    }
  }

  // carve simple rooms
  for (let i: number = 0; i < 10; i++) {
    const rw: number = 6 + Math.floor(Math.random() * 8);
    const rh: number = 4 + Math.floor(Math.random() * 6);
    const rx: number = 1 + Math.floor(Math.random() * (DUNGEON_WIDTH - rw - 2));
    const ry: number = 1 + Math.floor(Math.random() * (DUNGEON_HEIGHT - rh - 2));

    for (let y: number = ry; y < ry + rh; y++) {
      for (let x: number = rx; x < rx + rw; x++) {
        dungeon[y][x] = "floor";
      }
    }
  }

  dungeon[2][2] = "stairsUp";
}

function render(): void {
  let output: string = "";

  const viewWidth: number = 41;
  const viewHeight: number = 21;

  const halfW: number = Math.floor(viewWidth / 2);
  const halfH: number = Math.floor(viewHeight / 2);

  for (let y: number = -halfH; y <= halfH; y++) {
    for (let x: number = -halfW; x <= halfW; x++) {
      const wx: number = player.x + x;
      const wy: number = player.y + y;

      if (x === 0 && y === 0) {
        output += "@";
        continue;
      }

      if (mode === "overworld") {
        if (wx < 0 || wy < 0 || wx >= WORLD_SIZE || wy >= WORLD_SIZE) {
          output += " ";
          continue;
        }
        const tile: Tile = overworld[wy][wx];
        output += tileChar(tile);
      } else {
        if (wx < 0 || wy < 0 || wx >= DUNGEON_WIDTH || wy >= DUNGEON_HEIGHT) {
          output += " ";
          continue;
        }
        const tile: Tile = dungeon[wy][wx];
        output += tileChar(tile);
      }
    }
    output += "\n";
  }

  output += "\nMode: " + mode;
  gameEl.textContent = output;
}

function tileChar(tile: Tile): string {
  switch (tile) {
    case "water": return "~";
    case "grass": return ".";
    case "mountain": return "^";
    case "dungeon": return "D";
    case "wall": return "#";
    case "floor": return ".";
    case "stairsUp": return "<";
  }
}

function move(dx: number, dy: number): void {
  player.x += dx;
  player.y += dy;

  if (mode === "overworld") {
    const tile: Tile = overworld[player.y]?.[player.x];
    if (tile === "dungeon") {
      mode = "dungeon";
      generateDungeon();
      player.x = 2;
      player.y = 2;
    }
  } else {
    const tile: Tile = dungeon[player.y]?.[player.x];
    if (tile === "stairsUp") {
      mode = "overworld";
      player.x = 100;
      player.y = 100;
    }
  }

  render();
}

window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === "ArrowUp" || e.key === "w") move(0, -1);
  if (e.key === "ArrowDown" || e.key === "s") move(0, 1);
  if (e.key === "ArrowLeft" || e.key === "a") move(-1, 0);
  if (e.key === "ArrowRight" || e.key === "d") move(1, 0);
});

generateOverworld();
render();
