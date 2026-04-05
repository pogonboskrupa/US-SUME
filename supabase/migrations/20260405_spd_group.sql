-- ============================================================
-- ŠPD US ŠUME grupa — premjesti postojeće korisnike
-- Izet Velagić i Amra Ismailovski iz Šumarija Bos.Krupa
-- u grupu ŠPD US ŠUME (bez prava dijeljenja vlaka)
-- ============================================================

UPDATE public.korisnici
SET sumarija = 'ŠPD US ŠUME'
WHERE (ime = 'Izet'  AND prezime = 'Velagić')
   OR (ime = 'Amra'  AND prezime = 'Ismailovski');
