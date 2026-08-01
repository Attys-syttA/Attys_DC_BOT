import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  PublicWorkerStatus,
  WorkerRegistrationInput,
  WorkerState,
  WorkerStatus,
  buildPublicWorkerStatus,
  createWorkerRegistration,
  markWorkerHeartbeat,
} from "./worker-registry.js";

export type WorkerStoreStatus = "ready" | "missing" | "invalid";

export interface WorkerStoreSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  workers: WorkerState[];
}

export interface PublicWorkerStoreStatus {
  storeStatus: WorkerStoreStatus;
  workers: PublicWorkerStatus[];
}

const workerStateSchema = z.object({
  workerId: z.string(),
  label: z.string(),
  hostKind: z.string(),
  workspaceRootLabel: z.string(),
  capabilities: z.array(z.string()),
  registeredAt: z.string(),
  lastSeenAt: z.string(),
  status: z.enum(["online", "degraded", "offline"]),
});

const workerStoreSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  workers: z.array(workerStateSchema),
});

function toWorkerState(value: z.infer<typeof workerStateSchema>): WorkerState {
  return {
    workerId: value.workerId,
    label: value.label,
    hostKind: value.hostKind === "windows-worker" || value.hostKind === "nas-control-plane"
      ? value.hostKind
      : "unknown",
    workspaceRootLabel: value.workspaceRootLabel,
    capabilities: value.capabilities,
    registeredAt: value.registeredAt,
    lastSeenAt: value.lastSeenAt,
    status: value.status as WorkerStatus,
  };
}

export function createWorkerStoreSnapshot(
  workers: WorkerState[],
  now = new Date(),
): WorkerStoreSnapshot {
  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    workers,
  };
}

function readWorkerStoreSnapshot(storePath: string): WorkerStoreSnapshot | null {
  if (!fs.existsSync(storePath)) return null;
  const parsed = workerStoreSchema.parse(JSON.parse(fs.readFileSync(storePath, "utf8")));
  return {
    schemaVersion: 1,
    generatedAt: parsed.generatedAt,
    workers: parsed.workers.map(toWorkerState),
  };
}

export function writeWorkerStoreSnapshot(storePath: string, snapshot: WorkerStoreSnapshot): void {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

export function upsertWorkerHeartbeat(
  storePath: string,
  input: WorkerRegistrationInput,
  now = new Date(),
): WorkerState {
  const snapshot = readWorkerStoreSnapshot(storePath) ?? createWorkerStoreSnapshot([], now);
  const nextWorker = createWorkerRegistration(input, now);
  const existingIndex = snapshot.workers.findIndex((worker) => worker.workerId === nextWorker.workerId);
  const worker = existingIndex >= 0
    ? markWorkerHeartbeat({
      ...nextWorker,
      registeredAt: snapshot.workers[existingIndex].registeredAt,
    }, now)
    : nextWorker;

  const workers = [...snapshot.workers];
  if (existingIndex >= 0) {
    workers[existingIndex] = worker;
  } else {
    workers.push(worker);
  }

  writeWorkerStoreSnapshot(storePath, createWorkerStoreSnapshot(workers, now));
  return worker;
}

export function readPublicWorkerStore(
  storePath: string,
  now = new Date(),
  heartbeatTimeoutMs = 120_000,
): PublicWorkerStoreStatus {
  if (!fs.existsSync(storePath)) {
    return {
      storeStatus: "missing",
      workers: [],
    };
  }

  try {
    const parsed = workerStoreSchema.parse(JSON.parse(fs.readFileSync(storePath, "utf8")));
    return {
      storeStatus: "ready",
      workers: parsed.workers.map((worker) =>
        buildPublicWorkerStatus(toWorkerState(worker), now, heartbeatTimeoutMs),
      ),
    };
  } catch {
    return {
      storeStatus: "invalid",
      workers: [],
    };
  }
}
