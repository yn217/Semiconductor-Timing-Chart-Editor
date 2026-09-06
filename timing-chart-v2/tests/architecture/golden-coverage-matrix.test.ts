import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type GoldenManifestEntry = {
  readonly file: string;
  readonly coverage: readonly string[];
};

const workspace = resolve(import.meta.dirname, "../..");
const protocolManifestPath = resolve(workspace, "samples/golden-protocol/timing_chart_sample_pack/manifest.json");
const featureManifestPath = resolve(workspace, "samples/golden-feature-coverage/timing_chart_feature_coverage_pack/manifest.json");
const featureMatrixPath = resolve(workspace, "samples/golden-feature-coverage/timing_chart_feature_coverage_pack/coverage_matrix.csv");

function readManifest(path: string): readonly GoldenManifestEntry[] {
  return JSON.parse(readFileSync(path, "utf8")) as GoldenManifestEntry[];
}

function readFeatureMatrix(): { readonly samples: readonly string[]; readonly coverage: ReadonlyMap<string, ReadonlySet<string>> } {
  const lines = readFileSync(featureMatrixPath, "utf8").trim().split(/\r?\n/).map((line) => line.split(","));
  const header = lines[0];
  if (!header || header[0] !== "Feature") throw new Error("Golden feature coverage matrix must start with a Feature header.");
  const samples = header.slice(1).filter((sample): sample is string => sample.length > 0);
  const coverage = new Map<string, ReadonlySet<string>>();
  for (const fields of lines.slice(1)) {
    const feature = fields[0];
    if (!feature) continue;
    const mapped = new Set(samples.filter((sample, index) => fields[index + 1] === "X"));
    coverage.set(feature, mapped);
  }
  return { samples, coverage };
}

describe("Golden feature coverage matrix gate", () => {
  it("keeps the 20 immutable samples unique and split into protocol and feature packs", () => {
    const protocol = readManifest(protocolManifestPath);
    const feature = readManifest(featureManifestPath);
    const allFiles = [...protocol, ...feature].map((entry) => entry.file);
    expect(protocol).toHaveLength(10);
    expect(feature).toHaveLength(10);
    expect(new Set(allFiles).size).toBe(20);
    expect(protocol.map((entry) => entry.file)).toEqual(expect.arrayContaining(["01_apb_register_access.tcd.json", "10_axi4_stream_packet_backpressure.tcd.json"]));
    expect(feature.map((entry) => entry.file)).toEqual([
      "11_signal_types_roles_legend.tcd.json",
      "12_group_bands_and_spacing.tcd.json",
      "13_signal_name_layout.tcd.json",
      "14_annotation_overlay_all_types.tcd.json",
      "15_transition_arrows_anchor_styles.tcd.json",
      "16_clock_phase_gating_gap.tcd.json",
      "17_cycle_insert_delete_ripple.tcd.json",
      "18_legend_and_group_reorder.tcd.json",
      "19_header_footer_export.tcd.json",
      "20_transaction_cycle_linked_views.tcd.json",
    ]);
  });

  it("matches every feature manifest label in both directions", () => {
    const feature = readManifest(featureManifestPath);
    const matrix = readFeatureMatrix();
    expect(matrix.samples).toEqual(feature.map((entry) => entry.file));

    const manifestCoverage = new Map<string, Set<string>>();
    for (const entry of feature) {
      expect(new Set(entry.coverage).size, `${entry.file}: duplicate coverage label`).toBe(entry.coverage.length);
      for (const label of entry.coverage) {
        const samples = manifestCoverage.get(label) ?? new Set<string>();
        samples.add(entry.file);
        manifestCoverage.set(label, samples);
      }
    }

    expect(new Set(matrix.coverage.keys())).toEqual(new Set(manifestCoverage.keys()));
    for (const [label, samples] of manifestCoverage) {
      expect(matrix.coverage.get(label), `${label}: missing matrix row`).toEqual(samples);
      expect(samples.size, `${label}: feature must map to at least one sample`).toBeGreaterThan(0);
    }
    for (const [label, samples] of matrix.coverage) {
      expect(samples.size, `${label}: orphan matrix row`).toBeGreaterThan(0);
    }
  });
});
