import { DefaultProjectionService, type ProjectionRequest, type RenderProjection } from "@timing-chart-v2/projection";

/** Owns projection service lifetime and keeps projection calls outside React UI code. */
export class ProjectionCoordinator {
  private readonly service = new DefaultProjectionService();

  project(request: ProjectionRequest): RenderProjection {
    return this.service.project(request);
  }

  diagnostics(): ReturnType<DefaultProjectionService["diagnostics"]> {
    return this.service.diagnostics();
  }
}
