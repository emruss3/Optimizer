-- =====================================================
-- PLANNER FUNCTIONS TEST SCRIPT
-- =====================================================
-- Run this after creating the planner schema to test functionality

-- Test 1: Check if views exist and have data
select 'Testing planner_parcels view...' as test;
select count(*) as parcel_count from planner_parcels;

select 'Testing planner_zoning view...' as test;
select count(*) as zoning_count from planner_zoning;

select 'Testing planner_join view...' as test;
select count(*) as join_count from planner_join;

-- Test 2: Test get_buildable_envelope function
select 'Testing get_buildable_envelope function...' as test;
select 
  parcel_id,
  ST_Area(public.get_buildable_envelope(parcel_id)) as envelope_area_m2
from planner_parcels 
limit 3;

-- Test 3: Test score_pad function
select 'Testing score_pad function...' as test;
select 
  parcel_id,
  public.score_pad(
    parcel_id, 
    public.get_buildable_envelope(parcel_id), 
    null
  ) as score_result
from planner_parcels 
limit 3;

-- Test 4: Test get_parcel_detail function
select 'Testing get_parcel_detail function...' as test;
select * from public.get_parcel_detail(
  (select parcel_id from planner_parcels limit 1)
);

-- Test 5: Check for specific parcel ID (if it exists)
select 'Testing with parcel ID 47037...' as test;
select 
  case 
    when exists(select 1 from planner_parcels where parcel_id = '47037') 
    then 'Parcel 47037 found - testing functions...'
    else 'Parcel 47037 not found - using first available parcel'
  end as status;

-- If parcel 47037 exists, test with it
do $$
declare
  test_parcel_id text;
begin
  if exists(select 1 from planner_parcels where parcel_id = '47037') then
    test_parcel_id := '47037';
  else
    select parcel_id into test_parcel_id from planner_parcels limit 1;
  end if;
  
  raise notice 'Testing with parcel ID: %', test_parcel_id;
  
  -- Test envelope
  perform public.get_buildable_envelope(test_parcel_id);
  raise notice 'get_buildable_envelope: OK';
  
  -- Test scoring
  perform public.score_pad(test_parcel_id, public.get_buildable_envelope(test_parcel_id), null);
  raise notice 'score_pad: OK';
  
  -- Test detail function
  perform * from public.get_parcel_detail(test_parcel_id);
  raise notice 'get_parcel_detail: OK';
  
  raise notice 'All tests passed for parcel: %', test_parcel_id;
end $$;

select 'Planner functions test completed!' as status;
