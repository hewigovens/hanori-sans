import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFont, loadConfig } from 'furifont';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
process.env.SOURCE_DATE_EPOCH ??= '1792972800';
const defaults = await loadConfig(root);
const families = JSON.parse(await readFile(join(root, 'families.json'), 'utf8'));
for (const family of families) {
  const stem = family.name.replaceAll(' ', '');
  const config = { ...defaults, base: `build/${stem}Base-Regular.otf`, family: `${family.name} Furigana` };
  let previousStep;
  const result = await buildFont(config, {
    cwd: root,
    outDir: join(root, 'dist'),
    onProgress({ step }) {
      if (step !== previousStep) console.log(`${family.name} Furigana: ${previousStep = step}`);
    },
  });
  const report = {
    version: config.version,
    compiler: 'furifont@0.6.2',
    config,
    stats: result.report.stats,
    files: result.files.map(({ name, bytes }) => ({ name, bytes })),
  };
  const prefix = family.id === 'sans' ? '' : `${family.id}-`;
  await writeFile(join(root, `dist/${prefix}furigana-report.json`), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report.stats));

}
