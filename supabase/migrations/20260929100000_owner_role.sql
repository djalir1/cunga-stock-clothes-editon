-- Owner: storekeeper powers + team management. Added on its own because a new
-- enum value can't be used in the same transaction that creates it.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'owner';
