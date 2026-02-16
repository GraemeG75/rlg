import type { DiscoveredPoi } from '../core/discovery';
import { t } from '../i18n';

export function renderFastTravelHtml(pois: DiscoveredPoi[], onlyTowns: boolean): string {
  const lines: string[] = [];
  lines.push(
    `<div class="panelTitle"><b>${escapeHtml(t('fastTravel.title'))}</b><span class="tag">${escapeHtml(t('fastTravel.close'))}</span></div>`
  );
  lines.push(`<div class="small muted">${escapeHtml(t('fastTravel.hint'))}</div>`);
  lines.push(`<div class="sep"></div>`);

  const list: DiscoveredPoi[] = onlyTowns ? pois.filter((p) => p.kind === 'town') : pois;
  if (list.length === 0) {
    lines.push(`<div class="small muted">${escapeHtml(t('fastTravel.none'))}</div>`);
    return lines.join('');
  }

  for (const p of list) {
    const badge: string =
      p.kind === 'town' ? t('fastTravel.badge.town') : p.kind === 'cave' ? t('fastTravel.badge.cave') : t('fastTravel.badge.dungeon');
    lines.push(
      `<div class="row" style="justify-content:space-between; align-items:center;">` +
        `<div class="small"><b>${escapeHtml(p.name)}</b> <span class="muted">(${p.pos.x}, ${p.pos.y})</span> <span class="tag">${badge}</span></div>` +
        `<button class="btnTiny" data-act="fastTravel" data-poi="${escapeHtml(p.id)}">${escapeHtml(t('fastTravel.go'))}</button>` +
        `</div>`
    );
    lines.push(`<div class="sep"></div>`);
  }

  return lines.join('');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;');
}
