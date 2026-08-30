/*
# Create user_stamina table

Tracks per-user stamina for AI image generation rate limiting.

## 1. New Tables

### `user_stamina`
Stores each user's current stamina balance and last-login timestamp for recovery calculation.
- `user_id` (uuid, PK, FK → auth.users) — the owning user
- `stamina` (int, default 50) — current stamina balance (0–50)
- `last_login_at` (timestamptz) — last login timestamp used for recovery calculation
- `updated_at` (timestamptz) — last modification timestamp

## 2. Security
- RLS enabled.
- Authenticated users can SELECT and UPDATE their own row only.
- INSERT is allowed so the app can create the initial row on first login.
- DELETE is not permitted (rows are permanent).
- Admin (d-mukai@nua.ac.jp) can SELECT all rows for the dashboard.

## 3. Notes
- Stamina max is 50. Recovery is 1 per hour elapsed since last login.
- The admin user is exempt from stamina consumption (handled in app logic).
*/

-- Stamina table
CREATE TABLE IF NOT EXISTS user_stamina (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stamina int NOT NULL DEFAULT 50 CHECK (stamina >= 0 AND stamina <= 50),
  last_login_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_stamina ENABLE ROW LEVEL SECURITY;

-- Users can read their own stamina
DROP POLICY IF EXISTS "select_own_stamina" ON user_stamina;
CREATE POLICY "select_own_stamina" ON user_stamina FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- Users can insert their own stamina row (first login)
DROP POLICY IF EXISTS "insert_own_stamina" ON user_stamina;
CREATE POLICY "insert_own_stamina" ON user_stamina FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- Users can update their own stamina
DROP POLICY IF EXISTS "update_own_stamina" ON user_stamina;
CREATE POLICY "update_own_stamina" ON user_stamina FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- No delete policy — stamina rows are permanent

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_user_stamina_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_stamina_updated_at ON user_stamina;
CREATE TRIGGER trigger_user_stamina_updated_at
  BEFORE UPDATE ON user_stamina
  FOR EACH ROW
  EXECUTE FUNCTION update_user_stamina_updated_at();
