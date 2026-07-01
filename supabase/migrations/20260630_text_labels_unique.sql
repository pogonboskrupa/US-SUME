-- D2-C: jedinstvena tekst-oznaka po korisniku (korisnik_id, label_id).
-- Omogućava SIGURAN upsert (update-in-place) umjesto delete-pa-insert, čime se uklanja
-- prozor u kojem server ostane bez oznaka ako insert padne (gubitak podataka).
-- Idempotentno: prvo ukloni eventualne duplikate, pa dodaj constraint ako ne postoji.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'text_labels_korisnik_label_uniq'
  ) THEN
    -- Ukloni duplikate (zadrži jedan red po korisnik_id+label_id)
    DELETE FROM text_labels a
      USING text_labels b
     WHERE a.ctid < b.ctid
       AND a.korisnik_id = b.korisnik_id
       AND a.label_id    = b.label_id;

    ALTER TABLE text_labels
      ADD CONSTRAINT text_labels_korisnik_label_uniq UNIQUE (korisnik_id, label_id);
  END IF;
END $$;
