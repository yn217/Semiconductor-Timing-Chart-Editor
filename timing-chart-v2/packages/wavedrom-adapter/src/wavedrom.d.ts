declare module "wavedrom" {
  interface WaveDromModule {
    readonly version: string;
    readonly waveSkin: Record<string, unknown>;
    renderAny(index: number, source: unknown, skin: Record<string, unknown>, notFirstSignal?: boolean): unknown;
    readonly onml: { stringify(tree: unknown): string };
  }
  const wavedrom: WaveDromModule;
  export default wavedrom;
}
