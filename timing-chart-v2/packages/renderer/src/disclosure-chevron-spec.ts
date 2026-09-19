/**
 * Shared Cycle Tree / Transaction Tree / Inspector disclosure glyph geometry.
 * The imperative Cycle surface and React-owned controls consume this same
 * presentation spec while keeping their interaction state independently owned.
 */
export const DISCLOSURE_CHEVRON_SIZE = 15;

export const DISCLOSURE_CHEVRON_SPEC = {
  down: { path: "M6 9l6 6 6-6", strokeWidth: 2 },
  right: { path: "M9 6l6 6-6 6", strokeWidth: 2 },
} as const;
