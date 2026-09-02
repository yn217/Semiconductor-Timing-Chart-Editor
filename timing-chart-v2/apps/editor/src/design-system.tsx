import type { ChangeEvent, ReactNode } from "react";

type ClassName = string | undefined;

export function DsIconBox({ children }: { readonly children: ReactNode }) {
  return <span className="ds-icon-box" aria-hidden="true">{children}</span>;
}

export function DsRibbonButton({ ariaLabel, children, className, dataTestId, disabled, icon, onClick, title, v1Label }: { readonly ariaLabel?: string | undefined; readonly children: ReactNode; readonly className?: ClassName; readonly dataTestId?: string | undefined; readonly disabled?: boolean | undefined; readonly icon: ReactNode; readonly onClick: () => void; readonly title?: string | undefined; readonly v1Label?: string | undefined }) {
  return <button type="button" className={`ds-ribbon-button${className ? ` ${className}` : ""}`} aria-label={ariaLabel} data-testid={dataTestId} disabled={disabled} title={title} onClick={onClick}><DsIconBox>{icon}</DsIconBox><span className="ds-ribbon-label" data-v1-label={v1Label}>{children}</span></button>;
}

export function DsRibbonToggleButton({ ariaLabel, checked, children, className, dataTestId, icon, onClick }: { readonly ariaLabel?: string; readonly checked: boolean; readonly children: ReactNode; readonly className?: ClassName; readonly dataTestId?: string; readonly icon: ReactNode; readonly onClick: () => void }) {
  return <button type="button" className={`ds-ribbon-button ds-ribbon-toggle-button${className ? ` ${className}` : ""}`} aria-label={ariaLabel} aria-pressed={checked} data-testid={dataTestId} onClick={onClick}><DsIconBox>{icon}</DsIconBox><span className="ds-ribbon-label">{children}</span></button>;
}

export function DsRibbonSelect({ ariaLabel, children, className, onChange, value }: { readonly ariaLabel: string; readonly children: ReactNode; readonly className?: ClassName; readonly onChange: (event: ChangeEvent<HTMLSelectElement>) => void; readonly value: string }) {
  return <select className={`ds-ribbon-select${className ? ` ${className}` : ""}`} aria-label={ariaLabel} value={value} onChange={onChange}>{children}</select>;
}

export function DsRibbonToggle({ checked, className, dataTestId, label, onChange }: { readonly checked: boolean; readonly className?: ClassName; readonly dataTestId?: string | undefined; readonly label: string; readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return <label className={`ds-ribbon-toggle${className ? ` ${className}` : ""}`}><input data-testid={dataTestId} type="checkbox" checked={checked} onChange={onChange} /><span>{label}</span></label>;
}

export function DsRibbonGroup({ ariaLabel, children, className, label }: { readonly ariaLabel: string; readonly children: ReactNode; readonly className?: ClassName; readonly label: string }) {
  return <div className={`ds-ribbon-group${className ? ` ${className}` : ""}`} aria-label={ariaLabel}>{children}<b>{label}</b></div>;
}
