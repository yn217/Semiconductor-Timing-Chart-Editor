import type { CanonicalSnapshot } from "@timing-chart-v2/core";

export interface ExportRequest {
  readonly format: "svg" | "png" | "pdf";
  readonly snapshot: CanonicalSnapshot;
}

export interface ExportService {
  export(request: ExportRequest): Promise<Uint8Array>;
}
