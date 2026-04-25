# Browser test plan — admin photo album end-to-end

This plan exercises the admin-managed photo album shipped in task #422
(multi-select with move/copy between properties + bulk delete) end-to-end
against the live dev server.

The *executable* version of this plan lives in
`tests/playwright/photo-album.spec.ts` and is run via
`npx playwright test tests/playwright/photo-album.spec.ts` (CI-friendly).
This markdown file is the equivalent `runTest()` script for ad-hoc
agent-driven exploration.

It complements the headless API e2e test in
`tests/e2e/photo-album-flow.test.ts`, which covers the same upload →
move → bulk-delete round-trip without burning a real AI-enhance call.
The plan below additionally walks through the UI controls and the
Replicate-backed AI enhance → accept → reject loop.

## How to run

Use the agent testing skill (`runTest()`). It launches a Playwright-
based testing subagent against the running dev server. Auth is auto-
granted in dev because `server/dev-flags.ts` sets `DEV_SKIP_AUTH = true`,
so the subagent lands already authenticated as the seeded super_admin
(`ricardo.cidale@norfolkgroup.io`). No login step is needed in dev.

The non-admin viewer side of the contract — that an admin-only album
hides upload / generate / enhance / move / bulk-delete affordances when
`useAuth().isAdmin === false` — is covered by the happy-dom companion
`tests/client/photo-album-viewer-readonly.test.tsx`, which mocks
`@/lib/auth` to flip `isAdmin` off (the live dev server cannot easily
demote the seeded super_admin without restarting with `DEV_SKIP_AUTH=false`).

## Plan — admin happy path

```
1. [New Context] Create a new browser context.
2. [API] GET /api/properties (cookie from auto-login). Note the first
   two property ids in the response — call them propertyA and propertyB.
3. [Browser] Navigate to /property/${propertyA}/photos.
4. [Verify] The page renders:
   - data-testid="text-page-title" contains "Photos —"
   - the "Photo Album" heading is visible
   - either a "button-upload-photo" or "button-empty-upload" is visible
     (admin-only control proves DEV_SKIP_AUTH gave us super_admin).
5. [Browser] Click data-testid="button-upload-photo" (or
   "button-empty-upload" if the album was empty).
6. [Browser] In the upload dialog, drop a small PNG fixture (any
   placeholder, e.g. https://placehold.co/640x480.png is acceptable
   when the dialog supports URL upload; otherwise use the file input).
   Submit. Wait for the dialog to close and the new photo card to appear
   in the grid.
7. [Verify] A new "photo-card-<id>" tile is rendered. Note its id —
   call it newPhotoId.
8. [Browser] Hover the new photo card to expose hover affordances.
   Click its hero star (the button at the top-right of the card) so the
   card is marked hero (the `button-enhance-${newPhotoId}` button only
   renders for hero photos).
9. [Browser] Click data-testid="button-enhance-${newPhotoId}".
10. [Verify] The EnhancePreviewDialog opens (look for an "Enhance" /
    preview-style heading). Wait up to 90s — the request hits Replicate.
11. [Verify] After load, the dialog shows both an "original" and an
    "enhanced" preview image side-by-side, plus Accept and Reject
    buttons.
12. [Browser] Click Accept.
13. [Verify] Toast "Enhancement accepted" appears, and the photo card
    now displays "badge-enhanced-${newPhotoId}".
14. [Browser] Tick the checkbox in the bulk toolbar:
    - data-testid="checkbox-photo-${newPhotoId}"
15. [Verify] data-testid="bulk-toolbar" is visible and
    "text-selected-count" reads "1 of N selected".
16. [Browser] Click data-testid="button-bulk-move".
17. [Verify] data-testid="dialog-move-photos" opens with the radio
    group "radio-move-mode" defaulting to Move.
18. [Browser] Click data-testid="option-property-${propertyB}".
19. [Browser] Click data-testid="button-confirm-move".
20. [Verify] Toast "Photos moved" appears. The grid no longer contains
    "photo-card-${newPhotoId}" on Property A.
21. [Browser] Navigate to /property/${propertyB}/photos.
22. [Verify] "photo-card-${newPhotoId}" is now rendered on Property B.
23. [Browser] Tick data-testid="checkbox-photo-${newPhotoId}" on
    Property B.
24. [Browser] Click data-testid="button-bulk-delete".
25. [Verify] data-testid="dialog-bulk-delete" opens with the title
    "Delete 1 photo?".
26. [Browser] Click data-testid="button-confirm-bulk-delete".
27. [Verify] Toast "1 photo deleted" appears. The grid on Property B
    no longer contains "photo-card-${newPhotoId}".
```

## Why this plan exists

Task #422 added admin-managed multi-select with move/copy between
properties and bulk delete. The work shipped without an automated
e2e test, so this plan + the companion vitest e2e test in
`tests/e2e/photo-album-flow.test.ts` lock down the full happy path
so future refactors of `PhotoAlbumGrid.tsx`, `PhotoMoveDialog.tsx`,
or `server/routes/property-photos.ts` cannot silently regress the
admin workflow.

The non-admin viewer guard (no upload/enhance/delete/move buttons
when `isAdmin === false`) is covered by the runtime DOM scan in
`tests/client/photo-album-viewer-readonly.test.tsx`, which runs on
every PR via `npm test`.
