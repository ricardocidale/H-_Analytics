import { SectionCard } from "@/components/ui/section-card";
import { ManualTable } from "@/components/ui/manual-table";
import { Callout } from "@/components/ui/callout";
import { IconShield } from "@/components/icons";interface SectionProps {
  expanded: boolean;
  onToggle: () => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}

export default function Section16Admin({ expanded, onToggle, sectionRef }: SectionProps) {
  return (
    <SectionCard
      id="admin"
      title="16. Admin Settings"
      icon={IconShield}
      variant="light"
      expanded={expanded}
      onToggle={onToggle}
      sectionRef={sectionRef}
    >
      <p className="text-sm text-muted-foreground">
        Admin Settings is available only to users with the Admin or Super Admin role. It provides system-wide configuration and management tools.
      </p>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Admin Tabs</h4>
        <ManualTable
          variant="light"
          headers={["Tab", "Purpose"]}
          rows={[
            ["Users", "Manage user accounts — create, invite, edit, assign roles, reset passwords, control scenario access, and set default properties"],
            ["Logos", "Upload and manage logos used across the portal and in exports"],
            ["Branding", "Configure colors, fonts, and visual identity for user groups"],
            ["Themes", "Manage the design themes available in the system"],
            ["Navigation", "Control which sidebar items are visible to different user roles"],
            ["Verification", "Run the financial verification engine and review audit results"],
            ["Activity", "View system activity logs and user actions"],
            ["Rebecca", "Configure the AI analytics assistant — knowledge base, guardrails, and analytics"],
            ["Database", "Database management tools for administrators"],
          ]}
        />
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">User Management</h4>
        <p className="text-sm text-muted-foreground mb-3">
          The portal uses a closed registration model — there is no public sign-up. Every user must be pre-approved and added by an admin. There are two ways to add users:
        </p>
        <ManualTable
          variant="light"
          headers={["Action", "What It Does"]}
          rows={[
            ["Add User", "Manually create an account with email, password, and role. You share the credentials directly with the user."],
            ["Invite Users", "Enter one or more email addresses (up to 50). The system creates accounts with temporary passwords and sends branded invitation emails with login instructions."],
          ]}
        />
        <p className="text-sm text-muted-foreground mt-3">
          Google sign-in is also restricted — only pre-registered email addresses can authenticate via Google OAuth.
        </p>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">User Card Actions</h4>
        <p className="text-sm text-muted-foreground mb-3">
          Each user card displays the user's name, email, role badge, and a Scenarios toggle. Hover over any element for a tooltip explaining what it does. Action icons appear on hover at the bottom of each card.
        </p>
        <ManualTable
          variant="light"
          headers={["Icon", "Action", "Description"]}
          rows={[
            ["Pencil", "Edit", "Change the user's name, email, role, and company"],
            ["Key", "Reset Password", "Set a new password for this user"],
            ["House", "Default Properties", "Choose which properties this user sees by default when they log in"],
            ["Trash", "Delete", "Permanently remove the user and all their data including scenarios (not available for admin roles)"],
          ]}
        />
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Scenario Management Toggle</h4>
        <p className="text-sm text-muted-foreground">
          Each user card includes a Scenarios switch. When ON, the user can create, edit, duplicate, and delete their own scenarios. When OFF, they can only view scenarios that have been shared with them. Admins always have full scenario access regardless of this setting. The toggle is disabled for Super Admin accounts since they cannot be modified.
        </p>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">User Roles</h4>
        <ManualTable
          variant="light"
          headers={["Role", "Access Level"]}
          rows={[
            ["Super Admin", "Full system access. Cannot be edited, deleted, or modified by anyone — including other super admins."],
            ["Admin", "Full access. Manages users, settings, properties, and the AI assistant. Cannot modify super admin accounts."],
            ["User", "Standard access. Views portfolio, edits property assumptions, runs scenarios (if scenario toggle is ON)."],
            ["Checker", "Auditor role. User-level access plus the verification system and Checker Manual."],
            ["Partner", "External partner. Similar to standard user access."],
            ["Investor", "Read-only. Views reports and shared scenarios but cannot edit any data."],
          ]}
        />
      </div>

      <Callout severity="info" variant="light">
        Super admin accounts have special protection. No one — not even another super admin — can edit, delete, change the role, reset the password, or toggle scenario access for a super admin user.
      </Callout>
    </SectionCard>
  );
}
