import type { Point } from './types';
import type { Overworld } from '../maps/overworld';
import { t } from '../i18n';

export type DiscoveredPoiKind = 'town' | 'dungeon' | 'cave';

export type DiscoveredPoi = {
  id: string;
  kind: DiscoveredPoiKind;
  name: string;
  pos: Point;
  discoveredTurn: number;
};

export function poiId(kind: DiscoveredPoiKind, pos: Point): string {
  return `${kind}:${pos.x},${pos.y}`;
}

export function maybeDiscoverPois(overworld: Overworld, playerPos: Point, discovered: DiscoveredPoi[], turnCounter: number): boolean {
  const tile: string = overworld.getTile(playerPos.x, playerPos.y);
  if (tile !== 'town' && tile !== 'dungeon' && tile !== 'cave') {
    return false;
  }

  const kind: DiscoveredPoiKind = tile === 'town' ? 'town' : tile === 'cave' ? 'cave' : 'dungeon';
  const id: string = poiId(kind, playerPos);
  if (discovered.some((p) => p.id === id)) {
    return false;
  }

  const count: number = discovered.filter((p) => p.kind === kind).length + 1;
  const name: string =
    kind === 'town' ? t('poi.town', { num: count }) : kind === 'cave' ? t('poi.cave', { num: count }) : t('poi.dungeon', { num: count });

  discovered.push({ id, kind, name, pos: { x: playerPos.x, y: playerPos.y }, discoveredTurn: turnCounter });
  return true;
}
