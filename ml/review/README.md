# Developer-quality review set (26 Nov 2026)

40 Nashville parcels (8 owner-flagged, 32 vacant parcels sampled across apartment, townhome and subdivision zoning)
and the checks a developer would apply to the app's plan. This is the yardstick for engine changes.

Re-run: for each job in jobs.json run the SQL (Supabase MCP), save with `save.py <i> <result file>` into raw/,
then `python3 score.py` (writes scores.json) and `python3 draw.py` (img/). Thresholds and their reasons are in THR in score.py.
Paths in the scripts point at /home/claude/review; adjust when running elsewhere.
Baseline: 3 of 40 parcels' default plans pass every check; 2.5 failed checks per parcel.
