import { useMemo } from "react";
import { createMinimalCycleApplicationPort, type MinimalCycleApplicationPort, type MinimalCycleApplicationSource } from "./minimal-cycle-view-application.js";
import { createMinimalCycleTimelinePort, type MinimalCycleTimelinePort, type MinimalCycleTimelineSource } from "./minimal-cycle-view-timeline.js";
import { MinimalCycleViewUi, type MinimalCycleViewUiSource } from "./minimal-cycle-view-ui.js";
export type MinimalCycleViewNextSource = MinimalCycleApplicationSource & MinimalCycleTimelineSource & MinimalCycleViewUiSource;
export function MinimalCycleViewNext({ source }: { readonly source: MinimalCycleViewNextSource }) { const application: MinimalCycleApplicationPort = useMemo(() => createMinimalCycleApplicationPort(source), [source]); const timeline: MinimalCycleTimelinePort = useMemo(() => createMinimalCycleTimelinePort(source), [source]); return <MinimalCycleViewUi source={source} application={application} timeline={timeline} />; }
