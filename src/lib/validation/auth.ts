import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const signupSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    email: z
      .string()
      .trim()
      .min(1, "Email is required")
      .email("Enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    passwordConfirmation: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: "Passwords do not match",
    path: ["passwordConfirmation"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;

/**
 * The two ways a client with no browser can get an access token, as one
 * request body (POST /api/v1/auth/token).
 *
 * A union rather than a `grant_type` field plus optional credentials:
 * which credential you sent *is* which grant you meant, and a body
 * carrying both a password and a refresh token is a mistake worth
 * rejecting rather than silently picking a winner from.
 *
 * `loginSchema` is deliberately not reused here — it backs a form and
 * owns form-shaped messages ("Enter a valid email address"), which is a
 * different audience from an API client.
 */
export const authTokenSchema = z.union([
  z.object({
    email: z.string().trim().email("A valid email is required"),
    password: z.string().min(1, "Password is required"),
  }),
  z.object({
    refreshToken: z.string().min(1, "Refresh token is required"),
  }),
]);

export type AuthTokenInput = z.infer<typeof authTokenSchema>;

export function isRefreshGrant(
  input: AuthTokenInput,
): input is { refreshToken: string } {
  return "refreshToken" in input;
}
