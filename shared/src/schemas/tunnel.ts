import { z } from "zod";

export const createTunnelSessionSchema = z.object({
  agentId: z.number().int().positive(),
});
export type CreateTunnelSessionInput = z.infer<typeof createTunnelSessionSchema>;
