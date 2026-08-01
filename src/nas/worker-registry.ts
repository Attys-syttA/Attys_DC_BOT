import { sanitizePublicText } from "../utils/public-safety.js";

export const WORKER_MESSAGE_TYPES = [
  "worker.register",
  "worker.heartbeat",
  "worker.health",
  "worker.status",
] as const;

export type WorkerMessageType = typeof WORKER_MESSAGE_TYPES[number];
export type WorkerHostKind = "windows-worker" | "nas-control-plane" | "unknown";
export type WorkerStatus = "online" | "degraded" | "offline";

export interface WorkerRegistrationInput {
  workerId: string;
  label: string;
  hostKind: string;
  workspaceRootLabel: string;
  capabilities: string[];
}

export interface WorkerState {
  workerId: string;
  label: string;
  hostKind: WorkerHostKind;
  workspaceRootLabel: string;
  capabilities: string[];
  registeredAt: string;
  lastSeenAt: string;
  status: WorkerStatus;
}

export interface PublicWorkerStatus {
  workerId: string;
  label: string;
  hostKind: WorkerHostKind;
  workspaceRootLabel: string;
  capabilities: string[];
  lastSeenAt: string;
  status: WorkerStatus;
}

const ALLOWED_HOST_KINDS = new Set<WorkerHostKind>([
  "windows-worker",
  "nas-control-plane",
  "unknown",
]);

export function isWorkerMessageType(value: string): value is WorkerMessageType {
  return WORKER_MESSAGE_TYPES.includes(value as WorkerMessageType);
}

function safeToken(value: string, fallback: string): string {
  const publicText = sanitizePublicText(value, 80);
  if (publicText.includes("<redacted>")) return fallback;

  const sanitized = publicText
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  if (!sanitized || sanitized === "id") return fallback;
  return sanitized;
}

function safeWorkerId(value: string): string {
  if (/^\d{15,30}$/.test(value.trim())) return "worker-id";
  return safeToken(value, "worker-unknown");
}

function safeLabel(value: string, fallback: string): string {
  return sanitizePublicText(value, 120).replace(/```/g, "'''") || fallback;
}

function safeHostKind(value: string): WorkerHostKind {
  return ALLOWED_HOST_KINDS.has(value as WorkerHostKind)
    ? value as WorkerHostKind
    : "unknown";
}

function safeCapabilities(values: string[]): string[] {
  return [...new Set(
    values
      .map((value) => safeToken(value, "capability"))
      .filter((value) => value !== "capability")
      .slice(0, 20),
  )];
}

export function createWorkerRegistration(
  input: WorkerRegistrationInput,
  now = new Date(),
): WorkerState {
  const timestamp = now.toISOString();
  return {
    workerId: safeWorkerId(input.workerId),
    label: safeLabel(input.label, "Worker"),
    hostKind: safeHostKind(input.hostKind),
    workspaceRootLabel: safeLabel(input.workspaceRootLabel, "workspace"),
    capabilities: safeCapabilities(input.capabilities),
    registeredAt: timestamp,
    lastSeenAt: timestamp,
    status: "online",
  };
}

export function markWorkerHeartbeat(state: WorkerState, now = new Date()): WorkerState {
  return {
    ...state,
    lastSeenAt: now.toISOString(),
    status: "online",
  };
}

export function buildPublicWorkerStatus(
  state: WorkerState,
  now = new Date(),
  heartbeatTimeoutMs = 120_000,
): PublicWorkerStatus {
  const lastSeenMs = Date.parse(state.lastSeenAt);
  const stale = !Number.isFinite(lastSeenMs) || now.getTime() - lastSeenMs > heartbeatTimeoutMs;

  return {
    workerId: safeWorkerId(state.workerId),
    label: safeLabel(state.label, "Worker"),
    hostKind: safeHostKind(state.hostKind),
    workspaceRootLabel: safeLabel(state.workspaceRootLabel, "workspace"),
    capabilities: safeCapabilities(state.capabilities),
    lastSeenAt: state.lastSeenAt,
    status: stale ? "offline" : state.status,
  };
}
