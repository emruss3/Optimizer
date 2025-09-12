// Centralized color expressions to avoid duplicate decl errors on HMR.
export function sizeColorExpr() {
  // tiny <1k, small <2k, med <5k, large <20k, huge >=20k
  return [
    "case",
    ["<", ["to-number", ["get", "sqft"]], 1000], "#f87171",
    ["<", ["to-number", ["get", "sqft"]], 2000], "#fb923c",
    ["<", ["to-number", ["get", "sqft"]], 5000], "#60a5fa",
    ["<", ["to-number", ["get", "sqft"]], 20000], "#3b82f6",
    "#1e3a8a"
  ];
}

export function zoningColorExpr() {
  // coarse mapping by zoning prefix (adjust as needed)
  return [
    "match",
    ["slice", ["to-string", ["get", "zoning"]], 0, 2],
    "RS", "#22c55e",      // single-family
    "RM", "#6366f1",      // multi-family
    "MU", "#ef4444",      // mixed-use
    "CS", "#f59e0b",      // commercial sampler
    "CN", "#f59e0b",
    "SP", "#a855f7",      // special
    "AG", "#10b981",      // agriculture/open
    /* default */ "#93a3b5"
  ];
}