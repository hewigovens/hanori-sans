import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFont, loadConfig } from 'furifont';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
process.env.SOURCE_DATE_EPOCH ??= '1792972800';
const config = await loadConfig(root);
let previousStep;
const result = await buildFont(config, {
  cwd: root,
  outDir: join(root, 'dist'),
  onProgress({ step }) {
    if (step !== previousStep) console.log(`Furigana: ${previousStep = step}`);
  },
});
const report = {
  version: config.version,
  compiler: 'furifont@0.6.2',
  config,
  stats: result.report.stats,
  files: result.files.map(({ name, bytes }) => ({ name, bytes })),
};
await writeFile(join(root, 'dist/furigana-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.stats));
