import Link from "next/link";
import type { Metadata } from "next";

import { loginAction } from "../actions";
import { CredentialsForm } from "../credentials-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <CredentialsForm
      title="Sign in"
      submitLabel="Sign in"
      action={loginAction}
      passwordAutoComplete="current-password"
      footer={
        <>
          Need an account?{" "}
          <Link href="/register" className="link link-primary">
            Create one
          </Link>
        </>
      }
    />
  );
}
