/**
 * Ridge regression (L2-regularised least squares) with feature standardisation,
 * solved in closed form. Small enough (tens of features) that the normal
 * equations are fast and exact, and it needs no dependencies.
 *
 * Rows are accumulated one at a time, so training on ~100k rows never holds
 * the whole design matrix in memory.
 */

export interface RidgeModel {
  /** Feature names, for inspection; order matches `coef`. */
  features: string[];
  mean: number[];
  scale: number[];
  intercept: number;
  coef: number[];
}

export class RidgeAccumulator {
  private n = 0;
  /** Sum of row weights. */
  private sw = 0;
  private readonly sum: Float64Array;
  private readonly sumSq: Float64Array;
  private readonly xtx: Float64Array;
  private readonly xty: Float64Array;
  private sumY = 0;

  constructor(private readonly features: string[]) {
    const k = features.length;
    this.sum = new Float64Array(k);
    this.sumSq = new Float64Array(k);
    this.xtx = new Float64Array(k * k);
    this.xty = new Float64Array(k);
  }

  get rows(): number {
    return this.n;
  }

  /** Adds a row; `w` weights it (e.g. more weight for recent history). */
  add(x: ArrayLike<number>, y: number, w = 1): void {
    const k = this.features.length;
    if (x.length !== k) throw new Error(`Expected ${k} features, got ${x.length}`);
    if (!Number.isFinite(y) || !(w > 0)) return;
    for (let i = 0; i < k; i++) if (!Number.isFinite(x[i]!)) return;
    this.n++;
    this.sw += w;
    this.sumY += w * y;
    for (let i = 0; i < k; i++) {
      const xi = x[i]!;
      const wxi = w * xi;
      this.sum[i]! += wxi;
      this.sumSq[i]! += wxi * xi;
      this.xty[i]! += wxi * y;
      for (let j = i; j < k; j++) this.xtx[i * k + j]! += wxi * x[j]!;
    }
  }

  /**
   * Solves on standardised features. `lambda` is relative to the row count, so
   * the same value works regardless of how much history we train on.
   */
  fit(lambda = 1e-3): RidgeModel {
    const k = this.features.length;
    if (this.n < k + 1) throw new Error(`Not enough rows to fit (${this.n})`);
    const n = this.sw; // weighted row count
    const mean = Array.from(this.sum, (s) => s / n);
    const scale = Array.from(this.sumSq, (s, i) => {
      const v = s / n - mean[i]! ** 2;
      return v > 1e-12 ? Math.sqrt(v) : 1;
    });
    const meanY = this.sumY / n;

    // Centred, scaled X'X and X'y: cov(xi,xj)*n / (si*sj)
    const a = new Float64Array(k * k);
    const b = new Float64Array(k);
    for (let i = 0; i < k; i++) {
      for (let j = i; j < k; j++) {
        const c = (this.xtx[i * k + j]! - n * mean[i]! * mean[j]!) / (scale[i]! * scale[j]!);
        a[i * k + j] = c;
        a[j * k + i] = c;
      }
      a[i * k + i]! += lambda * n;
      b[i] = (this.xty[i]! - n * mean[i]! * meanY) / scale[i]!;
    }
    const coef = solve(a, b, k);
    return { features: [...this.features], mean, scale, intercept: meanY, coef };
  }
}

export function predict(model: RidgeModel, x: ArrayLike<number>): number {
  let y = model.intercept;
  for (let i = 0; i < model.coef.length; i++) {
    y += (model.coef[i]! * (x[i]! - model.mean[i]!)) / model.scale[i]!;
  }
  return y;
}

/** Gaussian elimination with partial pivoting; `a` is k×k row-major and is overwritten. */
function solve(a: Float64Array, b: Float64Array, k: number): number[] {
  for (let col = 0; col < k; col++) {
    let pivot = col;
    for (let r = col + 1; r < k; r++) {
      if (Math.abs(a[r * k + col]!) > Math.abs(a[pivot * k + col]!)) pivot = r;
    }
    if (Math.abs(a[pivot * k + col]!) < 1e-12) throw new Error('Singular matrix');
    if (pivot !== col) {
      for (let c = 0; c < k; c++) {
        const t = a[col * k + c]!;
        a[col * k + c] = a[pivot * k + c]!;
        a[pivot * k + c] = t;
      }
      const t = b[col]!;
      b[col] = b[pivot]!;
      b[pivot] = t;
    }
    for (let r = col + 1; r < k; r++) {
      const f = a[r * k + col]! / a[col * k + col]!;
      if (f === 0) continue;
      for (let c = col; c < k; c++) a[r * k + c]! -= f * a[col * k + c]!;
      b[r]! -= f * b[col]!;
    }
  }
  const x = new Array<number>(k).fill(0);
  for (let r = k - 1; r >= 0; r--) {
    let s = b[r]!;
    for (let c = r + 1; c < k; c++) s -= a[r * k + c]! * x[c]!;
    x[r] = s / a[r * k + r]!;
  }
  return x;
}
