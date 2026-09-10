import { describe, expect, it } from "vitest";
import { planCommand } from "@timing-chart-v2/commands";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("semantic no-op equality", () => {
  it("treats equivalent metadata objects as a no-op regardless of key order", () => {
    const document = canonicalFixture();
    const header = { constraints: [...document.document.header.constraints], subtitle: document.document.header.subtitle, description: document.document.header.description, notes: document.document.header.notes, preconditions: [...document.document.header.preconditions], exceptions: [...document.document.header.exceptions] };
    const result = planCommand(document, { id: "metadata-reordered" as never, type: "document.updateMetadata", title: document.document.title, header, footer: { ...document.document.footer } });
    expect(result).toMatchObject({ ok: false, reason: "no-op" });
  });
});
