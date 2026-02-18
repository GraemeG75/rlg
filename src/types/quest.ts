import type { QuestKind } from './enums';

export type Quest = {
  id: string;
  townId: string;
  kind: QuestKind;
  description: string;

  targetCount: number;
  currentCount: number;

  targetMonster?: string;
  targetDepth?: number;

  minDungeonDepth: number;

  rewardGold: number;
  rewardXp: number;
  rewardItemId?: string;
  rewardItemIds?: string[];
  completed: boolean;
  turnedIn: boolean;
};
