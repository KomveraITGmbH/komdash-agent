export type MountKind = "local" | "nfs" | "smb" | "other";

export interface AgentCheckinMount {
  mountPoint: string;
  fsType?: string;
  mountKind: MountKind;
  totalBytes?: number | null;
  usedBytes?: number | null;
  freeBytes?: number | null;
}

export interface AgentCheckinInput {
  hostname?: string;
  internalIp?: string;
  os?: string;
  cpuPct?: number | null;
  ramPct?: number | null;
  uptimeSeconds?: number | null;
  mounts: AgentCheckinMount[];
  haDetected?: boolean;
  haUrl?: string | null;
  haVersion?: string | null;
}
