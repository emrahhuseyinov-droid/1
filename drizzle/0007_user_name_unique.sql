CREATE UNIQUE INDEX IF NOT EXISTS user_name_normalized_unique_idx
  ON public."user" (lower(btrim(name)));
