import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authorizeCredentials } from "./authorize";
import { authConfig } from "./config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: authorizeCredentials,
    }),
  ],
});

/**
 * The acting session, or `null`. Pages and server actions must read the tenant
 * from here — never from a route param or form field.
 */
export async function requireSession() {
  const session = await auth();
  if (!session?.user?.tenantId) return null;
  return session;
}
