-- Correct two source-label edge cases in the U.S. commercial taxonomy without
-- duplicating the full refresh function body.

do $patch$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef('training.refresh_us_commercial_corpus()'::regprocedure);

  if position('service[_ -]?shaft|mech[_ -]?' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      'service[_ -]?shaft|mechanical|boiler',
      'service[_ -]?shaft|mech[_ -]?|mechanical|boiler'
    );
  end if;

  if position('(^|[_ -])clean($|[_ -])' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      'clean[_ -]?work|soil[_ -]?work',
      'clean[_ -]?work|(^|[_ -])clean($|[_ -])|soil[_ -]?work'
    );
  end if;

  execute v_definition;
end;
$patch$;

select training.refresh_us_commercial_corpus();
