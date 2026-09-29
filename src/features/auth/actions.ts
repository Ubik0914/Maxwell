"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, signupSchema } from "@/lib/validation/auth";
import { ErrorCode } from "@/lib/errors/codes";
import { safeNextPath } from "@/lib/navigation/safe-next";
import type { ActionResult } from "@/types/action-result";

export async function loginAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    if (error.code === "email_not_confirmed") {
      return {
        success: false,
        error: {
          code: ErrorCode.AUTH_EMAIL_NOT_CONFIRMED,
          message: "Please confirm your email before logging in.",
        },
      };
    }
    if (error.code === "invalid_credentials") {
      return {
        success: false,
        error: {
          code: ErrorCode.AUTH_INVALID_CREDENTIALS,
          message: "Incorrect email or password.",
        },
      };
    }
    return {
      success: false,
      error: { code: ErrorCode.UNKNOWN_ERROR, message: error.message },
    };
  }

  // The page that sent them here gets them back. Without one, the
  // front door is the library — the only thing a sign-in from /login
  // is assumed to be for.
  redirect(safeNextPath(formData.get("next")) ?? "/");
}

export async function signupAction(
  _prevState: ActionResult<{ requiresEmailConfirmation: boolean }> | null,
  formData: FormData,
): Promise<ActionResult<{ requiresEmailConfirmation: boolean }>> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    passwordConfirmation: formData.get("passwordConfirmation"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      },
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { name: parsed.data.name } },
  });

  if (error) {
    return {
      success: false,
      error: { code: ErrorCode.UNKNOWN_ERROR, message: error.message },
    };
  }

  if (data.session) {
    redirect("/");
  }

  return { success: true, data: { requiresEmailConfirmation: true } };
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
