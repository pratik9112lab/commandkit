/*
  # Fix mutable search_path on update_updated_at function

  1. Security Fix
    - Recreates `public.update_updated_at` with an explicit
      `search_path = pg_catalog` to prevent search path manipulation attacks.
    - A mutable search_path allows a caller to set a malicious search_path
      that could redirect function calls to attacker-controlled schema objects.
    - Setting `search_path = pg_catalog` makes the function's search path
      immutable and safe.

  2. Important Notes
    - Uses CREATE OR REPLACE to preserve dependent triggers (no DROP needed).
    - The function body only uses `now()`, which resolves from pg_catalog.
    - All 5 existing triggers continue to reference this function unchanged.
*/

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
