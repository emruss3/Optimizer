-- =====================================================
-- PLANNER MIGRATION SCRIPT
-- =====================================================
-- Run this script in Supabase Studio SQL Editor or via CLI
-- This creates all planner views, functions, and indexes

-- Step 1: Create planner_parcels view
\echo 'Creating planner_parcels view...'
\i planner_parcels.sql

-- Step 2: Create planner_zoning view (with dynamic FAR detection)
\echo 'Creating planner_zoning view...'
\i planner_zoning.sql

-- Step 3: Create planner_join view
\echo 'Creating planner_join view...'
\i planner_join.sql

-- Step 4: Create get_buildable_envelope function
\echo 'Creating get_buildable_envelope function...'
\i get_buildable_envelope.sql

-- Step 5: Create score_pad function
\echo 'Creating score_pad function...'
\i score_pad.sql

-- Step 6: Create get_parcel_detail function
\echo 'Creating get_parcel_detail function...'
\i get_parcel_detail.sql

-- Step 7: Create indexes
\echo 'Creating spatial indexes...'
\i planner_indexes.sql

\echo 'Planner migration completed successfully!'
