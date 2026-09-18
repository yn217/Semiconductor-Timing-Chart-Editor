/** Shared vector geometry for the Cycle tree's common row actions and
 * disclosures. The React Transaction tree consumes the same specifications
 * so the two surfaces cannot drift into separate icon grammars. */
export const LEFT_TREE_ICON_PATHS = {
  "chevron-down": "M6 9l6 6 6-6",
  "chevron-right": "M9 6l6 6-6 6",
  eye: "M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z",
  "eye-off": "M3 3l18 18M10.6 6.2A10.8 10.8 0 0 1 12 6c6 0 10 6 10 6a17.6 17.6 0 0 1-3.2 3.5M6.2 7.8C3.6 9.4 2 12 2 12s4 6 10 6a10.8 10.8 0 0 0 2.5-.3",
} as const;

export type LeftTreeIconPathName = keyof typeof LEFT_TREE_ICON_PATHS;

export const LEFT_TREE_ICON_DOTS = [
  { cx: 12, cy: 5, r: 1.8 },
  { cx: 12, cy: 12, r: 1.8 },
  { cx: 12, cy: 19, r: 1.8 },
] as const;

export const LEFT_TREE_ICON_PUPIL = { cx: 12, cy: 12, r: 2.5 } as const;
