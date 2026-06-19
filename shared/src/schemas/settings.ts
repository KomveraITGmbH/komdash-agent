import { z } from "zod";

export const monitoringThresholdsSchema = z.object({
  storageWarningPct: z.number().int().min(1).max(100),
  storageCriticalPct: z.number().int().min(1).max(100),
  agentOfflineAfterSeconds: z.number().int().min(30).max(86400),
});
export type MonitoringThresholdsInput = z.infer<typeof monitoringThresholdsSchema>;
