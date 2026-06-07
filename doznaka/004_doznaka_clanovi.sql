-- ============================================================
-- Doznaka — tim projektanata po projektu
-- + Ažurirane RLS politike za višekorisničke projekte
-- ============================================================

-- ============================================================
-- TABELA: doznaka_clanovi
-- Projektanti dodijeljeni na doznaka projekat
-- ============================================================
CREATE TABLE IF NOT EXISTS public.doznaka_clanovi (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  projekat_id uuid NOT NULL REFERENCES public.doznaka_projekti(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.korisnici(id) ON DELETE CASCADE,
  boja        text NOT NULL DEFAULT '#3B8BD4',  -- boja trasa na mapi
  dodan_at    timestamptz DEFAULT now(),
  UNIQUE(projekat_id, user_id)
);

CREATE INDEX doznaka_clanovi_proj_idx ON public.doznaka_clanovi(projekat_id);

ALTER TABLE public.doznaka_clanovi ENABLE ROW LEVEL SECURITY;

-- Kreator projekta i svi članovi vide listu
CREATE POLICY "doznaka_clanovi_select" ON public.doznaka_clanovi
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.doznaka_projekti
      WHERE id = projekat_id AND created_by = auth.uid()
    )
    OR user_id = auth.uid()
  );

-- Samo kreator projekta može dodavati/brisati
CREATE POLICY "doznaka_clanovi_insert" ON public.doznaka_clanovi
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.doznaka_projekti
      WHERE id = projekat_id AND created_by = auth.uid()
    )
  );

CREATE POLICY "doznaka_clanovi_delete" ON public.doznaka_clanovi
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.doznaka_projekti
      WHERE id = projekat_id AND created_by = auth.uid()
    )
  );

-- ============================================================
-- AŽURIRANE RLS politike za doznaka_trasa i doznaka_tacke
-- (sada uključuju sve članove projekta, ne samo kreatora)
-- ============================================================

-- Ukloni stare politike
DROP POLICY IF EXISTS "doznaka_trasa_select" ON public.doznaka_trasa;
DROP POLICY IF EXISTS "doznaka_tacke_select" ON public.doznaka_tacke;

-- Nova politika: kreator projekta ILI član ILI vlasnik trasa
CREATE POLICY "doznaka_trasa_select" ON public.doznaka_trasa
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.doznaka_projekti
      WHERE id = projekat_id AND created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.doznaka_clanovi
      WHERE projekat_id = doznaka_trasa.projekat_id AND user_id = auth.uid()
    )
  );

-- Trasa insert: samo ako si član ili kreator
DROP POLICY IF EXISTS "doznaka_trasa_insert" ON public.doznaka_trasa;
CREATE POLICY "doznaka_trasa_insert" ON public.doznaka_trasa
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND (
      EXISTS (
        SELECT 1 FROM public.doznaka_projekti
        WHERE id = projekat_id AND created_by = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.doznaka_clanovi
        WHERE projekat_id = doznaka_trasa.projekat_id AND user_id = auth.uid()
      )
    )
  );

CREATE POLICY "doznaka_tacke_select" ON public.doznaka_tacke
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.doznaka_trasa t
      WHERE t.id = trasa_id AND (
        t.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.doznaka_projekti p
          WHERE p.id = t.projekat_id AND p.created_by = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.doznaka_clanovi c
          WHERE c.projekat_id = t.projekat_id AND c.user_id = auth.uid()
        )
      )
    )
  );

-- Realtime za doznaka_clanovi
ALTER PUBLICATION supabase_realtime ADD TABLE public.doznaka_clanovi;
