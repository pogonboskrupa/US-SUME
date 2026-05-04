-- ============================================================
-- Forestry Tracker - Supabase migracija
-- Pokrenuti u Supabase SQL Editor
-- ============================================================

-- PostGIS ekstenzija za prostorne operacije
create extension if not exists postgis;
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABELA: profiles (proširenje auth.users)
-- ============================================================
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  email         text not null,
  created_at    timestamptz default now()
);

-- Auto-kreiraj profil pri registraciji
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- TABELA: projects (odjeli/projekti)
-- ============================================================
create table public.projects (
  id                  uuid primary key default uuid_generate_v4(),
  name                text not null,
  description         text,
  created_by          uuid not null references public.profiles(id),
  -- Granica odjela kao GeoJSON (polygon)
  boundary_geojson    jsonb,
  -- Poznata površina iz katastra (ha)
  known_area_ha       float,
  -- Prostorna geometrija za PostGIS upite
  boundary_geom       geometry(Polygon, 4326),
  status              text default 'active' check (status in ('active', 'completed', 'paused')),
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- Trigger za ažuriranje boundary_geom iz GeoJSON-a
create or replace function update_boundary_geom()
returns trigger language plpgsql as $$
begin
  if new.boundary_geojson is not null then
    new.boundary_geom = ST_SetSRID(
      ST_GeomFromGeoJSON(new.boundary_geojson::text),
      4326
    );
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_geom_trigger
  before insert or update on public.projects
  for each row execute procedure update_boundary_geom();

-- ============================================================
-- TABELA: project_members (inženjeri na projektu)
-- ============================================================
create table public.project_members (
  id            uuid primary key default uuid_generate_v4(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  role          text not null default 'engineer' check (role in ('manager', 'engineer')),
  -- Boja traga (hex, npr. '#E63946')
  track_color   text not null default '#3B8BD4',
  -- Redosljed inženjera (određuje koji je "prvi", "drugi"...)
  order_index   int not null default 0,
  is_active     boolean default true,
  joined_at     timestamptz default now(),
  unique(project_id, user_id)
);

-- ============================================================
-- TABELA: track_points (GPS tačke traga)
-- ============================================================
create table public.track_points (
  id            bigserial primary key,
  project_id    uuid not null references public.projects(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  latitude      float8 not null,
  longitude     float8 not null,
  altitude      float8,
  accuracy      float8,
  speed         float8,
  -- PostGIS točka
  geom          geometry(Point, 4326) generated always as (
                  ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
                ) stored,
  recorded_at   timestamptz default now()
);

-- Indeksi za brze prostorne upite
create index track_points_geom_idx on public.track_points using gist(geom);
create index track_points_project_user_idx on public.track_points(project_id, user_id);
create index track_points_recorded_at_idx on public.track_points(recorded_at desc);

-- ============================================================
-- TABELA: engineer_zones (izračunate zone po inženjeru)
-- ============================================================
create table public.engineer_zones (
  id            uuid primary key default uuid_generate_v4(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  -- Zona kao GeoJSON polygon
  zone_geojson  jsonb,
  zone_geom     geometry(Polygon, 4326),
  -- Izračunata površina u hektarima
  area_ha       float8,
  -- Postotak od ukupnog odjela
  area_pct      float8,
  calculated_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.track_points enable row level security;
alter table public.engineer_zones enable row level security;

-- Profili: korisnik vidi samo svoj profil
create policy "profiles_select" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update" on public.profiles for update using (auth.uid() = id);

-- Projekti: vide ga svi članovi
create policy "projects_select" on public.projects for select using (
  auth.uid() = created_by or
  exists (select 1 from public.project_members where project_id = id and user_id = auth.uid())
);
create policy "projects_insert" on public.projects for insert with check (auth.uid() = created_by);
create policy "projects_update" on public.projects for update using (auth.uid() = created_by);

-- Članovi projekta: vide svi na projektu
create policy "members_select" on public.project_members for select using (
  exists (select 1 from public.project_members pm where pm.project_id = project_id and pm.user_id = auth.uid())
);
create policy "members_insert" on public.project_members for insert with check (
  exists (select 1 from public.projects where id = project_id and created_by = auth.uid())
);
create policy "members_delete" on public.project_members for delete using (
  exists (select 1 from public.projects where id = project_id and created_by = auth.uid())
);

-- Track points: vide svi na projektu, insertat može samo vlasnik
create policy "track_select" on public.track_points for select using (
  exists (select 1 from public.project_members where project_id = project_id and user_id = auth.uid())
);
create policy "track_insert" on public.track_points for insert with check (auth.uid() = user_id);

-- Zone: vide svi na projektu
create policy "zones_select" on public.engineer_zones for select using (
  exists (select 1 from public.project_members where project_id = project_id and user_id = auth.uid())
);
create policy "zones_upsert" on public.engineer_zones for all using (
  exists (select 1 from public.projects where id = project_id and created_by = auth.uid())
);

-- ============================================================
-- SUPABASE REALTIME
-- Omogući realtime za praćenje pozicija uživo
-- ============================================================
alter publication supabase_realtime add table public.track_points;
alter publication supabase_realtime add table public.engineer_zones;
alter publication supabase_realtime add table public.project_members;
