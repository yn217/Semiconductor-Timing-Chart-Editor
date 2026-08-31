import { useMemo } from "react";
import {
  createMinimalCycleApplicationPort,
  type MinimalCycleApplicationPort,
  type MinimalCycleApplicationSource,
} from "./minimal-cycle-view-application.js";
import {
  createMinimalCycleTimelinePort,
  type MinimalCycleTimelinePort,
  type MinimalCycleTimelineSource,
} from "./minimal-cycle-view-timeline.js";
import {
  MinimalCycleViewUi,
  type MinimalCycleViewUiSource,
} from "./minimal-cycle-view-ui.js";

/**
 * Parallel replacement shell for MinimalCycleView.
 *
 * This file is intentionally tiny.  It knows only the three coarse owners:
 * Application, Timeline and UI.  The current monolith can be kept alive while
 * its existing state/refs/callbacks are exposed through `source`.
 */
export type MinimalCycleViewNextSource =
  MinimalCycleApplicationSource &
  MinimalCycleTimelineSource &
  MinimalCycleViewUiSource;

export function MinimalCycleViewNext({ source }: { readonly source: MinimalCycleViewNextSource }) {
  const application: MinimalCycleApplicationPort = useMemo(
    () => createMinimalCycleApplicationPort(source),
    [source],
  );

  const timeline: MinimalCycleTimelinePort = useMemo(
    () => createMinimalCycleTimelinePort(source),
    [source],
  );

  return (
    <MinimalCycleViewUi
      source={source}
      application={application}
      timeline={timeline}
    />
  );
}
