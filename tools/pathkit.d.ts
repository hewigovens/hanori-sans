declare module 'pathkit-wasm/bin/pathkit.js' {
  interface Path {
    simplify(): Path | null;
    toCmds(): number[][];
    delete(): void;
  }
  export default function init(options: { wasmBinary: Uint8Array }): Promise<{ FromSVGString(svg: string): Path | null }>;
}
