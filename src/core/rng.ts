export class Rng {
  private state: number;

  public constructor(seed: number) {
    this.state = seed | 0;
    if (this.state === 0) { this.state = 0x1234567; }
  }

  public nextU32(): number {
    // xorshift32
    let x: number = this.state | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x | 0;
    return x >>> 0;
  }

  public nextFloat(): number {
    return this.nextU32() / 0xffffffff;
  }

  public nextInt(minInclusive: number, maxExclusive: number): number {
    const span: number = maxExclusive - minInclusive;
    if (span <= 0) { return minInclusive; }
    return minInclusive + (this.nextU32() % span);
  }

  public pickOne<T>(items: T[]): T {
    return items[this.nextInt(0, items.length)];
  }
}
