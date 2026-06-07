-- ============================================================
-- Doznaka sistem — GPS praćenje po pojasima
-- Pokrenuti u Supabase SQL Editor
-- ============================================================

-- ============================================================
-- TABELA: doznaka_projekti
-- Odabrani GJ+Odjel sa spojenom granicom odsjeka
-- ============================================================
create table public.doznaka_projekti (
  id              uuid primary key default uuid_generate_v4(),
  created_by      uuid not null references public.profiles(id) on delete cascade,
  gj              text not null,          -- Gospodarska jedinica, npr. 'RISOVAC KRUPA'
  odjel           text not null,          -- Broj odjela, npr. '78'
  -- Spojena granica svih odsjeka (bez Gaz_Klasa_=8000), GeoJSON Polygon/MultiPolygon
  boundary_geojson jsonb not null,
  boundary_geom    geometry(MultiPolygon, 4326),
  total_area_ha    float8,                -- Ukupna površina odjela (ha)
  created_at       timestamptz default now(),
  unique(created_by, gj, odjel)
);

-- Trigger: boundary_geom iz GeoJSON-a
create or replace function update_doznaka_boundary_geom()
returns trigger language plpgsql as $$
begin
  if new.boundary_geojson is not null then
    begin
      new.boundary_geom = ST_SetSRID(
        ST_GeomFromGeoJSON(new.boundary_geojson::text),
        4326
      );
    exception when others then
      -- Ignorišemo greške parsiranja
    end;
  end if;
  return new;
end;
$$;

create trigger doznaka_projekti_geom_trigger
  before insert or update on public.doznaka_projekti
  for each row execute procedure update_doznaka_boundary_geom();

-- ============================================================
-- TABELA: doznaka_trasa
-- Jedna GPS šetnja (pojas) projektanta
-- ============================================================
create table public.doznaka_trasa (
  id              uuid primary key default uuid_generate_v4(),
  projekat_id     uuid not null references public.doznaka_projekti(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  -- GPS trag kao GeoJSON LineString (snimljene tačke)
  track_geojson   jsonb,
  track_geom      geometry(LineString, 4326),
  -- Izračunata zona (buffer po pojasu) — GeoJSON Polygon
  zona_geojson    jsonb,
  zona_geom       geometry(Polygon, 4326),
  area_ha         float8,                -- Površina pojasa (ha)
  area_pct        float8,                -- Postotak od ukupnog odjela
  is_last_strip   boolean default false, -- Je li ovo zadnji pojas (spoji do gornje granice)
  status          text default 'active' check (status in ('active', 'finished')),
  started_at      timestamptz default now(),
  finished_at     timestamptz,
  -- Redosljed (latitude centroida) — za sortiranje pojaseva od dna ka vrhu
  centroid_lat    float8
);

create index doznaka_trasa_projekat_idx on public.doznaka_trasa(projekat_id);
create index doznaka_trasa_user_idx on public.doznaka_trasa(projekat_id, user_id);

-- ============================================================
-- TABELA: doznaka_tacke
-- Pojedinačne GPS tačke po trasi
-- ============================================================
create table public.doznaka_tacke (
  id          bigserial primary key,
  trasa_id    uuid not null references public.doznaka_trasa(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  latitude    float8 not null,
  longitude   float8 not null,
  altitude    float8,
  accuracy    float8,
  speed       float8,
  geom        geometry(Point, 4326) generated always as (
                ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
              ) stored,
  recorded_at timestamptz default now()
);

create index doznaka_tacke_trasa_idx on public.doznaka_tacke(trasa_id);
create index doznaka_tacke_geom_idx on public.doznaka_tacke using gist(geom);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.doznaka_projekti enable row level security;
alter table public.doznaka_trasa     enable row level security;
alter table public.doznaka_tacke     enable row level security;

-- doznaka_projekti: kreator vidi/uređuje
create policy "doznaka_projekti_select" on public.doznaka_projekti
  for select using (auth.uid() = created_by);

create policy "doznaka_projekti_insert" on public.doznaka_projekti
  for insert with check (auth.uid() = created_by);

create policy "doznaka_projekti_delete" on public.doznaka_projekti
  for delete using (auth.uid() = created_by);

-- doznaka_trasa: vlasnik trasa vidi sve trasa za isti projekat
create policy "doznaka_trasa_select" on public.doznaka_trasa
  for select using (
    exists (
      select 1 from public.doznaka_projekti
      where id = projekat_id and created_by = auth.uid()
    )
    or user_id = auth.uid()
  );

create policy "doznaka_trasa_insert" on public.doznaka_trasa
  for insert with check (auth.uid() = user_id);

create policy "doznaka_trasa_update" on public.doznaka_trasa
  for update using (auth.uid() = user_id);

create policy "doznaka_trasa_delete" on public.doznaka_trasa
  for delete using (auth.uid() = user_id);

-- doznaka_tacke: vlasnik tačaka
create policy "doznaka_tacke_select" on public.doznaka_tacke
  for select using (
    exists (
      select 1 from public.doznaka_trasa t
      join public.doznaka_projekti p on p.id = t.projekat_id
      where t.id = trasa_id and (t.user_id = auth.uid() or p.created_by = auth.uid())
    )
  );

create policy "doznaka_tacke_insert" on public.doznaka_tacke
  for insert with check (auth.uid() = user_id);

-- ============================================================
-- REALTIME
-- ============================================================
alter publication supabase_realtime add table public.doznaka_trasa;
alter publication supabase_realtime add table public.doznaka_tacke;
