# Visual QA battery (night WO 2026-07-20, client item 3)

Screenshots 4 reference parcels (2600 W Heiman 553450 · 2622 W Heiman
667574 · 1200 W H Davis 669046 · 1710 Meharry 488278) in 2D + 3D by
driving the real app headlessly (Playwright + the repo's Chromium).

## Why a mock Supabase endpoint

The CI/agent sandbox blocks egress to supabase.co, so `mock-supabase.mjs`
serves REAL responses pre-fetched from the live database (compile,
generate, max-buildout, massing program, frontage, neighbors, money,
candidates — keyed `rpc:<fn>:<ogc_fid>:<use>`). The pixels therefore show
genuine solver output rendered by the genuine client; only the transport
is synthetic. Unknown RPCs 404 and log to `mock_misses.log` (recorder
mode); table reads return `[]`.

## Run

1. Build `mock_store.json` (see key format above) from live responses.
2. `.env.local`: `VITE_SUPABASE_URL=http://localhost:54321`, any anon key.
3. `node scripts/visual-battery/mock-supabase.mjs &`
4. `npx vite --port 5199 &`
5. `CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/visual-battery/battery.mjs`

Outputs land in the scratchpad `shots/` directory with per-parcel console
error logs. `ONE_PARCEL=1` runs just the first parcel (iteration mode).
