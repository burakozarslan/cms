import Link from "next/link";
import { redirect } from "next/navigation";

import { Button, Dropdown, DropdownItem } from "@frontend/ui";
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
          <Dropdown
            trigger={
              <div className="btn btn-ghost btn-sm font-normal text-base-content/70 hover:text-base-content flex items-center gap-1.5 px-2">
                <span>{session.user.email}</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="size-4 opacity-60"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            }
          >
            <DropdownItem>
              <Link href="/dashboard/settings">Settings</Link>
            </DropdownItem>
            <DropdownItem>
              <form action={signOutAction}>
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                >
                  Sign out
                </Button>
              </form>
            </DropdownItem>
          </Dropdown>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-4xl p-4 sm:p-6">{children}</main>
    </div>
  );
}
