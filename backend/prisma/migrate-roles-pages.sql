-- Convert roles.name from enum RoleName to TEXT, add users.allowed_pages

-- 1. Add allowed_pages column if missing
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "allowed_pages" JSONB;

-- 2. Convert roles.name enum -> text (safe with existing data)
ALTER TABLE "roles" ALTER COLUMN "name" TYPE TEXT USING "name"::TEXT;

-- 3. Drop the RoleName enum type if it exists and is unused
DROP TYPE IF EXISTS "RoleName";
