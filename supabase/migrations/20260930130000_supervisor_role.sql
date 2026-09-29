-- Supervisor: sees everything and makes reports, can't change anything
-- (private.is_staff() lets any role read; private.can_write() is owner / storekeeper only).
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supervisor';
