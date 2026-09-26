import { useRef, useState } from "react";
import { partitionRibbonItems, resolveRibbonPresentation, type RibbonGroupSpec, type RibbonItemSpec, type RibbonPresentationSize } from "./ribbon-schema.js";
import { DsRibbonButton, DsRibbonGroup, DsRibbonSplitButton, DsRibbonToggle } from "./design-system.js";
import { RibbonIcon } from "./ribbon-icon.js";
import { peerMenuSurfaceCoordinator } from "./runtime/peer-menu-surface.js";

/** Renders one ribbon-schema group as a major-group + Ds* group, the same
 * shape every already-migrated tab (Insert/View) uses. Every button in the
 * group goes through the single `DsRibbonButton` primitive -- there is no
 * second, hand-written button path left to drift out of sync with it. */
export function RibbonGroup({ spec, available = "large" }: { readonly spec: RibbonGroupSpec; readonly available?: RibbonPresentationSize }) {
  const partition = partitionRibbonItems(spec.items, available);
  return <div className="ribbon-major-group ribbon-schema-group" data-major-group={spec.majorGroup} data-ribbon-home aria-label={`${spec.majorGroup} commands`}>
    <DsRibbonGroup ariaLabel={spec.majorGroup} className={`home-${spec.id}-group ${spec.id}-group`} label={spec.caption} externalCaption>
      {partition.visible.map((item) => <RibbonSchemaItem key={item.id} item={item} available={available} />)}
      {partition.overflow.length > 0 && <RibbonSchemaOverflow items={partition.overflow} />}
    </DsRibbonGroup>
    <span className="ribbon-schema-group__caption">{spec.caption}</span>
  </div>;
}

function RibbonSchemaOverflow({ items }: { readonly items: readonly RibbonItemSpec[] }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const ownerRef = useRef<object>({});
  const [open, setOpen] = useState(false);
  const updateOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      const owner = ownerRef.current;
      peerMenuSurfaceCoordinator.activate(owner, () => {
        if (detailsRef.current) detailsRef.current.open = false;
        setOpen(false);
      });
    } else {
      peerMenuSurfaceCoordinator.release(ownerRef.current);
    }
  };
  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const controls = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not(:disabled)")];
    if (controls.length === 0) return;
    const current = controls.indexOf(event.target instanceof HTMLElement ? event.target.closest<HTMLButtonElement>("[role='menuitem']")! : controls[0]!);
    const next = event.key === "ArrowDown" ? (current + 1) % controls.length : event.key === "ArrowUp" ? (current - 1 + controls.length) % controls.length : event.key === "Home" ? 0 : event.key === "End" ? controls.length - 1 : undefined;
    if (next === undefined) return;
    event.preventDefault();
    controls[next]?.focus();
  };
  return <details ref={detailsRef} className="ribbon-schema-overflow" onToggle={(event) => updateOpen(event.currentTarget.open)}><summary aria-label="More ribbon commands">More</summary><div role="menu" aria-label="More ribbon commands" onKeyDown={onMenuKeyDown} onClick={(event) => { if (event.target instanceof HTMLElement && event.target.closest("button")) updateOpen(false); }}>{items.map((item) => item.kind === "custom" ? item.render() : <button key={item.id} type="button" role="menuitem" data-ribbon-command-id={item.id} disabled={item.kind !== "toggle" && item.disabled} onClick={item.kind === "toggle" ? item.onChange : item.onClick}>{item.label}</button>)}</div></details>;
}

function RibbonSchemaItem({ item, available }: { readonly item: RibbonItemSpec; readonly available: RibbonPresentationSize }) {
  if (item.kind === "custom") return item.render();
  const resolved = item.presentation === undefined ? "large" : resolveRibbonPresentation(item.presentation, available);
  // The Home overflow surface is composed separately from this primitive;
  // keep a command reachable here until that surface consumes the same item
  // result rather than silently dropping an overflow candidate.
  const size = resolved === "overflow" ? "icon" : resolved;
  if (item.kind === "toggle") return <DsRibbonToggle checked={item.checked} dataTestId={item.testId} label={item.label} onChange={item.onChange} {...(item.presentation?.priority === undefined ? {} : { priority: item.presentation.priority, style: { order: item.presentation.priority } })} size={size} />;
  if (item.kind === "split") return <DsRibbonSplitButton ariaLabel={item.ariaLabel ?? item.label} dataTestId={item.testId} disabled={item.disabled} icon={<RibbonIcon name={item.icon} />} menuAriaLabel={item.menuAriaLabel} onClick={item.onClick} onMenuClick={item.onMenuClick} {...(item.presentation?.priority === undefined ? {} : { priority: item.presentation.priority, style: { order: item.presentation.priority } })} size={size} title={item.title}>{item.label}</DsRibbonSplitButton>;
  const presentationClass = item.presentation ? ` ribbon-presentation-${size}` : "";
  return <DsRibbonButton ariaLabel={item.ariaLabel ?? item.label} className={`${item.size === "wide" ? "ds-ribbon-button--wide" : ""}${presentationClass}`} dataTestId={item.testId} disabled={item.disabled} icon={<RibbonIcon name={item.icon} />} onClick={item.onClick} {...(item.presentation?.priority === undefined ? {} : { priority: item.presentation.priority, style: { order: item.presentation.priority } })} size={size} title={item.title} v1Label={item.v1Label}>{item.label}</DsRibbonButton>;
}
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
