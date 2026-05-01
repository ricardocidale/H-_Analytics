-- Drop user_group_properties first (has FKs to user_groups and properties)
DROP TABLE IF EXISTS user_group_properties;

-- Remove the user_group_id FK column from users before dropping user_groups
-- (the column carries a FK constraint referencing user_groups.id)
ALTER TABLE users DROP COLUMN IF EXISTS user_group_id;

-- Now drop user_groups — no remaining FK references point to it
DROP TABLE IF EXISTS user_groups;
