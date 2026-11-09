ALTER TABLE public.ptc_clicks
  ADD COLUMN IF NOT EXISTS duration_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visits_per_user integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cooldown_minutes integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS ptc_clicks_user_task_status_idx
  ON public.ptc_clicks (user_id, task_id, status, updated_at DESC);
