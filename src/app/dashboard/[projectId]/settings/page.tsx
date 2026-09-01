import { redirect } from "next/navigation";

type Params = { params: Promise<{ projectId: string }> };

export default async function ProjectSettingsIndexPage({ params }: Params) {
  const { projectId } = await params;
  redirect(`/dashboard/${projectId}/settings/api-keys`);
}
