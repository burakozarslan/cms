import Link from "next/link";
import { redirect } from "next/navigation";

import { Button, Dropdown, DropdownItem } from "@frontend/ui";
import { requireSession } from "@/lib/auth";

import { signOutAction } from "./actions";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Middleware already guards /dashboard/**; this is the server-side backstop
  // that also gives pages a guaranteed session to read the tenant from.
  const session = await requireSession();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-base-200/50 flex flex-col">
      <header className="sticky top-0 z-40 w-full backdrop-blur transition-all duration-300">
        <nav className="navbar bg-base-100/80 border-b border-base-content/10 shadow-sm px-4 sm:px-8 h-16 transition-all">
          <div className="navbar-start">
            <Link 
              href="/dashboard" 
              className="text-xl font-bold tracking-tight bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent hover:opacity-80 transition-opacity"
            >
              CMS
            </Link>
          </div>
          <div className="navbar-end gap-4">
            <Dropdown
              trigger={
                <div className="btn btn-ghost btn-sm font-medium text-base-content/80 hover:text-base-content hover:bg-base-content/5 flex items-center gap-2 px-3 py-1.5 rounded-full transition-all duration-300">
                  <span className="text-sm">{session.user.email}</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="size-4 opacity-70"
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
                <Link href="/dashboard/settings" className="w-full text-sm font-medium hover:text-primary transition-colors">Settings</Link>
              </DropdownItem>
              <DropdownItem>
                <form action={signOutAction} className="w-full">
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-error hover:bg-error/10 hover:text-error transition-colors"
                  >
                    Sign out
                  </Button>
                </form>
              </DropdownItem>
            </Dropdown>
          </div>
        </nav>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto p-4 sm:p-8 animate-fade-in-up">
        {children}
      </main>
    </div>
  );
}
