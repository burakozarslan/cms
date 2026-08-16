"use server";

import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { checkMediaConnection } from "@/lib/media-config/check-connection";
import { saveMediaConfig } from "@/lib/media-config/service";

export type SaveMediaConfigState = {
  fieldErrors?: Record<string, string[]>;
  success?: boolean;
};

export async function saveMediaConfigAction(
  _prev: SaveMediaConfigState,
  formData: FormData,
): Promise<SaveMediaConfigState> {
  const session = await requireSession();
  if (!session) redirect("/login");

  const apiSecret = formData.get("apiSecret");

  const result = await saveMediaConfig(session.user.tenantId, {
    cloudName: formData.get("cloudName"),
    apiKey: formData.get("apiKey"),
    // Blank means "keep the existing secret" — see saveMediaConfig.
    apiSecret:
      typeof apiSecret === "string" && apiSecret.length > 0
        ? apiSecret
        : undefined,
  });

  if (!result.ok) {
    return { fieldErrors: result.fieldErrors };
  }

  return { success: true };
}

export type CheckConnectionState = {
  status: "idle" | "ok" | "fail" | "not_configured";
  checkedAt?: string;
};

export async function checkMediaConnectionAction(
  _prev: CheckConnectionState,
): Promise<CheckConnectionState> {
  const session = await requireSession();
  if (!session) redirect("/login");

  const result = await checkMediaConnection(session.user.tenantId);

  if (!result.ok && result.reason === "NOT_CONFIGURED") {
    return { status: "not_configured" };
  }

  return {
    status: result.ok ? "ok" : "fail",
    checkedAt: new Date().toISOString(),
  };
}
