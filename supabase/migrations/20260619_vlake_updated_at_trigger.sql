-- ============================================================
-- VLAKE: serverski autoritativan updated_at + rev (verzija)
-- Pokrenuti u Supabase SQL Editor.
-- ------------------------------------------------------------
-- Problem: klijent je slao updated_at iz sata UREĐAJA. Ako su satovi
-- dva telefona razdešeni (čest slučaj offline na terenu), uređaj sa
-- "zaostalim" satom je UVIJEK gubio svoje izmjene jer mu je updated_at
-- bio manji od onoga na serveru (guard updated_at.lte ga je tiho odbacio).
--
-- Rješenje:
--   • updated_at se UVIJEK postavlja na now() na serveru (trigger) —
--     sat klijenta se ignoriše.
--   • rev (bigint) raste na svaki UPDATE → klijent radi optimistično
--     zaključavanje (update ... where rev = poznati_rev). Konflikt se
--     detektuje brojačem, NE satom.
-- ============================================================

alter table public.vlake add column if not exists rev bigint not null default 0;

create or replace function public.vlake_bump()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();                  -- serverski sat, autoritativno
  if (tg_op = 'UPDATE') then
    new.rev := coalesce(old.rev, 0) + 1;    -- monotoni brojač verzija
  end if;
  return new;
end;
$$;

drop trigger if exists vlake_bump_trg on public.vlake;
create trigger vlake_bump_trg
  before insert or update on public.vlake
  for each row execute function public.vlake_bump();
