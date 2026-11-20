CREATE TABLE IF NOT EXISTS public.earnpepe_verse_profiles (
  guest_id uuid PRIMARY KEY,
  xp integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  coins integer NOT NULL DEFAULT 100,
  energy smallint NOT NULL DEFAULT 40,
  stamina smallint NOT NULL DEFAULT 30,
  streak integer NOT NULL DEFAULT 0,
  last_daily_claim date,
  skins text[] NOT NULL DEFAULT ARRAY['neon-runner']::text[],
  equipped_skin text NOT NULL DEFAULT 'neon-runner',
  achievements text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT earnpepe_verse_profiles_xp_check CHECK (xp >= 0),
  CONSTRAINT earnpepe_verse_profiles_level_check CHECK (level >= 1),
  CONSTRAINT earnpepe_verse_profiles_coins_check CHECK (coins >= 0),
  CONSTRAINT earnpepe_verse_profiles_energy_check CHECK (energy BETWEEN 0 AND 100),
  CONSTRAINT earnpepe_verse_profiles_stamina_check CHECK (stamina BETWEEN 0 AND 100)
);
CREATE INDEX IF NOT EXISTS earnpepe_verse_profiles_xp_idx ON public.earnpepe_verse_profiles (xp DESC);

CREATE TABLE IF NOT EXISTS public.earnpepe_verse_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,
  daily_rewards jsonb NOT NULL DEFAULT '[20,30,20,40,50,25,75]'::jsonb,
  task_rewards jsonb NOT NULL DEFAULT '{"faucet":10,"ptc":10,"shortlink":10,"watch":10,"invite":15}'::jsonb,
  tournament_prizes jsonb NOT NULL DEFAULT '[100,50,25]'::jsonb,
  daily_limit integer NOT NULL DEFAULT 5,
  claimed_tournament_places text[] NOT NULL DEFAULT ARRAY[]::text[],
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT earnpepe_verse_settings_singleton_check CHECK (id = 1),
  CONSTRAINT earnpepe_verse_settings_daily_limit_check CHECK (daily_limit BETWEEN 1 AND 20)
);

CREATE TABLE IF NOT EXISTS public.earnpepe_verse_weekly_scores (
  guest_id uuid NOT NULL,
  week_start date NOT NULL,
  score integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guest_id, week_start),
  CONSTRAINT earnpepe_verse_weekly_scores_score_check CHECK (score >= 0)
);
CREATE INDEX IF NOT EXISTS earnpepe_verse_weekly_scores_leaderboard_idx ON public.earnpepe_verse_weekly_scores (week_start, score DESC);
