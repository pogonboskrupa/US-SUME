-- ============================================================
-- VLAKE: ON DELETE CASCADE za projekt_id
-- Pokrenuti u Supabase SQL Editor.
-- ------------------------------------------------------------
-- Kada se projekat obriše, automatski briše sve vlake s tim
-- projekt_id. Bez ovoga, neuspjeli client-side delete ili
-- brisanje od strane drugog korisnika ostavlja orphan redove.
-- ============================================================

-- Ukloni postojeći FK constraint ako postoji
do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where rel.relname = 'vlake' and ns.nspname = 'public'
      and con.contype = 'f'
      and exists (
        select 1 from unnest(con.conkey) ck
        join pg_attribute a on a.attrelid = con.conrelid and a.attnum = ck
        where a.attname = 'projekt_id'
      )
  loop
    execute format('alter table public.vlake drop constraint %I', r.conname);
    raise notice 'Dropped FK constraint %', r.conname;
  end loop;
end $$;

-- Dodaj FK sa CASCADE
alter table public.vlake
  add constraint vlake_projekt_id_fk
  foreign key (projekt_id) references public.projekti(id) on delete cascade;
