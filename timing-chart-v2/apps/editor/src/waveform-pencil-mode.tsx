import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { DsIconBox } from "./design-system.js";

/** View-only draw-tool state shared by the Ribbon, the Bottom Panel and the Timeline interaction owner. Never Canonical/History/Dirty. */
export interface WaveformPencilMode {
  readonly get: () => boolean;
  readonly set: (active: boolean) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

export function createWaveformPencilMode(): WaveformPencilMode {
  let active = false;
  const listeners = new Set<() => void>();
  return {
    get: () => active,
    set: (next) => { if (next === active) return; active = next; for (const listener of [...listeners]) listener(); },
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

export const WaveformPencilContext = createContext<WaveformPencilMode>(createWaveformPencilMode());

export function useWaveformPencilMode(): readonly [active: boolean, setActive: (active: boolean) => void] {
  const mode = useContext(WaveformPencilContext);
  const active = useSyncExternalStore(mode.subscribe, mode.get, mode.get);
  return [active, mode.set];
}

export const WAVEFORM_PENCIL_TITLE = "Waveform Pencil — Draw HIGH/LOW by dragging directly on the signal waveform";

export function WaveformPencilIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2 14l.8-3.2 7.9-7.9a1.1 1.1 0 011.6 0l.9.9a1.1 1.1 0 010 1.6l-7.9 7.9L2 14z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><path d="M9.6 4.1l2.3 2.3" stroke="currentColor" strokeWidth="1.2" /></svg>;
}

export function SelectToolIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 2l9 5.2-4 1.1 2.4 4.2-1.6.9-2.4-4.2L3 12.5z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>;
}

/** Icon-only Bottom Panel toggle; the long name and the description appear on hover and keyboard focus (native title). */
export function BottomWaveformPencilButton() {
  const [active, setActive] = useWaveformPencilMode();
  return <span className="bottom-waveform-pencil-anchor">
    <button type="button" className={`bottom-waveform-pencil${active ? " active" : ""}`} data-testid="bottom-waveform-pencil" aria-label="Waveform Pencil" aria-pressed={active} aria-describedby="bottom-waveform-pencil-tip" onClick={() => setActive(!active)}><WaveformPencilIcon /></button>
    <span id="bottom-waveform-pencil-tip" role="tooltip" className="bottom-waveform-pencil-tip" data-testid="bottom-waveform-pencil-tip">{WAVEFORM_PENCIL_TITLE}</span>
  </span>;
}

/** Home Ribbon draw tools: Select (default) and the Waveform Pencil toggle share the one mode with the Bottom Panel button. */
export function WaveformPencilRibbonTools() {
  const [active, setActive] = useWaveformPencilMode();
  const tool = (testId: string, label: string, pressed: boolean, icon: ReactNode, onClick: () => void, title: string) => <button type="button" className="ds-control ds-ribbon-button ds-ribbon-toggle-button ds-ribbon-button--large" aria-label={label} aria-pressed={pressed} data-ribbon-size="large" data-testid={testId} title={title} onClick={onClick}><DsIconBox>{icon}</DsIconBox><span className="ds-ribbon-label">{label}</span></button>;
  return <>
    {tool("ribbon-select-tool", "Select", !active, <SelectToolIcon />, () => setActive(false), "Select — click, drag and edit objects as usual")}
    {tool("ribbon-waveform-pencil", "Waveform Pencil", active, <WaveformPencilIcon />, () => setActive(!active), WAVEFORM_PENCIL_TITLE)}
  </>;
}
