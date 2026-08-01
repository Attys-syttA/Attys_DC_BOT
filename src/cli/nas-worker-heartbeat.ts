import path from "node:path";
import { upsertWorkerHeartbeat } from "../nas/worker-store.js";

function splitCapabilities(value: string | undefined): string[] {
  return (value ?? "health,heartbeat,status")
    .split(",")
    .map((capability) => capability.trim())
    .filter(Boolean);
}

const worker = upsertWorkerHeartbeat(
  process.env.ATTYS_NAS_WORKER_STORE_PATH
    ? path.resolve(process.env.ATTYS_NAS_WORKER_STORE_PATH)
    : path.resolve("data", "workers.json"),
  {
    workerId: process.env.ATTYS_WORKER_ID ?? "local-windows-worker",
    label: process.env.ATTYS_WORKER_LABEL ?? "Windows Worker",
    hostKind: "windows-worker",
    workspaceRootLabel: process.env.ATTYS_WORKSPACE_ROOT_LABEL ?? "codex_works",
    capabilities: splitCapabilities(process.env.ATTYS_WORKER_CAPABILITIES),
  },
);

console.log(JSON.stringify({
  workerId: worker.workerId,
  label: worker.label,
  workspaceRootLabel: worker.workspaceRootLabel,
  capabilities: worker.capabilities,
  lastSeenAt: worker.lastSeenAt,
  status: worker.status,
}, null, 2));
