import fs from "node:fs";
import { z } from "zod";
import {
  PublicWorkerStatus,
  WorkerState,
  WorkerStatus,
  buildPublicWorkerStatus,
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
