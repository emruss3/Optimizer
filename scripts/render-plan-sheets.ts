// Draws plan elements as the app's own A-01 site plan sheets, outside the browser.
// Usage: npx tsx scripts/render-plan-sheets.ts <sheets.json> <out dir>
// sheets.json: [{ sid, kind, title: SheetTitle, input: SceneInput }]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildDrawingScene } from '../src/features/site-plan/scene/buildScene';
import { renderSitePlanSheet } from '../src/features/site-plan/scene/sheetSvg';

const [inFile, outDir] = process.argv.slice(2);
if (!inFile || !outDir) throw new Error('usage: render-plan-sheets.ts <sheets.json> <out dir>');
const sheets = JSON.parse(readFileSync(inFile, 'utf8'));
mkdirSync(outDir, { recursive: true });
let n = 0;
for (const s of sheets) {
  const scene = buildDrawingScene(s.input);
  if (!scene) { console.log('no scene', s.sid, s.kind); continue; }
  writeFileSync(`${outDir}/${s.sid}_${s.kind}.svg`, renderSitePlanSheet(scene, s.title, 'tabloid', null).svg);
  n++;
}
console.log('sheets', n);
