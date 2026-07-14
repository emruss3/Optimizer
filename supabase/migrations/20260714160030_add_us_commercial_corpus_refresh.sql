create or replace function training.refresh_us_commercial_corpus()
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_spaces integer := 0;
  v_models integer := 0;
  v_templates integer := 0;
  v_manifest jsonb := '{}'::jsonb;
begin
  with src as (
    select sp.id,lower(coalesce(sp.space_subtype,'')) as nm,b.building_type
    from training.interior_spaces sp
    join training.building_interiors b on b.id=sp.interior_id
    join training.dataset_registry d on d.id=b.dataset_id
    where d.slug='openstudio_us_commercial_archetypes'
  ), typed as (
    select id,building_type,nm,
      case
        when nm ~ '(corridor|hallway|passage|circulation|(^|[_ -])hall($|[_ -]))' then 'corridor'
        when nm ~ '(lobby|reception|vestibule|waiting|front[_ -]?entry|frontlounge)' then 'lobby'
        when nm ~ 'stair' then 'stair'
        when nm ~ 'elev' then 'elevator'
        when nm ~ '(attic|plenum|crawl)' then 'service_void'
        when nm ~ '(toilet|restroom|bath|locker|shower|dressing)' then 'restroom'
        when nm ~ '(data[_ -]?center|server|ite)' then 'data_center'
        when nm ~ '(service[_ -]?shaft|mechanical|boiler|electrical|utility|hvac|plant|equipment|humid|med[_ -]?gas|(^|[_ -])it([_ -]?room)?($|[_ -])|basement)' then 'mechanical'
        when nm ~ '(loading|dock|receiv|sally[_ -]?port)' then 'loading'
        when nm ~ '(storage|stock|warehouse|back[_ -]?space|laundry|janitor|bio[_ -]?haz|soil|sub[_ -]?sterile|sterile|clean[_ -]?work|soil[_ -]?work|soil[_ -]?hold)' then 'storage'
        when nm ~ '(kitchen|food[_ -]?prep|deli|bakery|nourish)' then 'kitchen'
        when nm ~ '(dining|cafe|restaurant|banquet|cafeteria)' then 'dining'
        when building_type='healthcare' and nm ~ '(lab|patroom|patient|exam|operating|surgery|nurse|clinic|recovery|icu|ic[_ -]?pat|(^|[_ -])er[_ -]|trauma|triage|radiology|x[_ -]?ray|phys(ical)?[_ -]?therapy|treatment|mri|procedure|pacu|pre[_ -]?op|step[_ -]?down|anesthesia|scrub|(^|[_ -])or[0-9])' then 'clinical'
        when nm ~ '(class|studio|school|gym|auditorium|multipurpose|computer[_ -]?class)' then 'education'
        when nm ~ '(^|[_ -])lab($|[_ -])' then 'laboratory'
        when nm ~ '(guest|guestroom|guest[_ -]?room|room[_ -]?[0-9])' then 'guestroom'
        when nm ~ '(retail|sales|cashier|shop|(^|[_ -])(lg|sm)?store[0-9]*($|[_ -])|point[_ -]?of[_ -]?sale|produce|core[_ -]?retail)' then 'retail'
        when nm ~ 'holding' then 'secure_holding'
        when nm ~ 'jury[_ -]?(assembly|deliberation)' then 'assembly'
        when nm ~ 'security[_ -]?screen' then 'security'
        when nm ~ '(conference|meeting|openoffice|closedoffice|office|perimeter|clerk|court[_ -]?admin|judges?[_ -]?chamber|judiciary[_ -]?staff|(^|[_ -])work($|[_ -])|scheduling|dictation)' then 'office'
        when building_type='office' and nm ~ '(^|[_ -])core($|[_ -])' then 'office'
        when nm ~ '(apartment|residential|dwelling|bedroom|living|unit[_ -])' then 'residential'
        when nm ~ '(parking|garage)' then 'parking'
        when nm ~ '(maintenance|break[_ -]?room|employee[_ -]?lounge|(^|[_ -])lounge($|[_ -]))' then 'support'
        when nm ~ '(exercise|fitness|clubhouse|amenity)' then 'amenity'
        when nm ~ 'undeveloped' then 'shell'
        when nm ~ '(^|[_ -])core($|[_ -])' then 'core'
        when building_type='office' then 'office'
        when building_type='retail' then 'retail'
        when building_type='education' then 'education'
        when building_type='laboratory' then 'laboratory'
        when building_type='civic' then 'civic'
        else 'other'
      end as new_type
    from src
  ), classified as (
    select id,new_type,
      case new_type
        when 'corridor' then 'circulation'
        when 'lobby' then 'public'
        when 'stair' then 'core'
        when 'elevator' then 'core'
        when 'core' then 'core'
        when 'service_void' then 'service'
        when 'restroom' then 'service'
        when 'mechanical' then 'service'
        when 'loading' then 'service'
        when 'storage' then 'storage'
        when 'kitchen' then 'food_service'
        when 'dining' then 'food_service'
        when 'clinical' then 'healthcare'
        when 'education' then 'education'
        when 'laboratory' then 'research'
        when 'guestroom' then 'lodging'
        when 'retail' then 'sales'
        when 'office' then 'work'
        when 'residential' then 'residential'
        when 'data_center' then 'technical'
        when 'parking' then 'parking'
        when 'support' then 'staff_support'
        when 'amenity' then 'amenity'
        when 'shell' then 'shell'
        when 'secure_holding' then 'justice'
        when 'assembly' then 'justice'
        when 'security' then 'justice'
        when 'civic' then 'justice'
        else 'other'
      end as new_group
    from typed
  ), updated as (
    update training.interior_spaces sp
    set space_type=c.new_type,
        function_group=c.new_group,
        public_private=case
          when c.new_group in ('public','sales','food_service') then 'public'
          when c.new_group in ('lodging','residential') then 'private'
          when c.new_group in ('healthcare','research','technical','justice') or c.new_type='loading' then 'restricted'
          when c.new_group in ('service','core','storage') then 'service'
          else 'semi_public'
        end,
        attributes=coalesce(sp.attributes,'{}'::jsonb) || jsonb_build_object(
          'classification_version','us_commercial_space_taxonomy_v1_3',
          'raw_space_name',sp.space_subtype
        )
    from classified c
    where sp.id=c.id
    returning sp.id
  )
  select count(*) into v_spaces from updated;

  with sb as (
    select b.id as interior_id,sp.space_type,coalesce(sp.function_group,'other') as grp,
           coalesce(nullif(sp.attributes->>'effective_area_sqft','')::numeric,sp.area_sqft,0) as eff_area,
           greatest(coalesce(nullif(sp.attributes->>'multiplier','')::numeric,1),1) as multiplier
    from training.building_interiors b
    join training.dataset_registry d on d.id=b.dataset_id
    join training.interior_spaces sp on sp.interior_id=b.id
    where d.slug='openstudio_us_commercial_archetypes'
  ), gs as (
    select interior_id,grp,round(sum(eff_area),2) as area_sqft,
           round(sum(multiplier),2) as effective_spaces,count(*) as represented_spaces
    from sb group by interior_id,grp
  ), gj as (
    select interior_id,
           jsonb_object_agg(grp,area_sqft order by grp) as area_by_group,
           jsonb_object_agg(grp,effective_spaces order by grp) as effective_count_by_group,
           jsonb_object_agg(grp,represented_spaces order by grp) as represented_count_by_group,
           count(*) as group_count
    from gs group by interior_id
  ), totals as (
    select interior_id,
           round(sum(eff_area),2) as model_total_area,
           round(sum(eff_area) filter(where space_type not in ('service_void','shell')),2) as program_floor_area,
           round(sum(eff_area) filter(where space_type not in ('service_void','shell') and grp not in ('circulation','core','service','parking','shell')),2) as assignable_area,
           round(coalesce(sum(eff_area) filter(where space_type='service_void'),0),2) as service_void_area,
           round(coalesce(sum(eff_area) filter(where grp='circulation' and space_type not in ('service_void','shell')),0),2) as circulation_area,
           round(coalesce(sum(eff_area) filter(where grp='core' and space_type not in ('service_void','shell')),0),2) as core_area,
           round(coalesce(sum(eff_area) filter(where grp='service' and space_type not in ('service_void','shell')),0),2) as service_area,
           count(*) as represented_spaces,
           round(sum(multiplier),2) as effective_spaces,
           count(*) filter(where space_type='other') as unclassified_spaces,
           round(coalesce(sum(eff_area) filter(where space_type='other'),0),2) as unclassified_area,
           round(coalesce(sum(multiplier) filter(where space_type='corridor'),0),2) as corridor_spaces,
           round(coalesce(sum(multiplier) filter(where space_type='stair'),0),2) as stair_spaces,
           round(coalesce(sum(multiplier) filter(where space_type='elevator'),0),2) as elevator_spaces,
           round(coalesce(sum(multiplier) filter(where space_type='lobby'),0),2) as lobby_spaces,
           round(coalesce(sum(multiplier) filter(where grp='service' and space_type not in ('service_void','shell')),0),2) as service_spaces
    from sb group by interior_id
  ), updated as (
    update training.building_interiors b
    set net_usable_area_sqft=t.assignable_area,
        efficiency_pct=case when t.program_floor_area>0 then round(100*t.assignable_area/t.program_floor_area,2) else null end,
        program_metrics=coalesce(b.program_metrics,'{}'::jsonb) || jsonb_build_object(
          'classification_version','us_commercial_space_taxonomy_v1_3',
          'model_total_space_area_sqft',t.model_total_area,
          'program_floor_area_sqft',t.program_floor_area,
          'assignable_program_area_sqft',t.assignable_area,
          'program_efficiency_pct',case when t.program_floor_area>0 then round(100*t.assignable_area/t.program_floor_area,2) else null end,
          'service_void_area_sqft',t.service_void_area,
          'service_void_area_pct_of_model',case when t.model_total_area>0 then round(100*t.service_void_area/t.model_total_area,2) else null end,
          'represented_space_count',t.represented_spaces,
          'effective_space_count',t.effective_spaces,
          'function_group_area_sqft',gj.area_by_group,
          'function_group_effective_counts',gj.effective_count_by_group,
          'function_group_represented_counts',gj.represented_count_by_group,
          'function_group_count',gj.group_count,
          'unclassified_space_count',t.unclassified_spaces,
          'unclassified_area_pct',case when t.model_total_area>0 then round(100*t.unclassified_area/t.model_total_area,2) else null end,
          'program_area_definition','model space area excluding plenum/attic service-void zones and unprogrammed shell',
          'assignable_area_definition','program area excluding circulation, vertical/service core, service, parking, and shell'
        ),
        core_metrics=coalesce(b.core_metrics,'{}'::jsonb) || jsonb_build_object(
          'corridor_spaces',t.corridor_spaces,
          'stair_spaces',t.stair_spaces,
          'elevator_spaces',t.elevator_spaces,
          'lobby_spaces',t.lobby_spaces,
          'service_spaces',t.service_spaces,
          'circulation_area_sqft',t.circulation_area,
          'core_area_sqft',t.core_area,
          'service_area_sqft',t.service_area,
          'circulation_area_pct_of_program',case when t.program_floor_area>0 then round(100*t.circulation_area/t.program_floor_area,2) else null end,
          'core_area_pct_of_program',case when t.program_floor_area>0 then round(100*t.core_area/t.program_floor_area,2) else null end,
          'service_area_pct_of_program',case when t.program_floor_area>0 then round(100*t.service_area/t.program_floor_area,2) else null end
        ),
        metadata=coalesce(b.metadata,'{}'::jsonb) || jsonb_build_object(
          'cleaning_version','us_commercial_space_taxonomy_v1_3',
          'classification_coverage_pct',case when t.model_total_area>0 then round(100*(t.model_total_area-t.unclassified_area)/t.model_total_area,2) else null end,
          'program_detail_level',case when t.represented_spaces>=10 and gj.group_count>=3 and (t.circulation_area>0 or t.core_area>0 or t.service_area>0) then 'detailed_program_seed' else 'coarse_archetype_seed' end
        ),
        updated_at=now()
    from totals t join gj on gj.interior_id=t.interior_id
    where b.id=t.interior_id
    returning b.id
  )
  select count(*) into v_models from updated;

  with models as (
    select b.*,d.id as ds_id
    from training.building_interiors b
    join training.dataset_registry d on d.id=b.dataset_id
    where d.slug='openstudio_us_commercial_archetypes' and b.approved_for_training
  ), groups as (
    select m.id,(m.program_metrics->>'program_floor_area_sqft')::numeric as gross,
           coalesce(sp.function_group,'other') as function_group,
           round(sum(coalesce(nullif(sp.attributes->>'effective_area_sqft','')::numeric,sp.area_sqft,0)),2) as area_sqft,
           round(sum(greatest(coalesce(nullif(sp.attributes->>'multiplier','')::numeric,1),1)),2) as effective_count
    from models m
    join training.interior_spaces sp on sp.interior_id=m.id
    where sp.space_type not in ('service_void','shell')
    group by m.id,m.program_metrics->>'program_floor_area_sqft',coalesce(sp.function_group,'other')
  ), req as (
    select id,jsonb_agg(jsonb_build_object(
      'function_group',function_group,
      'area_sqft',area_sqft,
      'area_pct',case when gross>0 then round(100*area_sqft/gross,2) else null end,
      'effective_space_count',effective_count,
      'requirement_level',case when area_sqft/greatest(gross,1)>=0.05 then 'core_program' else 'supporting_program' end
    ) order by area_sqft desc) as required_spaces
    from groups group by id
  ), inserted as (
    insert into training.program_templates(
      building_type,subtype,name,source_dataset_id,min_gfa_sqft,max_gfa_sqft,target_efficiency_pct,
      required_spaces,adjacency_rules,circulation_rules,core_rules,service_rules,metadata,
      approved_for_generation,updated_at
    )
    select m.building_type,coalesce(m.subtype,''),
           'OpenStudio '||m.source_record_id||' program seed v1',m.ds_id,
           round(((m.program_metrics->>'program_floor_area_sqft')::numeric)*0.75,0),
           round(((m.program_metrics->>'program_floor_area_sqft')::numeric)*1.25,0),
           case when m.metadata->>'program_detail_level'='detailed_program_seed' then (m.program_metrics->>'program_efficiency_pct')::numeric else null end,
           coalesce(r.required_spaces,'[]'::jsonb),'[]'::jsonb,
           jsonb_build_object('target_area_pct',m.core_metrics->'circulation_area_pct_of_program','corridor_spaces',m.core_metrics->'corridor_spaces','confidence',case when m.metadata->>'program_detail_level'='detailed_program_seed' then 'medium' else 'low' end),
           jsonb_build_object('target_area_pct',m.core_metrics->'core_area_pct_of_program','stair_spaces',m.core_metrics->'stair_spaces','elevator_spaces',m.core_metrics->'elevator_spaces','lobby_spaces',m.core_metrics->'lobby_spaces','confidence',case when m.metadata->>'program_detail_level'='detailed_program_seed' then 'medium' else 'low' end),
           jsonb_build_object('target_area_pct',m.core_metrics->'service_area_pct_of_program','service_spaces',m.core_metrics->'service_spaces','confidence',case when m.metadata->>'program_detail_level'='detailed_program_seed' then 'medium' else 'low' end),
           jsonb_build_object(
             'source_record_id',m.source_record_id,
             'country_code','US',
             'template_version','openstudio_program_seed_v1_2',
             'classification_version','us_commercial_space_taxonomy_v1_3',
             'review_status','draft',
             'program_detail_level',m.metadata->>'program_detail_level',
             'gfa_basis','program floor area excluding service voids',
             'limitations',jsonb_build_array('energy-model archetype, not permit-grade CAD','adjacency not inferred','architect review required before generation')
           ),false,now()
    from models m left join req r on r.id=m.id
    on conflict(building_type,subtype,name) do update set
      source_dataset_id=excluded.source_dataset_id,
      min_gfa_sqft=excluded.min_gfa_sqft,
      max_gfa_sqft=excluded.max_gfa_sqft,
      target_efficiency_pct=excluded.target_efficiency_pct,
      required_spaces=excluded.required_spaces,
      circulation_rules=excluded.circulation_rules,
      core_rules=excluded.core_rules,
      service_rules=excluded.service_rules,
      metadata=excluded.metadata,
      approved_for_generation=false,
      updated_at=now()
    returning id
  )
  select count(*) into v_templates from inserted;

  select jsonb_build_object(
    'models',(select count(*) from training.building_interiors b join training.dataset_registry d on d.id=b.dataset_id where d.slug='openstudio_us_commercial_archetypes'),
    'spaces',(select count(*) from training.interior_spaces sp join training.building_interiors b on b.id=sp.interior_id join training.dataset_registry d on d.id=b.dataset_id where d.slug='openstudio_us_commercial_archetypes'),
    'elements',(select count(*) from training.interior_elements el join training.building_interiors b on b.id=el.interior_id join training.dataset_registry d on d.id=b.dataset_id where d.slug='openstudio_us_commercial_archetypes'),
    'train',(select count(*) from training.building_interiors b join training.dataset_registry d on d.id=b.dataset_id join training.dataset_artifacts a on a.dataset_id=d.id and a.metadata->>'source_record_id'=b.source_record_id where d.slug='openstudio_us_commercial_archetypes' and a.split='train'),
    'validation',(select count(*) from training.building_interiors b join training.dataset_registry d on d.id=b.dataset_id join training.dataset_artifacts a on a.dataset_id=d.id and a.metadata->>'source_record_id'=b.source_record_id where d.slug='openstudio_us_commercial_archetypes' and a.split='validation'),
    'test',(select count(*) from training.building_interiors b join training.dataset_registry d on d.id=b.dataset_id join training.dataset_artifacts a on a.dataset_id=d.id and a.metadata->>'source_record_id'=b.source_record_id where d.slug='openstudio_us_commercial_archetypes' and a.split='test'),
    'modelTotalAreaSqft',(select round(coalesce(sum(b.gross_floor_area_sqft),0),0) from training.building_interiors b join training.dataset_registry d on d.id=b.dataset_id where d.slug='openstudio_us_commercial_archetypes'),
    'programFloorAreaSqft',(select round(coalesce(sum((b.program_metrics->>'program_floor_area_sqft')::numeric),0),0) from training.building_interiors b join training.dataset_registry d on d.id=b.dataset_id where d.slug='openstudio_us_commercial_archetypes'),
    'detailedProgramSeeds',(select count(*) from training.building_interiors b join training.dataset_registry d on d.id=b.dataset_id where d.slug='openstudio_us_commercial_archetypes' and b.metadata->>'program_detail_level'='detailed_program_seed'),
    'coarseArchetypeSeeds',(select count(*) from training.building_interiors b join training.dataset_registry d on d.id=b.dataset_id where d.slug='openstudio_us_commercial_archetypes' and b.metadata->>'program_detail_level'='coarse_archetype_seed'),
    'unclassifiedSpaces',(select count(*) from training.interior_spaces sp join training.building_interiors b on b.id=sp.interior_id join training.dataset_registry d on d.id=b.dataset_id where d.slug='openstudio_us_commercial_archetypes' and sp.space_type='other'),
    'programTemplates',(select count(*) from training.program_templates pt join training.dataset_registry d on d.id=pt.source_dataset_id where d.slug='openstudio_us_commercial_archetypes'),
    'cleaner','us_commercial_space_taxonomy_v1_3',
    'licensePolicy','approved + commercial use + zero fee + model training allowed',
    'productionGenerationApproved',false,
    'limitations',jsonb_build_array('energy-model archetypes, not permit-grade CAD sets','adjacency not inferred','local code and architect review still required')
  ) into v_manifest;

  insert into training.training_releases(name,version,status,description,manifest)
  values('parcelmap_us_commercial_programs','0.1.0','draft',
         'Rights-clean U.S. commercial program and space-archetype corpus normalized from permissively licensed OpenStudio models. Templates require architecture review before production generation.',
         v_manifest)
  on conflict(name,version) do update set
    status='draft',description=excluded.description,manifest=excluded.manifest;

  insert into training.training_release_datasets(release_id,dataset_id,included_splits,filters,attribution_text)
  select r.id,d.id,array['train','validation','test']::text[],
         jsonb_build_object('approved_for_training',true,'cleaning_version','us_commercial_space_taxonomy_v1_3','approved_for_generation',false),
         d.attribution_text
  from training.training_releases r
  join training.dataset_registry d on d.slug='openstudio_us_commercial_archetypes'
  where r.name='parcelmap_us_commercial_programs' and r.version='0.1.0'
  on conflict(release_id,dataset_id) do update set
    included_splits=excluded.included_splits,filters=excluded.filters,attribution_text=excluded.attribution_text;

  insert into training.training_releases(name,version,status,description,manifest)
  values('parcelmap_openbim_parser_fixtures','0.1.0','draft',
         'Permissively licensed IFC parser fixtures. Explicitly excluded from U.S. design-precedent learning.',
         jsonb_build_object(
           'models',(select count(*) from training.building_interiors b join training.dataset_registry d on d.id=b.dataset_id where d.slug in ('buildingsmart_pcert_ifc_samples','bim_whale_ifc_samples')),
           'approvedTrainingExamples',0,
           'precedentWeight',0,
           'parser','ifc_semantic_cleaner_v1',
           'productionGenerationApproved',false
         ))
  on conflict(name,version) do update set
    status='draft',description=excluded.description,manifest=excluded.manifest;

  insert into training.training_release_datasets(release_id,dataset_id,included_splits,filters,attribution_text)
  select r.id,d.id,array['train','validation','test']::text[],
         jsonb_build_object('approved_for_training',false,'precedent_weight',0,'training_role','parser_fixture'),
         d.attribution_text
  from training.training_releases r
  join training.dataset_registry d on d.slug in ('buildingsmart_pcert_ifc_samples','bim_whale_ifc_samples')
  where r.name='parcelmap_openbim_parser_fixtures' and r.version='0.1.0'
  on conflict(release_id,dataset_id) do update set
    included_splits=excluded.included_splits,filters=excluded.filters,attribution_text=excluded.attribution_text;

  return jsonb_build_object(
    'spaces_classified',v_spaces,
    'models_refreshed',v_models,
    'templates_upserted',v_templates,
    'manifest',v_manifest
  );
end;
$$;

revoke all on function training.refresh_us_commercial_corpus() from public,anon,authenticated;
grant execute on function training.refresh_us_commercial_corpus() to service_role;

select training.refresh_us_commercial_corpus();
