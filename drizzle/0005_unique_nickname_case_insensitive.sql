CREATE UNIQUE INDEX IF NOT EXISTS user_name_lower_unique
  ON public."user" (lower(name));
