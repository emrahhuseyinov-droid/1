CREATE TABLE IF NOT EXISTS public.earnpepe_crush_profiles (
  guest_id uuid PRIMARY KEY,
  current_level integer NOT NULL DEFAULT 1,
  levels_completed integer NOT NULL DEFAULT 0,
  total_stars integer NOT NULL DEFAULT 0,
  total_score bigint NOT NULL DEFAULT 0,
  best_score bigint NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  three_star_levels integer NOT NULL DEFAULT 0,
  coins integer NOT NULL DEFAULT 0,
  boosters jsonb NOT NULL,
  achievements text[] NOT NULL DEFAULT ARRAY[]::text[],
  specials_created integer NOT NULL DEFAULT 0,
  rainbows_created integer NOT NULL DEFAULT 0,
  best_cascade integer NOT NULL DEFAULT 0,
  streak integer NOT NULL DEFAULT 0,
  last_daily_claim date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT earnpepe_crush_profiles_level_check CHECK (current_level >= 1),
  CONSTRAINT earnpepe_crush_profiles_coins_check CHECK (coins >= 0)
);
CREATE INDEX IF NOT EXISTS earnpepe_crush_profiles_levels_idx ON public.earnpepe_crush_profiles (levels_completed DESC);
CREATE INDEX IF NOT EXISTS earnpepe_crush_profiles_score_idx ON public.earnpepe_crush_profiles (total_score DESC);
CREATE INDEX IF NOT EXISTS earnpepe_crush_profiles_stars_idx ON public.earnpepe_crush_profiles (total_stars DESC);

CREATE TABLE IF NOT EXISTS public.earnpepe_crush_level_results (
  guest_id uuid NOT NULL,
  level integer NOT NULL,
  best_score bigint NOT NULL DEFAULT 0,
  stars smallint NOT NULL DEFAULT 0,
  completed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guest_id, level),
  CONSTRAINT earnpepe_crush_level_results_stars_check CHECK (stars BETWEEN 0 AND 3)
);

CREATE TABLE IF NOT EXISTS public.earnpepe_crush_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL,
  level integer NOT NULL,
  seed bigint NOT NULL,
  engine_version smallint NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'running',
  score bigint NOT NULL DEFAULT 0,
  stars smallint NOT NULL DEFAULT 0,
  moves_used integer NOT NULL DEFAULT 0,
  boosters_used jsonb,
  coins_earned integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT earnpepe_crush_sessions_status_check CHECK (status IN ('running', 'won', 'lost', 'abandoned', 'invalid'))
);
CREATE INDEX IF NOT EXISTS earnpepe_crush_sessions_guest_started_idx ON public.earnpepe_crush_sessions (guest_id, started_at DESC);
CREATE INDEX IF NOT EXISTS earnpepe_crush_sessions_weekly_idx ON public.earnpepe_crush_sessions (status, finished_at);

CREATE TABLE IF NOT EXISTS public.earnpepe_crush_daily (
  guest_id uuid NOT NULL,
  day date NOT NULL,
  levels_won integer NOT NULL DEFAULT 0,
  score bigint NOT NULL DEFAULT 0,
  specials integer NOT NULL DEFAULT 0,
  boosters_used integer NOT NULL DEFAULT 0,
  best_cascade integer NOT NULL DEFAULT 0,
  stars integer NOT NULL DEFAULT 0,
  claimed_missions text[] NOT NULL DEFAULT ARRAY[]::text[],
  PRIMARY KEY (guest_id, day)
);
