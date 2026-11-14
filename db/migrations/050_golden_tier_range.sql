-- 050_golden_tier_range.sql
-- El golden set usa tiers 1-4 (no solo 1-3).
ALTER TABLE admin.golden_cases
  DROP CONSTRAINT IF EXISTS golden_cases_tier_check;
ALTER TABLE admin.golden_cases
  ADD CONSTRAINT golden_cases_tier_check CHECK (tier BETWEEN 1 AND 6);
