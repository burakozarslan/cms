import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe half of the auth setup.
 *
 * Middleware runs on the edge runtime, where `better-sqlite3` and `bcryptjs`
 * cannot load. This module therefore holds no providers and touches no
 * database — the Credentials provider lives in `./index.ts`, which only runs in
 * Node. Both share these callbacks so the session shape is identical either way.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    // Required by the Credentials provider: it cannot use database sessions.
    strategy: "jwt",
  },
  callbacks: {
    jwt({ token, user }) {
      // `user` is only set on first sign-in; afterwards the claims are already
      // on the token.
      if (user) {
        token.userId = user.id!;
        token.tenantId = user.tenantId;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.userId;
      session.user.tenantId = token.tenantId;
      return session;
    },
    authorized({ auth, request }) {
      const isProtected = request.nextUrl.pathname.startsWith("/dashboard");
      if (!isProtected) return true;
      return Boolean(auth?.user);
    },
  },
  providers: [],
} satisfies NextAuthConfig;
