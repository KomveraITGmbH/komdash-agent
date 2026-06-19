import { z } from "zod";

export const customerStatusEnum = z.enum(["active", "inactive", "prospect"]);

export const customerInputSchema = z.object({
  companyName: z.string().min(1, "Company name is required").max(200),
  contactPerson: z.string().max(200).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(50).optional().or(z.literal("")),
  mobile: z.string().max(50).optional().or(z.literal("")),
  address: z.string().max(255).optional().or(z.literal("")),
  postalCode: z.string().max(20).optional().or(z.literal("")),
  city: z.string().max(120).optional().or(z.literal("")),
  country: z.string().max(120).optional().or(z.literal("")),
  notes: z.string().max(5000).optional().or(z.literal("")),
  contractInfo: z.string().max(5000).optional().or(z.literal("")),
  status: customerStatusEnum.default("active"),
  tags: z.array(z.string().max(40)).default([]),
});
export type CustomerInput = z.infer<typeof customerInputSchema>;

export const customerNoteInputSchema = z.object({
  note: z.string().min(1, "Note cannot be empty").max(5000),
});
export type CustomerNoteInput = z.infer<typeof customerNoteInputSchema>;
