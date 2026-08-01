import { z } from "zod";
import { isAuditCheckName, type AuditCheckName } from "../audit/check-catalog.js";

export interface NasControlPlaneConfig {
  controlPlaneName: string;
  publicBaseUrl: string;
  workerHeartbeatTimeoutMs: number;
  workers: NasWorkerTarget[];
  statusProject: string;
  statusCheck: AuditCheckName | null;
  codexExecutionEnabled: false;
}

export interface NasWorkerTarget {
  id: string;
  label: string;
  baseUrl: string;
  sharedSecretEnv?: string;
  workspaceRootLabel: string;
}

export interface PublicNasWorkerTarget {
  id: string;
  label: string;
  baseUrl: string;
  hasSharedSecret: boolean;
  workspaceRootLabel: string;
}

const configSchema = z.object({
  ATTYS_NAS_CONTROL_PLANE_NAME: z.string().default("attys-dc-bot-nas"),
  ATTYS_NAS_PUBLIC_BASE_URL: z.string().default(""),
  ATTYS_NAS_WORKERS_JSON: z.string().default("[]"),
  ATTYS_NAS_STATUS_PROJECT: z.string().default("Attys_DC_BOT"),
  ATTYS_NAS_STATUS_CHECK: z.string().default(""),
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

function normalizeWorkerBaseUrl(value: string): string {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("ATTYS_NAS_WORKERS_JSON worker baseUrl must be an http(s) URL");
  }
  parsed.username = "";
  parsed.password = "";
  return parsed.toString().replace(/\/$/, "");
}

function safeWorkerToken(value: string, fieldName: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  if (!normalized) {
    throw new Error(`${fieldName} must be a non-empty public label`);
  }
  return normalized;
}

function safeWorkerLabel(value: string): string {
  const label = value
    .trim()
    .replace(/[A-Za-z]:[\\/][^\s`"']+/g, "<local-path>")
    .replace(/\b\d{15,30}\b/g, "<id>")
    .slice(0, 120);
  return label || "Worker";
}

function safeProjectName(value: string): string {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9._ -]{1,120}$/.test(trimmed) || trimmed.includes("..")) {
    throw new Error("ATTYS_NAS_STATUS_PROJECT must be a simple project folder name");
  }
  return trimmed;
}

function parseStatusCheck(value: string): AuditCheckName | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!isAuditCheckName(trimmed)) {
    throw new Error("ATTYS_NAS_STATUS_CHECK must be empty or one fixed audit check name");
  }
  return trimmed;
}

function parseNasWorkers(raw: string): NasWorkerTarget[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid ATTYS_NAS_WORKERS_JSON: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }

  if (!Array.isArray(parsed)) {
    throw new Error("ATTYS_NAS_WORKERS_JSON must be a JSON array");
  }

  const seen = new Set<string>();
  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`ATTYS_NAS_WORKERS_JSON[${index}] must be an object`);
    }
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string"
      ? safeWorkerToken(record.id, `ATTYS_NAS_WORKERS_JSON[${index}].id`)
      : "";
    if (!id) {
      throw new Error(`ATTYS_NAS_WORKERS_JSON[${index}].id must be a non-empty public label`);
    }
    if (seen.has(id)) {
      throw new Error(`Duplicate worker id in ATTYS_NAS_WORKERS_JSON: ${id}`);
    }
    seen.add(id);

    if (typeof record.baseUrl !== "string" || !record.baseUrl.trim()) {
      throw new Error(`ATTYS_NAS_WORKERS_JSON[${index}].baseUrl must be a non-empty URL`);
    }

    const sharedSecretEnv = typeof record.sharedSecretEnv === "string" && record.sharedSecretEnv.trim()
      ? record.sharedSecretEnv.trim()
      : undefined;

    return {
      id,
      label: typeof record.label === "string" ? safeWorkerLabel(record.label) : "Worker",
      baseUrl: normalizeWorkerBaseUrl(record.baseUrl),
      ...(sharedSecretEnv ? { sharedSecretEnv } : {}),
      workspaceRootLabel: typeof record.workspaceRootLabel === "string"
        ? safeWorkerLabel(record.workspaceRootLabel)
        : "workspace",
    };
  });
}

export function buildPublicNasWorkerTargets(workers: NasWorkerTarget[]): PublicNasWorkerTarget[] {
  return workers.map((worker) => ({
    id: worker.id,
    label: worker.label,
    baseUrl: worker.baseUrl,
    hasSharedSecret: Boolean(worker.sharedSecretEnv),
    workspaceRootLabel: worker.workspaceRootLabel,
  }));
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
    workers: parseNasWorkers(result.data.ATTYS_NAS_WORKERS_JSON),
    statusProject: safeProjectName(result.data.ATTYS_NAS_STATUS_PROJECT),
    statusCheck: parseStatusCheck(result.data.ATTYS_NAS_STATUS_CHECK),
    codexExecutionEnabled: false,
  };
}
