// ─── Paid Feature Flags ──────────────────────────────────────────────────────
// Each flag controls one paid feature.
// To ENABLE a feature:  change false → true  (one character change, nothing else)
// To DISABLE a feature: change true  → false
// No other code needs to change.
// ─────────────────────────────────────────────────────────────────────────────

export const FEATURES = {
  /** Temporary Stock — garments out with customers on approval / reserved (sidebar page + its own DB tables) */
  temporaryStock: true,
} as const;
