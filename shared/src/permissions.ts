/**
 * Canonical permission keys. The set is fixed in code (it maps to actual
 * guarded operations) but which roles hold which permissions is configurable
 * via the Roles & Permissions settings page and stored in `role_permissions`.
 */
export const PERMISSION_KEYS = [
  "users.create",
  "users.edit",
  "users.delete",
  "customers.manage",
  "home_assistant.manage",
  "agents.manage",
  "monitoring.manage",
  "reports.view",
  "settings.manage",
  "tunnel.access",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  "users.create": "Create users",
  "users.edit": "Edit users",
  "users.delete": "Delete users",
  "customers.manage": "Manage customers",
  "home_assistant.manage": "Manage Home Assistant",
  "agents.manage": "Manage KomDash Agents",
  "monitoring.manage": "Manage monitoring",
  "reports.view": "View reports",
  "settings.manage": "Manage settings",
  "tunnel.access": "Remote tunnel access (Open Home Assistant)",
};

export const SYSTEM_ROLES = [
  "Superadmin",
  "Admin",
  "Techniker",
  "Support",
  "Read Only",
] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];

/** Default permission grants seeded for each built-in role. */
export const DEFAULT_ROLE_PERMISSIONS: Record<SystemRole, PermissionKey[]> = {
  Superadmin: [...PERMISSION_KEYS],
  Admin: [
    "users.create",
    "users.edit",
    "users.delete",
    "customers.manage",
    "home_assistant.manage",
    "agents.manage",
    "monitoring.manage",
    "reports.view",
    "settings.manage",
  ],
  Techniker: [
    "customers.manage",
    "home_assistant.manage",
    "agents.manage",
    "monitoring.manage",
    "reports.view",
    "tunnel.access",
  ],
  Support: ["customers.manage", "monitoring.manage", "reports.view"],
  "Read Only": ["reports.view"],
};
