---
name: notifications
description: Alert rules engine with metric thresholds, cooldowns, and Resend email delivery. Covers CRUD for alert rules, notification logs, user preferences, report sharing, and scenario summary emails. Load when working on notifications, email, or alert configuration.
---

# Notifications & Alert System

## Purpose

Documents the notification system that provides alert rules with configurable metric thresholds, multi-channel delivery via Resend email, notification logging, per-user preferences, and report/scenario email sharing.

## Key Files

| File | Purpose |
|------|---------|
| `server/routes/notifications.ts` | API routes: alert rules CRUD, logs, settings, preferences, sharing |
| `server/integrations/resend.ts` | Resend email: `testResendConnection()`, `sendReportShareEmail()`, `sendScenarioSummaryEmail()` |
| `shared/schema.ts` | `insertAlertRuleSchema`, notification tables |

## Architecture

```
Admin → Alert Rules CRUD
  ↓
Alert Rule Engine (metric threshold + cooldown)
  ↓
Notification dispatch:
  ├── Email (Resend API)
  └── In-app notification log
  ↓
notification_logs table (audit trail)
```

## Alert Rules

Admin-configurable rules with:
- **Metric**: What to monitor (e.g., occupancy, NOI, cash balance)
- **Threshold**: Value that triggers the alert
- **Comparison**: Above/below threshold
- **Cooldown**: Minimum time between repeated alerts
- **Channel**: Delivery method (email, in-app)
- **Enabled**: Toggle on/off

Validated with `insertAlertRuleSchema` (Zod).

## API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/notifications/alert-rules` | GET | requireAdmin | List all alert rules |
| `/api/notifications/alert-rules` | POST | requireAdmin | Create alert rule |
| `/api/notifications/alert-rules/:id` | PATCH | requireAdmin | Update alert rule |
| `/api/notifications/alert-rules/:id` | DELETE | requireAdmin | Delete alert rule |
| `/api/notifications/logs` | GET | requireAdmin | Fetch notification logs |
| `/api/notifications/settings` | GET | requireAdmin | Get notification settings |
| `/api/notifications/settings` | PUT | requireAdmin | Update notification settings |
| `/api/notifications/preferences` | GET | requireAuth | Get user preferences |
| `/api/notifications/preferences` | PUT | requireAuth | Update user preference |
| `/api/notifications/test-resend` | POST | requireAdmin | Test Resend connection |
| `/api/notifications/share-report` | POST | requireAuth | Share report via email |
| `/api/notifications/share-scenario` | POST | requireAuth | Share scenario summary via email |

## Notification Settings (admin-level)

Key-value pairs stored via `storage.setNotificationSetting()`. Controls system-wide behavior like default sender address, enabled channels, etc.

## User Preferences

Per-user opt-in/out for specific event types and channels:

```typescript
{ eventType: string, channel: string, enabled: boolean }
```

Stored via `storage.upsertNotificationPreference(userId, eventType, channel, enabled)`.

## Email Integration (Resend)

| Function | Purpose |
|----------|---------|
| `testResendConnection()` | Verify Resend API key is valid |
| `sendReportShareEmail()` | Share property report with metrics, optional attachment |
| `sendScenarioSummaryEmail()` | Share scenario summary |

Report sharing accepts: recipient email, property name, metrics object, optional message, optional base64 attachment.

## Notification Logs

All sent notifications are logged in `notification_logs` table:
- Event type (e.g., `REPORT_SHARED`, `ALERT_TRIGGERED`)
- Channel (email, in-app)
- Recipient
- Subject
- Status (sent, failed)
- Timestamp

Admin can view logs via `/api/notifications/logs?limit=100`.

## Related Skills

- `.claude/skills/admin/SKILL.md` — Admin Notifications tab
- `.claude/skills/market-intelligence/adding-integrations.md` — Resend as integration service
