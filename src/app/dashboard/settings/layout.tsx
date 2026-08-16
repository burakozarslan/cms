import Link from "next/link";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";

// A flat list today — the shell is structured to grow more tabs (profile,
// preferences, ...) without a route/layout rewrite.
const TABS = [
  { href: "/dashboard/settings/password", label: "Password" },
  { href: "/dashboard/settings/cloudinary", label: "Media" },
];

export default async function SettingsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireSession();
  if (!session) redirect("/login");

  return (
    <div className="flex flex-col gap-6 sm:flex-row">
      <nav
        className="flex shrink-0 flex-row gap-1 sm:w-48 sm:flex-col"
        aria-label="Settings"
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
  );
}
