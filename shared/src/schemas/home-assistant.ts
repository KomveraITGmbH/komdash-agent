import { z } from "zod";

export const haInstallationTypeEnum = z.enum([
  "raspberry_pi",
  "linux_vm",
  "docker",
  "bare_metal",
]);

export const haInstanceInputSchema = z.object({
  customerId: z.number().int().positive().nullable(),
  agentId: z.number().int().positive().nullable().optional(),
  hostname: z.string().min(1, "Hostname is required").max(255),
  domain: z.string().min(1, "Domain is required").max(255),
  installationType: haInstallationTypeEnum,
  version: z.string().max(50).optional().or(z.literal("")),
  lastUpdate: z.string().optional().or(z.literal("")).nullable(),
  notes: z.string().max(5000).optional().or(z.literal("")),
  /** Long-lived access token. Omit or leave empty to keep the existing stored token. */
  apiToken: z.string().max(4000).optional().or(z.literal("")),
});
export type HaInstanceInput = z.infer<typeof haInstanceInputSchema>;

export const haTestConnectionSchema = z.object({
  domain: z.string().min(1, "Domain is required").max(255),
  apiToken: z.string().min(1, "Token is required").max(4000),
});
export type HaTestConnectionInput = z.infer<typeof haTestConnectionSchema>;
