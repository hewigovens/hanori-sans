import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import PathKitInit from 'pathkit-wasm/bin/pathkit.js';
import { Ot } from 'ot-builder';

const pathKit = await PathKitInit({ wasmBinary: await readFile(new URL(import.meta.resolve('pathkit-wasm/bin/pathkit.wasm'))) });

/** Union variable TrueType contours before converting them to CFF cubics. */
export async function unionOutline(svg: string, scale: number): Promise<Ot.Glyph.Geometry | null> {
  if (!svg) return null;
  const path = pathKit.FromSVGString(svg);
  assert(path, 'Invalid donor glyph path');
  try {
    assert(path.simplify(), 'Could not remove donor outline overlaps');
    const contours: Ot.Glyph.Contour[] = [];
    let contour: Ot.Glyph.Contour = [];
    let x = 0, y = 0;
    const point = (px: number, py: number, kind = Ot.Glyph.PointType.Corner) => Ot.Glyph.Point.create(Math.round(px * scale), Math.round(py * scale), kind);
    for (const [verb, ...v] of path.toCmds()) {
      switch (verb) {
        case 0: contour = [point(v[0], v[1])]; contours.push(contour); break;
        case 1: contour.push(point(v[0], v[1])); break;
        case 2:
          contour.push(point(x + (v[0] - x) * 2 / 3, y + (v[1] - y) * 2 / 3, Ot.Glyph.PointType.Lead),
            point(v[2] + (v[0] - v[2]) * 2 / 3, v[3] + (v[1] - v[3]) * 2 / 3, Ot.Glyph.PointType.Follow), point(v[2], v[3]));
          break;
        case 4:
          contour.push(point(v[0], v[1], Ot.Glyph.PointType.Lead), point(v[2], v[3], Ot.Glyph.PointType.Follow), point(v[4], v[5]));
          break;
        case 5: continue;
        default: throw new Error(`Unsupported PathOps verb ${verb}`);
      }
      x = v.at(-2)!; y = v.at(-1)!;
    }
    return new Ot.Glyph.ContourSet(contours);
  } finally { path.delete(); }
}
