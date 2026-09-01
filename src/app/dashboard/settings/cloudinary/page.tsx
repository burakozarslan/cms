import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardBody, CardTitle } from "@frontend/ui";

import { requireSession } from "@/lib/auth";
import { getMediaConfigStatus } from "@/lib/media-config/service";

import { CloudinaryConfigForm } from "./cloudinary-config-form";

export const metadata: Metadata = { title: "Media" };

export default async function CloudinarySettingsPage() {
  const session = await requireSession();
  if (!session) redirect("/login");

  const status = await getMediaConfigStatus(session.user.tenantId);

  return (
    <Card className="bg-base-100 max-w-md shadow-sm">
      <CardBody className="gap-4">
        <CardTitle>Media (Cloudinary)</CardTitle>
        <p className="text-base-content/70 text-sm">
          Connect the Cloudinary account this project uses for media storage.
        </p>
        <CloudinaryConfigForm status={status} />
      </CardBody>
    </Card>
  );
}
