ALTER TABLE public.earnpepe_wheel_captcha_sessions
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'wheel';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'earnpepe_wheel_captcha_sessions_purpose_check'
      AND conrelid = 'public.earnpepe_wheel_captcha_sessions'::regclass
  ) THEN
    ALTER TABLE public.earnpepe_wheel_captcha_sessions
      ADD CONSTRAINT earnpepe_wheel_captcha_sessions_purpose_check
      CHECK (purpose IN ('wheel', 'daily_bonus'));
  END IF;
END;
$$;
