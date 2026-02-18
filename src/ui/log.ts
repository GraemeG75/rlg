import type { Message } from '../types';

/**
 * Fixed-size message log for UI display.
 */
export class MessageLog {
  private readonly max: number;
  private readonly items: Message[];

  /**
   * Creates a new message log with a max capacity.
   * @param max The maximum number of messages.
   */
  public constructor(max: number) {
    this.max = max;
    this.items = [];
  }

  /**
   * Adds a message to the log.
   * @param text The message text.
   */
  public push(text: string): void {
    this.items.unshift({ text, t: Date.now() });
    while (this.items.length > this.max) this.items.pop();
  }

  /**
   * Returns all messages, newest first.
   * @returns The message list.
   */
  public all(): Message[] {
    return [...this.items];
  }
}
