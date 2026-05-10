-- Task #1299: Remove the user_page_visits table.
-- The usePageVisit hook and /api/page-visit/* routes have been removed.
-- The banner-first-visit feature that required this table is gone.
DROP TABLE IF EXISTS "user_page_visits";
