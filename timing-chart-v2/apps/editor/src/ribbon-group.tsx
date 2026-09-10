import { resolveRibbonPresentation, type RibbonGroupSpec, type RibbonItemSpec, type RibbonPresentationSize } from "./ribbon-schema.js";
import { DsRibbonButton, DsRibbonGroup, DsRibbonSplitButton, DsRibbonToggle } from "./design-system.js";
import { RibbonIcon } from "./ribbon-icon.js";

/** Renders one ribbon-schema group as a major-group + Ds* group, the same
 * shape every already-migrated tab (Insert/View) uses. Every button in the
 * group goes through the single `DsRibbonButton` primitive -- there is no
 * second, hand-written button path left to drift out of sync with it. */
export function RibbonGroup({ spec, available = "large" }: { readonly spec: RibbonGroupSpec; readonly available?: RibbonPresentationSize }) {
  return <div className="ribbon-major-group ribbon-schema-group" data-major-group={spec.majorGroup} data-ribbon-home aria-label={`${spec.majorGroup} commands`}>
    <DsRibbonGroup ariaLabel={spec.majorGroup} className={`home-${spec.id}-group ${spec.id}-group`} label={spec.caption} externalCaption>
      {spec.items.map((item) => <RibbonSchemaItem key={item.id} item={item} available={available} />)}
    </DsRibbonGroup>
    <span className="ribbon-schema-group__caption">{spec.caption}</span>
  </div>;
}

function RibbonSchemaItem({ item, available }: { readonly item: RibbonItemSpec; readonly available: RibbonPresentationSize }) {
  if (item.kind === "custom") return item.render();
  const resolved = item.presentation === undefined ? "large" : resolveRibbonPresentation(item.presentation, available);
  // The Home overflow surface is composed separately from this primitive;
  // keep a command reachable here until that surface consumes the same item
  // result rather than silently dropping an overflow candidate.
  const size = resolved === "overflow" ? "icon" : resolved;
  if (item.kind === "toggle") return <DsRibbonToggle checked={item.checked} dataTestId={item.testId} label={item.label} onChange={item.onChange} size={size} />;
  if (item.kind === "split") return <DsRibbonSplitButton ariaLabel={item.ariaLabel ?? item.label} dataTestId={item.testId} disabled={item.disabled} icon={<RibbonIcon name={item.icon} />} menuAriaLabel={item.menuAriaLabel} onClick={item.onClick} onMenuClick={item.onMenuClick} size={size} title={item.title}>{item.label}</DsRibbonSplitButton>;
  const presentationClass = item.presentation ? ` ribbon-presentation-${size}` : "";
  return <DsRibbonButton ariaLabel={item.ariaLabel ?? item.label} className={`${item.size === "wide" ? "ds-ribbon-button--wide" : ""}${presentationClass}`} dataTestId={item.testId} disabled={item.disabled} icon={<RibbonIcon name={item.icon} />} onClick={item.onClick} {...(item.presentation?.priority === undefined ? {} : { priority: item.presentation.priority })} size={size} title={item.title} v1Label={item.v1Label}>{item.label}</DsRibbonButton>;
}
