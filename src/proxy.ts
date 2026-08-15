import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth/config";

// Next 16 renamed the `middleware` convention to `proxy`.
// Uses the edge-safe config: the `authorized` callback redirects unauthenticated
// requests for /dashboard/** to /login.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/dashboard/:path*"],
};
