---
name: admin-api-routes
description: Complete list of admin API endpoints used by Admin.tsx tab components. Reference this when building tab components to ensure correct fetch URLs, methods, and payloads.
---

# Admin API Routes

## User Management
| Method | Route | Used By | Body |
|--------|-------|---------|------|
| GET | `/api/admin/users` | UsersTab, UserGroupsTab, BrandingTab | - |
| POST | `/api/admin/users` | UsersTab | `{ email, password, firstName?, lastName?, company?, title?, role? }` |
| PATCH | `/api/admin/users/:id` | UsersTab | `{ email?, firstName?, lastName?, company?, title?, role? }` |
| DELETE | `/api/admin/users/:id` | UsersTab | - |
| PATCH | `/api/admin/users/:id/password` | UsersTab | `{ password }` |
| PATCH | `/api/admin/users/:id/group` | UserGroupsTab | `{ groupId }` |
| POST | `/api/admin/reset-all-passwords` | UsersTab | - |

## Companies
| Method | Route | Used By | Body |
|--------|-------|---------|------|
| GET | `/api/admin/companies` | CompaniesTab | - |
| POST | `/api/admin/companies` | CompaniesTab | `{ name, type, description?, logoId? }` |
| PATCH | `/api/admin/companies/:id` | CompaniesTab | `{ name?, type?, description?, logoId? }` |
| DELETE | `/api/admin/companies/:id` | CompaniesTab | - |

## Logos
| Method | Route | Used By | Body |
|--------|-------|---------|------|
| GET | `/api/admin/logos` | LogosTab, BrandingTab, CompaniesTab, UserGroupsTab | - |
| POST | `/api/admin/logos` | LogosTab | `{ name, companyName, url }` |
| DELETE | `/api/admin/logos/:id` | LogosTab | - |

## User Groups
| Method | Route | Used By | Body |
|--------|-------|---------|------|
| GET | `/api/admin/user-groups` | UserGroupsTab, BrandingTab | - |
| POST | `/api/admin/user-groups` | UserGroupsTab | `{ name, logoId?, themeId?, assetDescriptionId? }` |
| PATCH | `/api/admin/user-groups/:id` | UserGroupsTab | `{ name?, logoId?, themeId?, assetDescriptionId? }` |
| DELETE | `/api/admin/user-groups/:id` | UserGroupsTab | - |

## Asset Descriptions
| Method | Route | Used By | Body |
|--------|-------|---------|------|
| GET | `/api/admin/asset-descriptions` | BrandingTab, UserGroupsTab | - |
| POST | `/api/admin/asset-descriptions` | BrandingTab | `{ name }` |
| DELETE | `/api/admin/asset-descriptions/:id` | BrandingTab | - |

## Activity & Sessions
| Method | Route | Used By | Body |
|--------|-------|---------|------|
| GET | `/api/admin/login-logs` | ActivityTab | - |
| GET | `/api/admin/activity-logs?limit=50&entityType=X&userId=Y` | ActivityTab | - |
| GET | `/api/admin/checker-activity` | ActivityTab | - |
| GET | `/api/admin/active-sessions` | ActivityTab | - |
| DELETE | `/api/admin/sessions/:id` | ActivityTab | - |

## Verification
| Method | Route | Used By | Body |
|--------|-------|---------|------|
| GET | `/api/admin/run-verification` | VerificationTab | - |
| POST | `/api/admin/ai-verification` | VerificationTab (SSE stream) | - |
| GET | `/api/admin/verification-history?limit=10` | VerificationTab | - |
| GET | `/api/admin/run-design-check` | VerificationTab | - |

## Database
| Method | Route | Used By | Body |
|--------|-------|---------|------|
| GET | `/api/admin/sync-status` | DatabaseTab | - |
| POST | `/api/admin/seed-production` | DatabaseTab | `{}` |

## Global Assumptions (shared)
| Method | Route | Used By | Body |
|--------|-------|---------|------|
| GET | `/api/global-assumptions` | NavigationTab, BrandingTab, VerificationTab | - |
| POST | `/api/global-assumptions` | NavigationTab, BrandingTab | `{ ...updates }` |

## Design Themes
| Method | Route | Used By | Body |
|--------|-------|---------|------|
| GET | `/api/design-themes` | UserGroupsTab, BrandingTab | - |

## Properties (for verification)
| Method | Route | Used By | Body |
|--------|-------|---------|------|
| GET | `/api/properties` | VerificationTab | - |

## Notes
- All routes require `credentials: "include"` for auth cookies
- All POST/PATCH routes need `Content-Type: application/json` header
- Error responses return `{ error: "message" }` JSON
- AI verification uses Server-Sent Events (SSE) streaming
- Note: `admin/marcela/` route paths and DB columns keep `marcela_*` names per decision; only UI labels use dynamic `aiAgentName`
