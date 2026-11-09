CREATE TABLE IF NOT EXISTS public.ptc_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  click_id text NOT NULL UNIQUE,
  task_id text NOT NULL DEFAULT 'pepe-casa-1',
  status text NOT NULL DEFAULT 'pending',
  payout numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ptc_clicks_status_check CHECK (status IN ('pending', 'completed', 'rejected')),
  CONSTRAINT ptc_clicks_payout_check CHECK (payout IS NULL OR payout >= 0)
);

ALTER TABLE public.ptc_clicks
  ADD COLUMN IF NOT EXISTS task_id text NOT NULL DEFAULT 'pepe-casa-1';

CREATE INDEX IF NOT EXISTS ptc_clicks_user_created_idx
  ON public.ptc_clicks (user_id, created_at DESC);
