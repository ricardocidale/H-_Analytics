# Chapter 11: User Profile

## Overview

The My Profile page allows authenticated users to manage their account information and credentials. It serves as the central identity management interface for all user roles.

---

## Profile Fields

The profile contains the following editable and display-only fields:

| Field | Editable | Notes |
|-------|----------|-------|
| **Email** | Yes (non-admin users) | Serves as the User ID; admin accounts display "Admin" and cannot modify this field |
| **Name** | Yes | Display name used throughout the application |
| **Company** | Yes | Organization or firm affiliation |
| **Title** | Yes | Professional title (e.g., Asset Manager, VP Acquisitions) |
| **Role** | No (display only) | Displayed beneath the user avatar; values: admin, partner, checker, or investor |
| **User Group** | No (admin assigns) | Group membership determines branding (company name, logo, theme). Assigned via Administration > User Groups |

Profile edits are saved via the save action in the page header. Admin users can update all fields except email, which is locked to "Admin." A success confirmation appears on save; errors are surfaced via notification.

---

## User Groups & Branding

Users can be assigned to a User Group by an admin. Each group defines:
- **Company Name** — displayed in the sidebar header and mobile header
- **Logo** — displayed in the sidebar
- **Theme** — visual theme override
- **Asset Description** — custom asset description

Branding resolution follows this priority:
- **Logo:** User Group → Company → System default (no per-user logo override)
- **Theme:** User's selected theme → User Group → System default
- **Asset Description:** User Group → System default (no per-user override)

---

## Changing Password

Password changes are handled via a separate form section on the profile page. The flow requires three inputs:

| Input | Purpose | Validation |
|-------|---------|------------|
| Current Password | Authenticate the change request | Must match stored hash |
| New Password | Desired replacement credential | Minimum 8 characters |
| Confirm Password | Prevent typographic errors | Must match New Password exactly |

Each password field includes a visibility toggle for user convenience. On successful change, all password fields are cleared and a confirmation notification is displayed.

---

## Checker Manual Access

Users with the checker or admin role see an additional action button on the profile page labeled "Checker Manual," which provides direct access to the in-app verification manual (this document set). Users with the partner or investor role do not see this button.

---

## Verification Notes for Checkers

| Check | What to Verify |
|-------|---------------|
| Field persistence | Edit name, company, and title → save → refresh page → confirm values persist |
| Email lock (admin) | Admin accounts should not be able to modify their email field |
| Password validation | Confirm that passwords shorter than 8 characters are rejected |
| Password mismatch | Confirm that mismatched new/confirm passwords produce an error notification |
| Role-based visibility | Log in as a partner or investor → confirm the Checker Manual button is not visible |
| Role-based visibility | Log in as checker or admin → confirm the Checker Manual button is visible and navigates correctly |
