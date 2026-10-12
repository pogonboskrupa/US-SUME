# Isporuka Dendro Map 2.9.1 — Korisnici (admin)

- **Zadani prikaz "Po aktivnosti"**: svi korisnici iz svih šumarija u JEDNOJ
  listi, grupisani kalendarski (Danas / Zadnjih 7 dana / Zadnjih 30 dana /
  Ranije / Bez zabilježene aktivnosti), najsvježiji prvi. Svaka kartica nosi
  šumariju i relativno vrijeme ("prije 12 min") uz puni datum.
- **"Po šumarijama"**: ranije grupisanje, sad abecedno, sa brojem aktivnih u
  7 dana po šumariji i grupama koje se sklapaju (pamti se,
  `tvlake_adm_sum_zatvorene`). Sort (ime/aktivnost/registracija) važi ovdje.
- Izbor prikaza se pamti (`tvlake_adm_prikaz`). Sažetak dobio "aktivno danas"
  i "u zadnjih 7 dana". Čekanja odobrenja ostaju izdvojena na vrhu u oba
  prikaza; filter šumarije i pretraga po imenu rade u oba.
- Čiste funkcije `_admAktivnostGrupa`, `_admGrupisiPoAktivnosti`,
  `_admRelativno`, `_admGrupisiPoSumariji` — testovi u
  `tests/js/admin-korisnici.test.js` (35). "Ne znam" (stara migracija bez
  aktivnosti) se ne prikazuje kao "nikad".
