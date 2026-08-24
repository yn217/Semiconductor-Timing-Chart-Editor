import type { SemanticCommandDispatcher } from "@timing-chart-v2/commands";

/** UI receives only the semantic command port; it never receives a mutation port. */
export interface UiServices {
  readonly commands: SemanticCommandDispatcher;
}
