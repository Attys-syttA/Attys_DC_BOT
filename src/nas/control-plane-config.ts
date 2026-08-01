import { z } from "zod";

export interface NasControlPlaneConfig {
  controlPlaneName: string;
  publicBaseUrl: string;
  workerHeartbeatTimeoutMs: number;
  codexExecutionEnabled: false;
}

const configSchema = z.object({
  ATTYS_NAS_CONTROL_PLANE_NAME: z.string().default("attys-dc-bot-nas"),
  ATTYS_NAS_PUBLIC_BASE_URL: z.string().default(""),
  ATTYS_WORKER_HEARTBEAT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(30_000, "ATTYS_WORKER_HEARTBEAT_TIMEOUT_MS must be at least 30000")
    .max(600_000, "ATTYS_WORKER_HEARTBEAT_TIMEOUT_MS must be at most 600000")
    .default(120_000),
  ATTYS_NAS_CODEX_EXECUTION_ENABLED: z.enum(["true", "false"]).default("false"),
});

function safeControlPlaneName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized || "attys-dc-bot-nas";
}

function normalizePublicBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("ATTYS_NAS_PUBLIC_BASE_URL must be empty or an http(s) URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("ATTYS_NAS_PUBLIC_BASE_URL must be empty or an http(s) URL");
  }

  parsed.username = "";
  parsed.password = "";
  return parsed.toString().replace(/\/$/, "");
}

export function parseNasControlPlaneConfig(env: NodeJS.ProcessEnv): NasControlPlaneConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    throw new Error(result.error.issues.map((issue) => issue.message).join("; "));
  }

  if (result.data.ATTYS_NAS_CODEX_EXECUTION_ENABLED === "true") {
    throw new Error("NAS-side Codex execution is not supported in this slice");
  }

  return {
    controlPlaneName: safeControlPlaneName(result.data.ATTYS_NAS_CONTROL_PLANE_NAME),
    publicBaseUrl: normalizePublicBaseUrl(result.data.ATTYS_NAS_PUBLIC_BASE_URL),
    workerHeartbeatTimeoutMs: result.data.ATTYS_WORKER_HEARTBEAT_TIMEOUT_MS,
    codexExecutionEnabled: false,
  };
}
