import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 8;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."));

export const credentialsSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(
      MIN_PASSWORD_LENGTH,
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    ),
});

export type Credentials = z.infer<typeof credentialsSchema>;

/**
 * Login only checks that something was submitted — length rules belong to
 * registration. Rejecting a short password here would leak that no account
 * could exist with it.
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});
