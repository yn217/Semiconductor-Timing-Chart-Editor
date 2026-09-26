import { expect, type Locator } from "@playwright/test";

const overlaySelector = "[data-role='annotation-owner'][data-annotation-id]";

export async function snapshotAnnotationIds(surface: Locator): Promise<Set<string>> {
  const ids = await surface.locator(overlaySelector).evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-annotation-id")).filter((id): id is string => id !== null),
  );
  return new Set(ids);
}

export async function waitForCreatedAnnotationId(surface: Locator, previousIds: ReadonlySet<string>, type?: string): Promise<string> {
  const selector = type ? `${overlaySelector}[data-annotation-type='${type}']` : overlaySelector;
  const findCreatedIds = () => surface.locator(selector).evaluateAll((elements, previous) =>
    elements
      .map((element) => element.getAttribute("data-annotation-id"))
      .filter((id): id is string => id !== null && !previous.includes(id)),
    [...previousIds],
  );
  await expect.poll(findCreatedIds).toHaveLength(1);
  const annotationId = (await findCreatedIds())[0];
  if (!annotationId) throw new Error("Expected exactly one new Annotation with a stable semantic ID.");
  return annotationId;
}

export function annotationOwnerById(surface: Locator, annotationId: string): Locator {
  return surface.locator(`${overlaySelector}[data-annotation-id='${annotationId}']`);
}
