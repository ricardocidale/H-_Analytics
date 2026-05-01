-- =============================================================================
-- SCRIPT 6: Reset Sequences
-- Run this LAST, after all other scripts, to ensure auto-increment IDs
-- don't collide with the manually-inserted rows.
-- =============================================================================

SELECT setval('companies_id_seq', (SELECT COALESCE(MAX(id), 1) FROM companies));
SELECT setval('logos_id_seq', (SELECT COALESCE(MAX(id), 1) FROM logos));
SELECT setval('user_groups_id_seq', (SELECT COALESCE(MAX(id), 1) FROM user_groups));
SELECT setval('design_themes_id_seq', (SELECT COALESCE(MAX(id), 1) FROM design_themes));
SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM users));
SELECT setval('global_assumptions_id_seq', (SELECT COALESCE(MAX(id), 1) FROM global_assumptions));
SELECT setval('properties_id_seq', (SELECT COALESCE(MAX(id), 1) FROM properties));
SELECT setval('property_fee_categories_id_seq', (SELECT COALESCE(MAX(id), 1) FROM property_fee_categories));
SELECT setval('market_research_id_seq', (SELECT COALESCE(MAX(id), 1) FROM market_research));
SELECT setval('research_questions_id_seq', (SELECT COALESCE(MAX(id), 1) FROM research_questions));
SELECT setval('saved_searches_id_seq', (SELECT COALESCE(MAX(id), 1) FROM saved_searches));
SELECT setval('scenarios_id_seq', (SELECT COALESCE(MAX(id), 1) FROM scenarios));
SELECT setval('verification_runs_id_seq', (SELECT COALESCE(MAX(id), 1) FROM verification_runs));
