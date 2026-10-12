-- PRIPREMLJENO, nije izvršeno. Ne mijenja postojeće redove ni njihove ID-jeve.
-- SECURITY INVOKER: postojeći RLS ostaje mjerodavan; ne koristi service role.
create or replace function public.codex_save_gps_point(p jsonb)
returns void language plpgsql security invoker
set search_path = public, pg_temp as $$
declare
  u uuid := (p->>'user_id')::uuid;
  project uuid := (p->>'project_id')::uuid;
  t timestamptz := (p->>'recorded_at')::timestamptz;
  lat double precision := (p->>'latitude')::double precision;
  lon double precision := (p->>'longitude')::double precision;
begin
  if auth.uid() is null or u is distinct from auth.uid() or not public.je_odobren() then
    raise exception 'Pristup odbijen' using errcode = '42501';
  end if;
  if project is null or t is null or lat is null or lon is null or
     lat not between -90 and 90 or lon not between -180 and 180 then
    raise exception 'Neispravna GPS tačka' using errcode = '22023';
  end if;
  -- Isti trenutak/koordinate istog vlasnika u projektu su ista logička tačka.
  perform pg_advisory_xact_lock(hashtextextended(u::text || project::text ||
    extract(epoch from t)::text || lat::text || lon::text, 0));
  if not exists(select 1 from public.doz_track_points where user_id=u and
      project_id=project and recorded_at=t and latitude=lat and longitude=lon) then
    insert into public.doz_track_points(project_id,user_id,latitude,longitude,altitude,accuracy,speed,recorded_at)
    values(project,u,lat,lon,(p->>'altitude')::double precision,
      (p->>'accuracy')::double precision,(p->>'speed')::double precision,t);
  end if;
end $$;
revoke all on function public.codex_save_gps_point(jsonb) from public, anon;
grant execute on function public.codex_save_gps_point(jsonb) to authenticated;
notify pgrst, 'reload schema';
