import { z } from "zod";

export const monitoringStatusEnum = z.enum(["online", "offline", "warning", "critical"]);
