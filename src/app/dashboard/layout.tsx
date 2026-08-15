import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@frontend/ui";
import { requireSession, signOut } from "@/lib/auth";

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Middleware already guards /dashboard/**; this is the server-side backstop
  // that also gives pages a guaranteed session to read the tenant from.
  const session = await requireSession();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen">
      <nav className="navbar bg-base-100 border-base-content/10 border-b">
        <div className="navbar-start">
          <Link href="/dashboard" className="link link-neutral text-base font-semibold no-underline">
            CMS
          </Link>
        </div>
        <div className="navbar-end gap-3">
          <span className="text-base-content/70 hidden text-sm sm:inline">
            {session.user.email}
          </span>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-4xl p-4 sm:p-6">{children}</main>
    </div>
  );
}
