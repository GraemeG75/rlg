import type { StatusEffectKind } from './enums';

export type StatusEffect = {
  kind: StatusEffectKind;
  remainingTurns: number;
  potency: number;
};
