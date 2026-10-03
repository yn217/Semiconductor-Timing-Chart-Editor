import { resolve } from "node:path";

/**
 * #782: a normal test run must not rewrite tracked repository artifacts. Diagnostic screenshots/reports go to the gitignored
 * `test-results/visual-artifacts` tree; only the explicit capture commands (`npm run visual:acceptance`, `npm run harness:capture`,
 * or UPDATE_VISUAL_ARTIFACTS=1) write into the tracked `artifacts/` tree.
 */
export const updatingVisualArtifacts = (): boolean => process.env.UPDATE_VISUAL_ARTIFACTS === "1";
export const visualArtifactRoot = (appRoot: string = process.cwd()): string => updatingVisualArtifacts() ? resolve(appRoot, "artifacts") : resolve(appRoot, "test-results", "visual-artifacts");
