const iconSprite = new URL("../../../../timing-chart-v1/gui-mockup/icons.svg", import.meta.url).href;

export function RibbonIcon({ name }: { readonly name: string }) {
  return <svg aria-hidden="true"><use href={`${iconSprite}#${name}`} /></svg>;
}
