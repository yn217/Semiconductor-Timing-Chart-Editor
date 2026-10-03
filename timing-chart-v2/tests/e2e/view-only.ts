import { expect, type Page } from "@playwright/test";

/**
 * The shared product contract "view-only operations leave Canonical / History / Dirty untouched" (#782). Specs capture the document
 * state through the user-visible surface (data-canonical-revision, History and Dirty status) rather than each re-implementing the reads.
 */
export interface DocumentState { readonly revision: string | null | undefined; readonly history: string | null | undefined; readonly dirty: string | null | undefined }

export const documentState = (page: Page): Promise<DocumentState> => page.evaluate(() => ({
  revision: document.querySelector("[data-testid='cycle-surface']")?.getAttribute("data-canonical-revision"),
  history: document.querySelector("[data-testid='history-status']")?.textContent,
  dirty: document.querySelector("[data-testid='dirty-status']")?.textContent,
}));

export async function expectViewOnly(page: Page, before: DocumentState, message = "view-only operations do not touch Canonical / History / Dirty"): Promise<void> {
  // Polled (not a single read): status text may settle a frame after the operation, but it must end identical to the captured state.
  await expect.poll(() => documentState(page), { message }).toEqual(before);
}
