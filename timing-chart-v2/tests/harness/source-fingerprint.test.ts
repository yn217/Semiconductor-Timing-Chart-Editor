import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let computeSourceFingerprint: (root: string) => Promise<string>;

describe("source fingerprint", () => {
  let repository: string;

  beforeAll(() => {
    repository = mkdtempSync(join(tmpdir(), "source-fingerprint-test-"));
    execFileSync("git", ["init", "-q"], { cwd: repository });
    writeFileSync(join(repository, "tracked.txt"), "baseline\n");
    execFileSync("git", ["add", "tracked.txt"], { cwd: repository });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "baseline"], { cwd: repository });
  });

  beforeAll(async () => {
    ({ computeSourceFingerprint } = await import("../../scripts/lib/source-fingerprint.mjs"));
  });

  afterAll(() => rmSync(repository, { recursive: true, force: true }));

  it("fingerprints an unstaged tracked deletion as an absent working-tree source", async () => {
    const baseline = await computeSourceFingerprint(repository);
    unlinkSync(join(repository, "tracked.txt"));

    const afterDeletion = await computeSourceFingerprint(repository);

    expect(afterDeletion).not.toBe(baseline);
  });
});
