-- ============================================================
-- Migracija 002 — Obilježavanje ploha + RLS poboljšanja
-- Pokrenuti u Supabase SQL Editor NAKON 001_initial.sql
-- ============================================================

-- ============================================================
-- TABELA: area_markings (obilježene plohe unutar odjela)
-- ============================================================
create table public.area_markings (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  created_by      uuid not null references public.profiles(id),

  -- Tip plohe
  marking_type    text not null check (marking_type in (
    'unsuitable_felling',   -- Nepogodno za sječu (kamen, nagib, vlažno...)
    'cleaning',             -- Potrebno čišćenje podmlatka
    'protection',           -- Zaštitna zona (vodotok, stanište...)
    'seed_trees',           -- Stabla sjemenjaci — NE sjeći
    'priority_felling',     -- Prioritet za doznaku
    'done',                 -- Završeno / obavljeno
    'custom'                -- Korisnički tip
  )),

  -- Naziv i bilješka
  label           text,         -- Kratki naziv npr. "Vlažno tlo"
  note            text,         -- Duža napomena terena

  -- Geometrija (polygon na mapi)
  boundary_geojson jsonb not null,
  boundary_geom    geometry(Polygon, 4326),

  -- Površina obilježene plohe (ha)
  area_ha         float8,

  -- Vidljivost
  is_visible      boolean default true,

  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Prostorni indeks
create index area_markings_geom_idx
  on public.area_markings using gist(boundary_geom);
create index area_markings_project_idx
  on public.area_markings(project_id);

-- Trigger za geom + updated_at
create or replace function update_marking_geom()
returns trigger language plpgsql as $$
begin
  if new.boundary_geojson is not null then
    new.boundary_geom = ST_SetSRID(
      ST_GeomFromGeoJSON(new.boundary_geojson::text), 4326
    );
    -- Izračunaj površinu automatski (m² → ha)
    new.area_ha = ST_Area(
      ST_Transform(new.boundary_geom, 3857)
    ) / 10000.0;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create trigger area_markings_geom_trigger
  before insert or update on public.area_markings
  for each row execute procedure update_marking_geom();

-- ============================================================
-- RLS za area_markings — samo članovi projekta
-- ============================================================
alter table public.area_markings enable row level security;

-- SELECT: svi članovi projekta mogu vidjeti plohe
create policy "markings_select" on public.area_markings
  for select using (
    exists (
      select 1 from public.project_members
      where project_id = area_markings.project_id
        and user_id = auth.uid()
    )
  );

-- INSERT: svi aktivni članovi mogu dodavati plohe
create policy "markings_insert" on public.area_markings
  for insert with check (
    auth.uid() = created_by
    and exists (
      select 1 from public.project_members
      where project_id = area_markings.project_id
        and user_id = auth.uid()
        and is_active = true
    )
  );

-- UPDATE: samo kreator plohe ili projektant
create policy "markings_update" on public.area_markings
  for update using (
    auth.uid() = created_by
    or exists (
      select 1 from public.project_members
      where project_id = area_markings.project_id
        and user_id = auth.uid()
        and role = 'manager'
    )
  );

-- DELETE: samo kreator ili projektant
create policy "markings_delete" on public.area_markings
  for delete using (
    auth.uid() = created_by
    or exists (
      select 1 from public.project_members
      where project_id = area_markings.project_id
        and user_id = auth.uid()
        and role = 'manager'
    )
  );

-- Realtime za plohe
alter publication supabase_realtime add table public.area_markings;

-- ============================================================
-- POBOLJŠANE RLS POLITIKE za projects
-- Osigurati da ne-članovi NE mogu vidjeti projekte
-- ============================================================
drop policy if exists "projects_select" on public.projects;

create policy "projects_select" on public.projects
  for select using (
    -- Kreator vidi
    auth.uid() = created_by
    or
    -- Član vidi
    exists (
      select 1 from public.project_members pm
      where pm.project_id = public.projects.id
        and pm.user_id = auth.uid()
        and pm.is_active = true
    )
  );

-- ============================================================
-- VIEW: project_members_with_profiles (lakši join)
-- ============================================================
create or replace view public.members_with_profiles as
  select
    pm.id,
    pm.project_id,
    pm.user_id,
    pm.role,
    pm.track_color,
    pm.order_index,
    pm.is_active,
    pm.joined_at,
    p.full_name,
    p.email
  from public.project_members pm
  join public.profiles p on p.id = pm.user_id;

-- RLS na view (nasljeđuje od tabela)
grant select on public.members_with_profiles to authenticated;

-- ============================================================
-- FUNKCIJA: Provjeri je li korisnik član projekta
-- Koristi se u svim policy-ima
-- ============================================================
create or replace function public.is_project_member(pid uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.project_members
    where project_id = pid
      and user_id = auth.uid()
      and is_active = true
  );
$$;

-- ============================================================
-- FUNKCIJA: Provjeri je li korisnik projektant
-- ============================================================
create or replace function public.is_project_manager(pid uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.project_members
    where project_id = pid
      and user_id = auth.uid()
      and role = 'manager'
      and is_active = true
  );
$$;
