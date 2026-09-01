import type { Metadata } from "next";

import { Card, CardBody, CardTitle } from "@frontend/ui";

import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Password" };

export default function PasswordSettingsPage() {
  return (
    <Card className="bg-base-100 max-w-md shadow-sm">
      <CardBody className="gap-4">
        <CardTitle>Password</CardTitle>
        <p className="text-base-content/70 text-sm">
          Change the password used to sign in to your account.
        </p>
        <ChangePasswordForm />
      </CardBody>
    </Card>
  );
}
