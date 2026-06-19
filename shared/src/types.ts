import type { PermissionKey } from "./permissions";

export type ThemePreference = "light" | "dark";

export interface PublicUser {
  id: number;
  email: string;
  name: string;
  roleId: number;
  roleName: string;
  themePreference: ThemePreference;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Role {
  id: number;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: PermissionKey[];
}

export interface AuditLogEntry {
  id: number;
  userId: number | null;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export type CustomerStatus = "active" | "inactive" | "prospect";

export interface Customer {
  id: number;
  customerNumber: string;
  companyName: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  contractInfo: string | null;
  status: CustomerStatus;
  tags: string[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerNote {
  id: number;
  customerId: number;
  userId: number | null;
  userName: string | null;
  note: string;
  createdAt: string;
}

export type MonitoringStatus = "online" | "offline" | "warning" | "critical";

export interface MonitoringSnapshot {
  status: MonitoringStatus;
  cpuPct: number | null;
  ramPct: number | null;
  diskPct: number | null;
  networkInKbps: number | null;
  networkOutKbps: number | null;
  uptimeSeconds: number | null;
  recordedAt: string | null;
}

export type HaInstallationType =
  | "raspberry_pi"
  | "linux_vm"
  | "docker"
  | "bare_metal";

export interface HomeAssistantInstance {
  id: number;
  customerId: number | null;
  customerName: string | null;
  agentId: number | null;
  agentName: string | null;
  hostname: string;
  domain: string;
  installationType: HaInstallationType;
  version: string | null;
  lastUpdate: string | null;
  notes: string | null;
  deviceCount: number | null;
  entityCount: number | null;
  automationCount: number | null;
  backupStatus: BackupStatus;
  backupInfo: Record<string, unknown> | null;
  hasApiToken: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  createdAt: string;
  monitoring: MonitoringSnapshot;
}

export type BackupStatus = "ok" | "warning" | "failed" | "unknown";

export type MountKind = "local" | "nfs" | "smb" | "other";
export type StorageHealthStatus = "ok" | "warning" | "critical" | "unreachable";

export interface StorageMount {
  id: number;
  agentId: number;
  mountPoint: string;
  fsType: string | null;
  mountKind: MountKind;
  totalBytes: number | null;
  usedBytes: number | null;
  freeBytes: number | null;
  usagePct: number | null;
  healthStatus: StorageHealthStatus;
  lastSeenAt: string | null;
}

export interface Agent {
  id: number;
  customerId: number | null;
  customerName: string | null;
  name: string;
  hostname: string | null;
  internalIp: string | null;
  os: string | null;
  status: MonitoringStatus;
  cpuPct: number | null;
  ramPct: number | null;
  uptimeSeconds: number | null;
  lastSeenAt: string | null;
  notes: string | null;
  createdAt: string;
  storageMounts: StorageMount[];
  // Home Assistant detection
  haDetected: boolean;
  haUrl: string | null;
  haVersion: string | null;
  haLastSeenAt: string | null;
  // Whether this agent currently has an active WebSocket tunnel connection
  tunnelConnected: boolean;
}

export type TunnelSessionStatus = "active" | "ended" | "expired";

export interface TunnelSession {
  id: number;
  token: string;
  agentId: number;
  agentName: string | null;
  userId: number;
  userName: string | null;
  haUrl: string;
  status: TunnelSessionStatus;
  startedAt: string;
  lastActivityAt: string;
  endedAt: string | null;
  remoteIp: string | null;
  requestCount: number;
}

export interface DashboardStats {
  totalCustomers: number;
  haInstances: number;
  agents: number;
  onlineSystems: number;
  offlineSystems: number;
  warningSystems: number;
  recentActivity: AuditLogEntry[];
}

export interface MonitoringThresholds {
  storageWarningPct: number;
  storageCriticalPct: number;
  agentOfflineAfterSeconds: number;
}

export type MonitoringTargetType = "ha" | "agent" | "storage_mount";

export interface MonitoringSeriesPoint {
  recordedAt: string;
  cpuPct: number;
  ramPct: number;
  diskPct: number;
  networkInKbps: number;
  networkOutKbps: number;
  status: MonitoringStatus;
}
