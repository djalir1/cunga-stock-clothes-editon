// ─── Paid Feature Flags ──────────────────────────────────────────────────────
// Each flag controls one paid feature.
// To ENABLE a feature:  change false → true  (one character change, nothing else)
// To DISABLE a feature: change true  → false
// No other code needs to change.
// ─────────────────────────────────────────────────────────────────────────────

export const FEATURES = {
  /** Temporary Stock — teacher lending module (sidebar page + its own DB tables) */
  temporaryStock: false,

  /** Sweater Numbers — unique number field when issuing sweater-category uniforms */
  sweaterNumbers: false,
} as const;
