import Link from "next/link";
import type { Metadata } from "next";

import { registerAction } from "../actions";
import { CredentialsForm } from "../credentials-form";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <CredentialsForm
      title="Create your account"
      submitLabel="Create account"
      action={registerAction}
      passwordAutoComplete="new-password"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="link link-primary">
            Sign in
          </Link>
        </>
      }
    />
  );
}
