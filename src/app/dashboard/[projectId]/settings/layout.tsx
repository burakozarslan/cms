import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { findProject } from "@/lib/projects/service";

type Params = { params: Promise<{ projectId: string }> };

/**
 * Project-level settings shell, mirroring `dashboard/settings/layout.tsx`'s
 * `TABS` pattern. Today's settings (`password`, `cloudinary`) are
 * tenant-level; API keys are scoped to one project, so they need their own
 * shell rather than a tab bolted onto the tenant one.
 */
export default async function ProjectSettingsLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Params["params"] }>) {
  const session = await requireSession();
  if (!session) redirect("/login");

  const { projectId } = await params;

  const project = await findProject(session.user.tenantId, projectId);
  if (!project) notFound();

  const TABS = [
    {
      href: `/dashboard/${projectId}/settings/api-keys`,
      label: "API keys",
    },
    {
      href: `/dashboard/${projectId}/settings/webhooks`,
      label: "Webhooks",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href={`/dashboard/${projectId}`}
          className="link link-primary text-sm"
        >
          ← {project.name}
        </Link>
        <h1 className="text-xl font-semibold">Project settings</h1>
      </div>

      <div className="flex flex-col gap-6 sm:flex-row">
        <nav
          className="flex shrink-0 flex-row gap-1 sm:w-48 sm:flex-col"
          aria-label="Project settings"
        >
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className="hover:bg-base-200 rounded-btn px-3 py-2 text-sm font-medium no-underline"
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
