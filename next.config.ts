import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Kysely ships ESM-only; listing it here also puts it on next/jest's
  // transform allowlist so tests can import it under Jest's CJS runtime.
  transpilePackages: ["kysely"],
};

export default nextConfig;
