import type { RibbonGroupSpec, RibbonItemSpec } from "./ribbon-schema.js";
import { DsRibbonButton, DsRibbonGroup, DsRibbonToggle } from "./design-system.js";
import { RibbonIcon } from "./ribbon-icon.js";

/** Renders one ribbon-schema group as a major-group + Ds* group, the same
 * shape every already-migrated tab (Insert/View) uses. Every button in the
 * group goes through the single `DsRibbonButton` primitive -- there is no
 * second, hand-written button path left to drift out of sync with it. */
export function RibbonGroup({ spec }: { readonly spec: RibbonGroupSpec }) {
  return <div className="ribbon-major-group ribbon-schema-group" data-major-group={spec.majorGroup} data-ribbon-home aria-label={`${spec.majorGroup} commands`}>
    <DsRibbonGroup ariaLabel={spec.majorGroup} className={`home-${spec.id}-group ${spec.id}-group`} label={spec.caption} externalCaption>
      {spec.items.map((item) => <RibbonSchemaItem key={item.id} item={item} />)}
    </DsRibbonGroup>
    <span className="ribbon-schema-group__caption">{spec.caption}</span>
  </div>;
}

function RibbonSchemaItem({ item }: { readonly item: RibbonItemSpec }) {
  if (item.kind === "custom") return item.render();
  if (item.kind === "toggle") return <DsRibbonToggle checked={item.checked} dataTestId={item.testId} label={item.label} onChange={item.onChange} {...(item.presentation === undefined ? {} : { size: item.presentation.preferredSize })} />;
  const presentationClass = item.presentation ? ` ribbon-presentation-${item.presentation.preferredSize}` : "";
  return <DsRibbonButton ariaLabel={item.ariaLabel ?? item.label} className={`${item.size === "wide" ? "ds-ribbon-button--wide" : ""}${presentationClass}`} dataTestId={item.testId} disabled={item.disabled} icon={<RibbonIcon name={item.icon} />} onClick={item.onClick} {...(item.presentation === undefined ? {} : { size: item.presentation.preferredSize })} title={item.title} v1Label={item.v1Label}>{item.label}</DsRibbonButton>;
}
