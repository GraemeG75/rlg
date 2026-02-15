import type { DiscoveredPoi } from "../core/discovery";

export function renderFastTravelHtml(pois: DiscoveredPoi[], onlyTowns: boolean): string {
  const lines: string[] = [];
  lines.push(`<div class="panelTitle"><b>Fast Travel</b><span class="tag">L to close</span></div>`);
  lines.push(`<div class="small muted">Click a destination to travel. (Only available in town)</div>`);
  lines.push(`<div class="sep"></div>`);

  const list: DiscoveredPoi[] = onlyTowns ? pois.filter((p) => p.kind === "town") : pois;
  if (list.length === 0) {
    lines.push(`<div class="small muted">Nothing discovered yet.</div>`);
    return lines.join("");
  }

  for (const p of list) {
    const badge: string = p.kind === "town" ? "Town" : "Dungeon";
    lines.push(`<div class="row" style="justify-content:space-between; align-items:center;">` +
      `<div class="small"><b>${escapeHtml(p.name)}</b> <span class="muted">(${p.pos.x}, ${p.pos.y})</span> <span class="tag">${badge}</span></div>` +
      `<button class="btnTiny" data-act="fastTravel" data-poi="${escapeHtml(p.id)}">Go</button>` +
    `</div>`);
    lines.push(`<div class="sep"></div>`);
  }

  return lines.join("");
}

function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
