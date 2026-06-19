import { z } from "zod";

export const agentInputSchema = z.object({
  customerId: z.number().int().positive().nullable(),
  name: z.string().min(1, "Name is required").max(120),
  notes: z.string().max(5000).optional().or(z.literal("")),
});
export type AgentInput = z.infer<typeof agentInputSchema>;

export const mountKindEnum = z.enum(["local", "nfs", "smb", "other"]);

export const agentCheckinMountSchema = z.object({
  mountPoint: z.string().min(1).max(500),
  fsType: z.string().max(60).optional().or(z.literal("")),
  mountKind: mountKindEnum.default("local"),
  totalBytes: z.number().min(0).nullable().optional(),
  usedBytes: z.number().min(0).nullable().optional(),
  freeBytes: z.number().min(0).nullable().optional(),
});
export type AgentCheckinMount = z.infer<typeof agentCheckinMountSchema>;

export const agentCheckinSchema = z.object({
  hostname: z.string().max(255).optional().or(z.literal("")),
  internalIp: z.string().max(64).optional().or(z.literal("")),
  os: z.string().max(120).optional().or(z.literal("")),
  cpuPct: z.number().min(0).max(100).nullable().optional(),
  ramPct: z.number().min(0).max(100).nullable().optional(),
  uptimeSeconds: z.number().int().min(0).nullable().optional(),
  mounts: z.array(agentCheckinMountSchema).default([]),
  // Home Assistant auto-detection
  haDetected: z.boolean().optional().default(false),
  haUrl: z.string().max(500).nullable().optional(),
  haVersion: z.string().max(50).nullable().optional(),
});
export type AgentCheckinInput = z.infer<typeof agentCheckinSchema>;
