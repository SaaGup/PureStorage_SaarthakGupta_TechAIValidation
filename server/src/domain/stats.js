// Small statistics helpers.

// Same definition as SQL PERCENTILE_CONT: linear interpolation between ranks.
export function percentileCont(values, p) {
  const v = values.filter((x) => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const pos = p * (v.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

// Round to n decimals. Number.EPSILON nudges values like 1.005 so they round up as people expect.
export function round(x, n = 2) {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  const f = 10 ** n;
  return Math.round((x + Math.sign(x) * Number.EPSILON) * f) / f;
}

export const safeDivide = (a, b) => (b === 0 ? null : a / b);