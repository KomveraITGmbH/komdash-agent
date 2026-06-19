import { z } from "zod";
import { passwordRules } from "./auth";

export const createUserSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  name: z.string().min(1, "Name is required").max(120),
  roleId: z.number().int().positive(),
  password: passwordRules,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  name: z.string().min(1, "Name is required").max(120),
  roleId: z.number().int().positive(),
  isActive: z.boolean(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const updateThemeSchema = z.object({
  themePreference: z.enum(["light", "dark"]),
});
export type UpdateThemeInput = z.infer<typeof updateThemeSchema>;

export const updateRolePermissionsSchema = z.object({
  permissions: z.array(z.string()),
});
export type UpdateRolePermissionsInput = z.infer<
  typeof updateRolePermissionsSchema
>;
