import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    tenantId: string;
  }

  interface Session {
    user: {
      id: string;
      tenantId: string;
    } & DefaultSession["user"];
  }
}

// `next-auth/jwt` only re-exports `@auth/core/jwt`, so the augmentation has to
// target the module that actually declares JWT.
declare module "@auth/core/jwt" {
  interface JWT {
    userId: string;
    tenantId: string;
  }
}

export {};
