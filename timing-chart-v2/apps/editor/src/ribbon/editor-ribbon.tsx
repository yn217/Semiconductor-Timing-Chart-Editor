import type { ComponentProps } from "react";
import { Ribbon } from "../minimal-cycle-view-ribbon.js";

export type EditorRibbonProps = ComponentProps<typeof Ribbon>;

/** Presentation owner for the editor ribbon; the composition root supplies only its view model and callbacks. */
export function EditorRibbon(props: EditorRibbonProps) {
  return <Ribbon {...props} />;
}
