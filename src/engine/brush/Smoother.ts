export interface SamplePoint {
  x: number;
  y: number;
  p: number;
}

/**
 * "Lazy" stabilizer: the output point trails the input by a fraction that
 * grows with `strength`, which removes hand jitter. `finish()` lets the
 * trailing point catch up to the last input so strokes end where the pen did.
 */
export class Smoother {
  private cur: SamplePoint | null = null;
  private last: SamplePoint | null = null;

  constructor(public strength: number) {}

  push(pt: SamplePoint): SamplePoint {
    this.last = pt;
    if (!this.cur) {
      this.cur = { ...pt };
      return { ...pt };
    }
    const k = 1 - Math.min(0.95, Math.max(0, this.strength)) ;
    this.cur = {
      x: this.cur.x + (pt.x - this.cur.x) * k,
      y: this.cur.y + (pt.y - this.cur.y) * k,
      p: this.cur.p + (pt.p - this.cur.p) * Math.max(k, 0.3),
    };
    return { ...this.cur };
  }

  /** Points that walk the smoothed position to the final input point. */
  finish(): SamplePoint[] {
    const out: SamplePoint[] = [];
    if (!this.cur || !this.last) return out;
    for (let i = 0; i < 64; i++) {
      const d = Math.hypot(this.last.x - this.cur.x, this.last.y - this.cur.y);
      if (d < 0.5) break;
      out.push(this.push(this.last));
    }
    return out;
  }
}
