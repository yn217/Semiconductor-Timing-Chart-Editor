import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { DsIconBox } from "./design-system.js";

/** View-only draw-tool state shared by the Ribbon, the Bottom Panel and the Timeline interaction owner. Never Canonical/History/Dirty. */
export interface WaveformPencilMode {
  readonly get: () => boolean;
  readonly set: (active: boolean) => void;
  readonly getAvailable: () => boolean;
  readonly setAvailable: (available: boolean) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

export function createWaveformPencilMode(): WaveformPencilMode {
  let active = false;
  let available = true;
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of [...listeners]) listener(); };
  return {
    get: () => active,
    set: (next) => { const value = available && next; if (value === active) return; active = value; notify(); },
    getAvailable: () => available,
    setAvailable: (next) => { if (next === available) return; available = next; if (!available) active = false; notify(); },
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

export const WaveformPencilContext = createContext<WaveformPencilMode>(createWaveformPencilMode());

export function useWaveformPencilMode(): readonly [active: boolean, setActive: (active: boolean) => void, available: boolean] {
  const mode = useContext(WaveformPencilContext);
  const active = useSyncExternalStore(mode.subscribe, mode.get, mode.get);
  const available = useSyncExternalStore(mode.subscribe, mode.getAvailable, mode.getAvailable);
  return [active, mode.set, available];
}

export const WAVEFORM_PENCIL_TITLE = "Waveform Pencil — Draw HIGH/LOW directly on a Signal by dragging";

/** The single Bottom Panel toggle; it shares the mode consumed by Ribbon and waveform interactions. */
export function BottomWaveformPencilButton() {
  const [active, setActive, available] = useWaveformPencilMode();
  return <button type="button" className="waveform-pencil-bottom" data-testid="bottom-waveform-pencil" aria-label="Waveform Pencil" aria-pressed={active} aria-describedby="waveform-pencil-bottom-tooltip" disabled={!available} onClick={() => setActive(!active)}>
    <span aria-hidden="true">✎</span>
    <span id="waveform-pencil-bottom-tooltip" className="waveform-pencil-tooltip" role="tooltip">{WAVEFORM_PENCIL_TITLE}</span>
  </button>;
}

export function WaveformPencilIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2 14l.8-3.2 7.9-7.9a1.1 1.1 0 011.6 0l.9.9a1.1 1.1 0 010 1.6l-7.9 7.9L2 14z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><path d="M9.6 4.1l2.3 2.3" stroke="currentColor" strokeWidth="1.2" /></svg>;
}

export function SelectToolIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 2l9 5.2-4 1.1 2.4 4.2-1.6.9-2.4-4.2L3 12.5z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>;
}

/** Home Ribbon draw tools: Select (default) and the Waveform Pencil toggle share the one mode with the Bottom Panel button. */
export function WaveformPencilRibbonTools() {
  const [active, setActive, available] = useWaveformPencilMode();
  const tool = (testId: string, label: string, pressed: boolean, icon: ReactNode, onClick: () => void, title: string) => <button type="button" className="ds-control ds-ribbon-button ds-ribbon-toggle-button ds-ribbon-button--large" aria-label={label} aria-pressed={pressed} data-ribbon-size="large" data-testid={testId} title={title} disabled={!available && testId === "ribbon-waveform-pencil"} onClick={onClick}><DsIconBox>{icon}</DsIconBox><span className="ds-ribbon-label">{label}</span></button>;
  return <>
    {tool("ribbon-select-tool", "Select", !active, <SelectToolIcon />, () => setActive(false), "Select — click, drag and edit objects as usual")}
    {tool("ribbon-waveform-pencil", "Waveform Pencil", active, <WaveformPencilIcon />, () => setActive(!active), WAVEFORM_PENCIL_TITLE)}
  </>;
}
