export type RandomFn = () => number;

function mulberry32(seed: number): RandomFn {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function deriveStreamSeed(masterSeed: number, streamName: string): number {
  let hash = (2166136261 ^ masterSeed) >>> 0;
  for (let i = 0; i < streamName.length; i++) {
    hash ^= streamName.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

export type RandomStreamName =
  | "demand"
  | "customer_choice"
  | "weather"
  | "events"
  | "staffing"
  | "competitor";

export class RandomStreams {
  private readonly generators = new Map<RandomStreamName, RandomFn>();

  constructor(private readonly masterSeed: number) {}

  stream(name: RandomStreamName): RandomFn {
    let generator = this.generators.get(name);
    if (!generator) {
      generator = mulberry32(deriveStreamSeed(this.masterSeed, name));
      this.generators.set(name, generator);
    }
    return generator;
  }
}
