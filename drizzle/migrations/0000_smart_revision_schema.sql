
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name', ''), NULLIF(NEW.raw_user_meta_data->>'full_name', ''), NULLIF(NEW.raw_user_meta_data->>'name', ''), split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Study materials
CREATE TABLE public.study_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  file_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  page_count integer NOT NULL DEFAULT 0,
  text_page_count integer NOT NULL DEFAULT 0,
  word_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'partial')),
  pages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_materials TO authenticated;
GRANT ALL ON public.study_materials TO service_role;
ALTER TABLE public.study_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own materials select" ON public.study_materials FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own materials insert" ON public.study_materials FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own materials update" ON public.study_materials FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own materials delete" ON public.study_materials FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX study_materials_user_idx ON public.study_materials (user_id, created_at DESC);

-- Decks
CREATE TABLE public.decks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  subject text,
  unit text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.decks TO authenticated;
GRANT ALL ON public.decks TO service_role;
ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own decks select" ON public.decks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own decks insert" ON public.decks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own decks update" ON public.decks FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own decks delete" ON public.decks FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER decks_updated_at BEFORE UPDATE ON public.decks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX decks_user_idx ON public.decks (user_id);

-- Flashcards (state: 0 new, 1 learning, 2 review, 3 relearning — FSRS)
CREATE TABLE public.flashcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  deck_id uuid NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  material_id uuid REFERENCES public.study_materials(id) ON DELETE SET NULL,
  question text NOT NULL CHECK (char_length(btrim(question)) > 0),
  answer text NOT NULL CHECK (char_length(btrim(answer)) > 0),
  subject text,
  topic text,
  difficulty text NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  source_page integer,
  language text NOT NULL DEFAULT 'en',
  state smallint NOT NULL DEFAULT 0 CHECK (state BETWEEN 0 AND 3),
  due timestamptz NOT NULL DEFAULT now(),
  stability double precision NOT NULL DEFAULT 0,
  fsrs_difficulty double precision NOT NULL DEFAULT 0,
  scheduled_days integer NOT NULL DEFAULT 0,
  learning_steps integer NOT NULL DEFAULT 0,
  reps integer NOT NULL DEFAULT 0,
  lapses integer NOT NULL DEFAULT 0,
  last_review timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flashcards TO authenticated;
GRANT ALL ON public.flashcards TO service_role;
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own cards select" ON public.flashcards FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own cards insert" ON public.flashcards FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.decks d WHERE d.id = deck_id AND d.user_id = auth.uid()));
CREATE POLICY "Own cards update" ON public.flashcards FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.decks d WHERE d.id = deck_id AND d.user_id = auth.uid()));
CREATE POLICY "Own cards delete" ON public.flashcards FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER flashcards_updated_at BEFORE UPDATE ON public.flashcards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX flashcards_user_due_idx ON public.flashcards (user_id, due);
CREATE INDEX flashcards_deck_idx ON public.flashcards (deck_id);

-- Review history
CREATE TABLE public.review_logs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  card_id uuid NOT NULL REFERENCES public.flashcards(id) ON DELETE CASCADE,
  session_id uuid,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 4),
  state_before smallint NOT NULL,
  state_after smallint NOT NULL,
  due_before timestamptz,
  due_after timestamptz NOT NULL,
  stability double precision NOT NULL,
  difficulty double precision NOT NULL,
  scheduled_days integer NOT NULL,
  elapsed_days double precision NOT NULL DEFAULT 0,
  card_before jsonb NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_logs TO authenticated;
GRANT ALL ON public.review_logs TO service_role;
ALTER TABLE public.review_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own logs select" ON public.review_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own logs insert" ON public.review_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.flashcards c WHERE c.id = card_id AND c.user_id = auth.uid()));
CREATE POLICY "Own logs update" ON public.review_logs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own logs delete" ON public.review_logs FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX review_logs_user_time_idx ON public.review_logs (user_id, reviewed_at DESC);
CREATE INDEX review_logs_card_idx ON public.review_logs (card_id);

-- Atomically record a rating and the card's new schedule.
-- Re-rating with the same review id updates that log instead of adding a duplicate.
-- p_expected_reps guards against stale writes (e.g. the same card rated in another tab).
CREATE OR REPLACE FUNCTION public.apply_review(
  p_review_id uuid,
  p_card_id uuid,
  p_session_id uuid,
  p_rating smallint,
  p_expected_reps integer,
  p_card_before jsonb,
  p_state smallint,
  p_due timestamptz,
  p_stability double precision,
  p_difficulty double precision,
  p_scheduled_days integer,
  p_learning_steps integer,
  p_reps integer,
  p_lapses integer,
  p_last_review timestamptz,
  p_elapsed_days double precision
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_updated integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.flashcards SET
    state = p_state, due = p_due, stability = p_stability, fsrs_difficulty = p_difficulty,
    scheduled_days = p_scheduled_days, learning_steps = p_learning_steps, reps = p_reps,
    lapses = p_lapses, last_review = p_last_review
  WHERE id = p_card_id AND user_id = auth.uid() AND reps = p_expected_reps;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'card_changed' USING HINT = 'This card was updated elsewhere. Reload and try again.';
  END IF;

  INSERT INTO public.review_logs (id, user_id, card_id, session_id, rating, state_before, state_after,
    due_before, due_after, stability, difficulty, scheduled_days, elapsed_days, card_before, reviewed_at)
  VALUES (p_review_id, auth.uid(), p_card_id, p_session_id, p_rating,
    COALESCE((p_card_before->>'state')::smallint, 0), p_state,
    (p_card_before->>'due')::timestamptz, p_due, p_stability, p_difficulty, p_scheduled_days,
    p_elapsed_days, p_card_before, p_last_review)
  ON CONFLICT (id) DO UPDATE SET
    rating = EXCLUDED.rating, state_after = EXCLUDED.state_after, due_after = EXCLUDED.due_after,
    stability = EXCLUDED.stability, difficulty = EXCLUDED.difficulty,
    scheduled_days = EXCLUDED.scheduled_days, reviewed_at = EXCLUDED.reviewed_at
  WHERE review_logs.user_id = auth.uid() AND review_logs.card_id = EXCLUDED.card_id;
END; $$;
REVOKE ALL ON FUNCTION public.apply_review FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_review TO authenticated;
