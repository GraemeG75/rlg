import type { Point } from "../core/types";
import type { Overworld } from "../maps/overworld";

export type MinimapContext = {
  overworld: Overworld;
  playerPos: Point;
  destination?: Point;
  discoveredPois: { kind: "town" | "dungeon"; pos: Point }[];
};

export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  context: MinimapContext,
  x: number,
  y: number,
  tiles: number,
  tileSize: number,
): void {
  // Draw a simple minimap box (opaque background)
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "#0b1320";
  ctx.fillRect(x - 2, y - 2, tiles * tileSize + 4, tiles * tileSize + 4);
  ctx.globalAlpha = 1.0;

  const half: number = Math.floor(tiles / 2);

  for (let my: number = 0; my < tiles; my++) {
    for (let mx: number = 0; mx < tiles; mx++) {
      const wx: number = context.playerPos.x + (mx - half);
      const wy: number = context.playerPos.y + (my - half);
      const t: string = context.overworld.getTile(wx, wy);

      ctx.fillStyle =
        t === "water" ? "#0f4d7f" :
        t === "grass" ? "#1a5b3c" :
        t === "forest" ? "#174a30" :
        t === "mountain" ? "#555b63" :
        t === "road" ? "#93a7c8" :
        t === "town" ? "#cfe3ff" :
        t === "dungeon" ? "#e6d7ff" :
        "#1a5b3c";

      ctx.fillRect(x + mx * tileSize, y + my * tileSize, tileSize, tileSize);
    }
  }

  // discovered POIs
  for (const p of context.discoveredPois) {
    const dx: number = p.pos.x - context.playerPos.x;
    const dy: number = p.pos.y - context.playerPos.y;
    if (Math.abs(dx) > half || Math.abs(dy) > half) continue;
    const mx: number = dx + half;
    const my: number = dy + half;
    ctx.fillStyle = p.kind === "town" ? "#ffffff" : "#ffd36b";
    ctx.fillRect(x + mx * tileSize + 2, y + my * tileSize + 2, Math.max(2, tileSize - 4), Math.max(2, tileSize - 4));
  }

  // destination
  if (context.destination) {
    const dx: number = context.destination.x - context.playerPos.x;
    const dy: number = context.destination.y - context.playerPos.y;
    if (Math.abs(dx) <= half && Math.abs(dy) <= half) {
      const mx: number = dx + half;
      const my: number = dy + half;
      ctx.strokeStyle = "#ffffff";
      ctx.strokeRect(x + mx * tileSize + 1, y + my * tileSize + 1, tileSize - 2, tileSize - 2);
    }
  }

  // player
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x + half * tileSize + 2, y + half * tileSize + 2, Math.max(2, tileSize - 4), Math.max(2, tileSize - 4));

  ctx.restore();
}
