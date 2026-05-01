-- =============================================================================
-- SCRIPT 2: Users
-- Syncs all 8 user accounts. Passwords are overridden by environment
-- variables on startup anyway (seedAdminUser), so hash values here don't
-- matter much — but the roles, names, groups, and emails will be set.
-- =============================================================================

INSERT INTO users (id, email, password_hash, role, first_name, last_name, company, company_id, title, user_group_id, selected_theme_id) OVERRIDING SYSTEM VALUE VALUES
  (1, 'admin', '$2b$12$LEFrDu6a77FlYOEDQeKtU.TQHAkpW9iFs8E0e/Awt6F.PfiRK9UUO', 'admin', 'Ricardo', 'Cidale', 'Norfolk Group', NULL, 'Partner', 2, NULL),
  (2, 'rosario@kitcapital.com', '$2b$12$Mu44raajtDj0ziaX9rBrze37JJei1rd7.zKAYzEZKrXlYYT/qqL4q', 'partner', 'Rosario', 'David', 'KIT Capital', NULL, 'COO', 1, NULL),
  (4, 'kit@kitcapital.com', '$2b$12$Rdwzg7sKCitjg1uh.9XTh.PHuhkDpjyMMQYoyPd1LnTwuAeagXjku', 'partner', 'Dov', 'Tuzman', 'KIT Capital', NULL, 'Principal', 1, NULL),
  (6, 'checker@norfolkgroup.io', '$2b$12$W.PjaLvNEaABPiCgl5BarOR06IGkAQlHFalWYQuLxzZSnJa.iOMaO', 'checker', 'Checker', NULL, 'Norfolk AI', NULL, 'Checker', 2, NULL),
  (8, 'reynaldo.fagundes@norfolk.ai', '$2b$12$aydqk0KCG53UqgPfTPjfc.8D2dG3/be0oVvDfjqOogd80FUhIYAL2', 'partner', 'Reynaldo', 'Fagundes', 'Norfolk AI', NULL, 'CTO', 2, NULL),
  (9, 'lemazniku@icloud.com', '$2b$12$3NeyqaN1WO1Du7BBE15UUuDuXFyA2FdoagYnrRIGxyfXILt0xsQES', 'partner', 'Lea', 'Mazniku', 'KIT Capital', NULL, 'Partner', 1, NULL),
  (10, 'leslie@cidale.com', '$2b$12$qteDJQIl0arFbXeTX9F9sedImkyb8fybK1GuIbBq/fkRpiZgQWWoy', 'partner', 'Leslie', 'Cidale', 'Numeratti Endeavors', NULL, 'Senior Partner', 3, NULL),
  (11, 'wlaruffa@gmail.com', '$2b$12$zgCQMEpmemJfZcazxUXshu4P5yK1OsIdRdEWgTFSiNA2xiOKHS1xC', 'partner', 'William', 'Laruffa', 'Independent', NULL, 'Partner', 3, NULL)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email, role = EXCLUDED.role, first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name, company = EXCLUDED.company, title = EXCLUDED.title,
  user_group_id = EXCLUDED.user_group_id;
