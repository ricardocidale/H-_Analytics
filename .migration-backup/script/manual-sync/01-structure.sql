-- =============================================================================
-- SCRIPT 1: Structure (Companies, Logos, User Groups, Themes)
-- Safe to run anytime. Does NOT touch properties or assumptions.
-- =============================================================================

INSERT INTO companies (id, name, type, description, logo_id, is_active) OVERRIDING SYSTEM VALUE VALUES
  (1, 'Hospitality Business Group', 'management', 'Management company overseeing all hotel SPVs', 1, TRUE),
  (2, 'HBG Property 1 LLC', 'spv', 'SPV for first hotel property', 2, TRUE),
  (3, 'HBG Property 2 LLC', 'spv', 'SPV for second hotel property', 3, TRUE)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, type = EXCLUDED.type, description = EXCLUDED.description,
  logo_id = EXCLUDED.logo_id, is_active = EXCLUDED.is_active;

INSERT INTO logos (id, name, url, is_default, company_name) OVERRIDING SYSTEM VALUE VALUES
  (1, 'Hospitality Business Group', '/logos/default-hbg.png', TRUE, 'Hospitality Business Group'),
  (2, 'Norfolk AI - Blue', '/logos/norfolk-ai-blue.png', FALSE, 'Hospitality Business Group'),
  (3, 'Norfolk AI - Yellow', '/logos/norfolk-ai-yellow.png', FALSE, 'Hospitality Business Group'),
  (4, 'Norfolk AI - Wireframe', '/logos/norfolk-ai-wireframe.png', FALSE, 'Hospitality Business Group')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, url = EXCLUDED.url, is_default = EXCLUDED.is_default,
  company_name = EXCLUDED.company_name;

INSERT INTO user_groups (id, name, logo_id, theme_id, asset_description_id, is_default) OVERRIDING SYSTEM VALUE VALUES
  (1, 'KIT Group', NULL, NULL, NULL, FALSE),
  (2, 'Norfolk Group', NULL, NULL, NULL, FALSE),
  (3, 'General', NULL, NULL, NULL, TRUE)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, is_default = EXCLUDED.is_default;

INSERT INTO design_themes (id, name, description, is_default, colors) OVERRIDING SYSTEM VALUE VALUES
  (1, 'Fluid Glass', 'Inspired by Apple''s iOS design language, Fluid Glass creates a sense of depth and dimension through translucent layers, subtle gradients, and smooth animations. The design emphasizes content while maintaining visual hierarchy through careful use of blur effects and glass-like surfaces.', TRUE, '[{"name": "Sage Green", "rank": 1, "hexCode": "#9FBCA4", "description": "PALETTE: Secondary accent for subtle highlights, card borders, and supporting visual elements."}, {"name": "Deep Green", "rank": 2, "hexCode": "#257D41", "description": "PALETTE: Primary brand color for main action buttons, active navigation items, and key highlights."}, {"name": "Warm Cream", "rank": 3, "hexCode": "#FFF9F5", "description": "PALETTE: Light background for page backgrounds, card surfaces, and warm accents."}, {"name": "Deep Black", "rank": 4, "hexCode": "#0a0a0f", "description": "PALETTE: Dark theme background for navigation sidebars, dark glass panels, and login screens."}, {"name": "Salmon", "rank": 5, "hexCode": "#F4795B", "description": "PALETTE: Accent color for warnings, notifications, and emphasis highlights."}, {"name": "Yellow Gold", "rank": 6, "hexCode": "#F59E0B", "description": "PALETTE: Accent color for highlights, badges, and attention-drawing elements."}, {"name": "Chart Blue", "rank": 1, "hexCode": "#3B82F6", "description": "CHART: Primary chart line color for revenue and key financial metrics."}, {"name": "Chart Red", "rank": 2, "hexCode": "#EF4444", "description": "CHART: Secondary chart line color for expenses and cost-related metrics."}, {"name": "Chart Purple", "rank": 3, "hexCode": "#8B5CF6", "description": "CHART: Tertiary chart line color for cash flow and profitability metrics."}]'),
  (5, 'Indigo Blue', 'A bold, professional theme centered on deep indigo-blue tones with cool steel accents. Conveys trust, authority, and modern sophistication — ideal for investor-facing presentations.', FALSE, '[{"name": "Indigo", "rank": 1, "hexCode": "#4F46E5", "description": "PALETTE: Primary brand color for main action buttons, active navigation items, and key highlights."}, {"name": "Deep Navy", "rank": 2, "hexCode": "#1E1B4B", "description": "PALETTE: Dark theme background for navigation sidebars, dark glass panels, and login screens."}, {"name": "Ice White", "rank": 3, "hexCode": "#F0F4FF", "description": "PALETTE: Light background for page backgrounds, card surfaces, and cool accents."}, {"name": "Steel Blue", "rank": 4, "hexCode": "#64748B", "description": "PALETTE: Secondary accent for subtle highlights, card borders, and supporting visual elements."}, {"name": "Coral", "rank": 5, "hexCode": "#F43F5E", "description": "PALETTE: Accent color for warnings, notifications, and emphasis highlights."}, {"name": "Amber", "rank": 6, "hexCode": "#F59E0B", "description": "PALETTE: Accent color for highlights, badges, and attention-drawing elements."}, {"name": "Chart Indigo", "rank": 1, "hexCode": "#6366F1", "description": "CHART: Primary chart line color for revenue and key financial metrics."}, {"name": "Chart Teal", "rank": 2, "hexCode": "#14B8A6", "description": "CHART: Secondary chart line color for expenses and cost-related metrics."}, {"name": "Chart Violet", "rank": 3, "hexCode": "#A855F7", "description": "CHART: Tertiary chart line color for cash flow and profitability metrics."}]')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  is_default = EXCLUDED.is_default, colors = EXCLUDED.colors;
