import type { ChangeEvent, ReactNode } from "react";

type ClassName = string | undefined;
export type RibbonSizeClass = "large" | "medium" | "small" | "icon";

export function DsIconBox({ children }: { readonly children: ReactNode }) {
  return <span className="ds-icon-box" aria-hidden="true">{children}</span>;
}

export function DsRibbonButton({ ariaLabel, children, className, dataTestId, disabled, icon, onClick, size = "large", title, v1Label }: { readonly ariaLabel?: string | undefined; readonly children: ReactNode; readonly className?: ClassName; readonly dataTestId?: string | undefined; readonly disabled?: boolean | undefined; readonly icon: ReactNode; readonly onClick: () => void; readonly size?: RibbonSizeClass; readonly title?: string | undefined; readonly v1Label?: string | undefined }) {
  return <button type="button" className={`ds-control ds-ribbon-button ds-ribbon-button--${size}${className ? ` ${className}` : ""}`} aria-label={ariaLabel} data-ribbon-size={size} data-testid={dataTestId} disabled={disabled} title={title} onClick={onClick}><DsIconBox>{icon}</DsIconBox><span className="ds-ribbon-label" data-v1-label={v1Label}>{children}</span></button>;
}

/** Shared CAD/EDA split-button primitive: the primary action and menu action
 * retain separate accessible names while sharing one size-class container. */
export function DsRibbonSplitButton({ ariaLabel, children, className, dataTestId, disabled, icon, menuAriaLabel, onClick, onMenuClick, size = "large", title }: { readonly ariaLabel: string; readonly children: ReactNode; readonly className?: ClassName; readonly dataTestId?: string | undefined; readonly disabled?: boolean | undefined; readonly icon: ReactNode; readonly menuAriaLabel: string; readonly onClick: () => void; readonly onMenuClick: () => void; readonly size?: RibbonSizeClass; readonly title?: string | undefined }) {
  return <span className={`ds-control ds-ribbon-split-button ds-ribbon-split-button--${size}${className ? ` ${className}` : ""}`} data-ribbon-size={size} data-testid={dataTestId} title={title}>
    <button type="button" className="ds-ribbon-button ds-ribbon-split-button__primary" aria-label={ariaLabel} disabled={disabled} onClick={onClick}><DsIconBox>{icon}</DsIconBox><span className="ds-ribbon-label">{children}</span></button>
    <button type="button" className="ds-ribbon-split-button__menu" aria-label={menuAriaLabel} aria-haspopup="menu" disabled={disabled} onClick={onMenuClick}>▾</button>
  </span>;
}

export function DsRibbonToggleButton({ ariaLabel, checked, children, className, dataTestId, icon, onClick, size = "large", title }: { readonly ariaLabel?: string; readonly checked: boolean; readonly children: ReactNode; readonly className?: ClassName; readonly dataTestId?: string; readonly icon: ReactNode; readonly onClick: () => void; readonly size?: RibbonSizeClass; readonly title?: string | undefined }) {
  return <button type="button" className={`ds-control ds-ribbon-button ds-ribbon-toggle-button ds-ribbon-button--${size}${className ? ` ${className}` : ""}`} aria-label={ariaLabel} aria-pressed={checked} data-ribbon-size={size} data-testid={dataTestId} title={title} onClick={onClick}><DsIconBox>{icon}</DsIconBox><span className="ds-ribbon-label">{children}</span></button>;
}

export function DsRibbonSelect({ ariaLabel, children, className, dataTestId, onChange, size = "medium", value }: { readonly ariaLabel: string; readonly children: ReactNode; readonly className?: ClassName; readonly dataTestId?: string | undefined; readonly onChange: (event: ChangeEvent<HTMLSelectElement>) => void; readonly size?: RibbonSizeClass; readonly value: string }) {
  return <select className={`ds-control ds-ribbon-select ds-ribbon-select--${size}${className ? ` ${className}` : ""}`} aria-label={ariaLabel} data-ribbon-size={size} data-testid={dataTestId} value={value} onChange={onChange}>{children}</select>;
}

export function DsRibbonToggle({ checked, className, dataTestId, label, onChange, size = "medium" }: { readonly checked: boolean; readonly className?: ClassName; readonly dataTestId?: string | undefined; readonly label: string; readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void; readonly size?: RibbonSizeClass }) {
  return <label className={`ds-control ds-ribbon-toggle ds-ribbon-toggle--${size}${className ? ` ${className}` : ""}`} data-ribbon-size={size}><input data-testid={dataTestId} type="checkbox" checked={checked} onChange={onChange} /><span>{label}</span></label>;
}

/** `density` lets a Tab request a compact-grid child layout (smaller
 * buttons/number-inputs, tighter label text) WITHOUT the Tab's own CSS
 * reaching into DsRibbonButton/DsRibbonNumberInput's internal geometry --
 * the Group primitive owns translating `data-density` into its
 * children's actual sizing (see ribbon.css's
 * `.ds-ribbon-group[data-density="compact-grid"] .ds-ribbon-button` rule),
 * matching this design system's "primitive owns internal geometry, Tab
 * owns composition only" contract (#293). */
export function DsRibbonGroup({ ariaLabel, children, className, density, label, externalCaption = false }: { readonly ariaLabel: string; readonly children: ReactNode; readonly className?: ClassName; readonly density?: "compact-grid" | "compact-toggle" | undefined; readonly label: string; readonly externalCaption?: boolean }) {
  return <div className={`ds-ribbon-group${className ? ` ${className}` : ""}`} aria-label={ariaLabel} data-density={density}>{children}{!externalCaption && <b>{label}</b>}</div>;
}

/** Compact captioned numeric field for a ribbon group -- the field-input
 * counterpart to DsRibbonButton, styled off the same shared ds-control
 * contract (height/border/focus) instead of a plain web form input. Also
 * accepts a read-only `output` rendering (value display with no input)
 * for fields that mirror another field's value rather than accepting
 * their own edits. */
export function DsRibbonNumberInput({ ariaLabel, className, dataTestId, disabled, label, max, min, onChange, readOnly, step, title, value }: { readonly ariaLabel: string; readonly className?: ClassName; readonly dataTestId?: string | undefined; readonly disabled?: boolean | undefined; readonly label: string; readonly max?: number | undefined; readonly min?: number | undefined; readonly onChange?: ((value: number) => void) | undefined; readonly readOnly?: boolean | undefined; readonly step?: number | undefined; readonly title?: string | undefined; readonly value: number }) {
  return <label className={`ds-control ds-ribbon-number-input${className ? ` ${className}` : ""}`} title={title}>
    <span className="ds-ribbon-number-input__caption">{label}</span>
    {readOnly
      ? <output aria-label={ariaLabel} data-testid={dataTestId}>{value}</output>
      : <input aria-label={ariaLabel} data-testid={dataTestId} type="number" min={min} max={max} step={step ?? 1} value={value} disabled={disabled} onChange={(event) => onChange?.(Number(event.target.value))} />}
  </label>;
}
