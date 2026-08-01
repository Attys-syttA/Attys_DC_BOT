import { z } from "zod";

export interface WorkerHttpConfig {
  enabled: boolean;
  host: string;
  port: number;
  workerId: string;
  label: string;
  workspaceRootLabel: string;
  workspaceRoot: string;
  sharedSecretEnv: string;
}

const workerHttpConfigSchema = z.object({
  ATTYS_WORKER_HTTP_ENABLED: z.enum(["true", "false"]).default("false"),
  ATTYS_WORKER_HTTP_HOST: z.string().default("127.0.0.1"),
  ATTYS_WORKER_HTTP_PORT: z.coerce
    .number()
    .int()
    .min(1024, "ATTYS_WORKER_HTTP_PORT must be at least 1024")
    .max(65535, "ATTYS_WORKER_HTTP_PORT must be at most 65535")
    .default(8787),
  ATTYS_WORKER_ID: z.string().default("local-windows-worker"),
  ATTYS_WORKER_LABEL: z.string().default("Windows Worker"),
  ATTYS_WORKSPACE_ROOT_LABEL: z.string().default("codex_works"),
  ATTYS_WORKER_WORKSPACE_ROOT: z.string().default(""),
  ATTYS_WORKER_SHARED_SECRET_ENV: z.string().default("ATTYS_WORKER_SHARED_SECRET_HOME"),
});

function safeToken(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized || fallback;
}

function safeLabel(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .replace(/[A-Za-z]:[\\/][^\s`"']+/g, "<local-path>")
    .replace(/\b\d{15,30}\b/g, "<id>")
    .slice(0, 120);
  return normalized || fallback;
}

function safeHost(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "127.0.0.1" || trimmed === "localhost" || trimmed === "0.0.0.0") {
    return trimmed;
  }
  if (/^[a-z0-9.-]+$/i.test(trimmed)) {
    return trimmed;
  }
  throw new Error("ATTYS_WORKER_HTTP_HOST must be a hostname or IPv4 bind address");
}

export function parseWorkerHttpConfig(env: NodeJS.ProcessEnv): WorkerHttpConfig {
  const result = workerHttpConfigSchema.safeParse(env);
  if (!result.success) {
    throw new Error(result.error.issues.map((issue) => issue.message).join("; "));
  }

  return {
    enabled: result.data.ATTYS_WORKER_HTTP_ENABLED === "true",
    host: safeHost(result.data.ATTYS_WORKER_HTTP_HOST),
    port: result.data.ATTYS_WORKER_HTTP_PORT,
    workerId: safeToken(result.data.ATTYS_WORKER_ID, "local-windows-worker"),
    label: safeLabel(result.data.ATTYS_WORKER_LABEL, "Windows Worker"),
    workspaceRootLabel: safeLabel(result.data.ATTYS_WORKSPACE_ROOT_LABEL, "codex_works"),
    workspaceRoot: result.data.ATTYS_WORKER_WORKSPACE_ROOT.trim(),
    sharedSecretEnv: result.data.ATTYS_WORKER_SHARED_SECRET_ENV.trim() || "ATTYS_WORKER_SHARED_SECRET_HOME",
  };
}
