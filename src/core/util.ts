import type { Point } from "./types";

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function manhattan(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function keyPoint(p: Point): string {
  return `${p.x},${p.y}`;
}

export function parseKeyPoint(k: string): Point | undefined {
  const parts: string[] = k.split(",");
  if (parts.length !== 2) return undefined;
  const x: number = Number(parts[0]);
  const y: number = Number(parts[1]);
  if (Number.isNaN(x) || Number.isNaN(y)) return undefined;
  return { x, y };
}
