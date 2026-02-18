import type { ActionKind } from './enums';

export type Action =
  | { kind: ActionKind.Move; dx: number; dy: number }
  | { kind: ActionKind.Use }
  | { kind: ActionKind.Wait }
  | { kind: ActionKind.Pickup }
  | { kind: ActionKind.ToggleInventory }
  | { kind: ActionKind.ToggleShop }
  | { kind: ActionKind.ToggleQuest }
  | { kind: ActionKind.ToggleStory }
  | { kind: ActionKind.ToggleMap }
  | { kind: ActionKind.CancelAuto }
  | { kind: ActionKind.ToggleRenderer }
  | { kind: ActionKind.ToggleFov }
  | { kind: ActionKind.Help }
  | { kind: ActionKind.Save }
  | { kind: ActionKind.Load };
