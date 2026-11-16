import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildDrawingScene } from '../../../src/features/site-plan/scene/buildScene';
import { renderSitePlanSheet } from '../../../src/features/site-plan/scene/sheetSvg';
const [inFile, outDir] = process.argv.slice(2);
const sheets = JSON.parse(readFileSync(inFile!, 'utf8'));
mkdirSync(outDir!, { recursive: true });
for (const s of sheets) {
  const scene = buildDrawingScene(s.input);
  if (!scene) { console.log('no scene', s.sid, s.kind); continue; }
  const sheet = renderSitePlanSheet(scene, s.title, 'tabloid', null);
  writeFileSync(`${outDir}/${s.sid}_${s.kind}.svg`, sheet.svg);
  console.log(s.sid, s.kind, sheet.widthPt, sheet.heightPt, sheet.svg.length);
}
