"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/lib/auth";
import { registerTenant } from "@/lib/tenants/register";

export type AuthFormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

const DASHBOARD = "/dashboard";

export async function registerAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const result = await registerTenant({ email, password });

  if (!result.ok) {
    if (result.error === "EMAIL_TAKEN") {
      return { error: "An account with that email already exists." };
    }
    return { fieldErrors: result.fieldErrors };
  }

  // Throws NEXT_REDIRECT on success — must not be caught here.
  await signIn("credentials", { email, password, redirectTo: DASHBOARD });
  return {};
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("credentials", { email, password, redirectTo: DASHBOARD });
  } catch (error) {
    // A deliberately generic message: saying which field was wrong would reveal
    // whether an account exists for that email.
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    // NEXT_REDIRECT and anything else must propagate.
    throw error;
  }

  return {};
}
