User Roles and Permissions

There are six user roles in the portal:

Super Admin — The highest privilege level. Has all admin powers plus exclusive protections: no one can edit, delete, change the role, reset the password, or toggle scenario access for a super admin — not even another super admin. The scenario management switch is always disabled for super admins. Ricardo Cidale is the super admin.

Admin — Full access to everything. Can manage users (create, edit, delete, invite, reset passwords), configure settings, edit any property, access verification tools, and manage the AI agent (Rebecca). Admins always have full scenario access regardless of the scenario management toggle. Admins cannot modify super admin accounts in any way.

User — Can view the full portfolio, edit property assumptions, run scenarios, and use analysis tools. Users are the primary users of the financial model. An admin can toggle their Scenario Management switch: when ON, the user can create, edit, duplicate, and delete their own scenarios; when OFF, they can only view scenarios shared with them.

Checker — A specialized role focused on verification and audit. Checkers have user-level access plus the independent audit system and Checker Manual with formula documentation. The scenario management toggle applies to checkers the same way as regular users.

Partner — External partner role. Similar access to a standard user. Scenario management toggle applies the same way.

Investor — Read-only access to the portfolio and financial statements. Investors can view reports and shared scenarios but cannot change assumptions or create scenarios.

User Registration and Access Control

The portal is a closed system — there is no public sign-up page. Every user must be pre-approved and added by an admin through one of two methods:

1. Add User — The admin manually creates the account by entering the user's email, password, and role. The admin then shares the credentials directly with the user.

2. Invite Users — The admin enters one or more email addresses (up to 50 at a time), selects a role, and optionally adds a personal message. The system creates each account with a temporary password and sends a branded invitation email with login instructions. The recipient uses the temporary password to log in and should change it after first login.

Google sign-in is also locked down: even if someone tries to sign in with Google, they are rejected unless their email is already registered in the system.

Admin Actions on User Cards

Each user card in the admin panel shows:
- The user's name, email, title, and company
- A role badge (hover to see what the role allows)
- A Scenarios toggle with a help icon (hover to learn what it controls)
- Action icons (visible on hover for non-super-admin users):
  - Pencil: Edit the user's name, email, role, and company
  - Key: Set a new password for this user
  - House: Choose which properties this user sees by default
  - Trash: Permanently delete the user and all their data (not available for admin roles)
