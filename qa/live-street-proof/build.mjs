// Local library artifact. Build only the proof, not the app or its credentials.
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const proof = dirname(fileURLToPath(import.meta.url));
const repo = resolve(proof, '../..');
const output = process.argv[2];
if (!output) throw new Error('Usage: node qa/live-street-proof/build.mjs /path/to/new-preview-folder');
const outDir = resolve(output);

// Preview has no account, server or API. These values never leave the test scene.
process.env.VITE_SUPABASE_URL = 'https://preview.invalid';
process.env.VITE_SUPABASE_ANON_KEY = 'offline-fixture';
await build({
  root: proof,
  configFile: resolve(repo, 'vite.config.ts'),
  envFile: false,
  envDir: proof,
  publicDir: false,
  build: { outDir, emptyOutDir: false },
});
await mkdir(resolve(outDir, 'textures'), { recursive: true });
await mkdir(resolve(outDir, 'models'), { recursive: true });
await cp(resolve(repo, 'public/textures/site'), resolve(outDir, 'textures/site'), { recursive: true });
await cp(resolve(repo, 'public/models/site'), resolve(outDir, 'models/site'), { recursive: true });
await writeFile(resolve(outDir, 'OPEN_ME.txt'), `Unzip and open a terminal in this folder.
Run: python -m http.server 8080 --bind 127.0.0.1
On Windows, use py instead of python if needed.
Visit: http://127.0.0.1:8080/
Choose a catalog home, use Street / Front entry / Garage / Focus, and drag to orbit.
The fixture uses controlled lots and the app's 3D component. It is not an as-built survey.
No account, GPU server or rendering service is required. AI impressions are not available in this local preview.
`);
