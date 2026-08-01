import path from "node:path";
import { parseNasControlPlaneConfig } from "../nas/control-plane-config.js";
import { buildNasControlPlaneSnapshot } from "../nas/control-plane-runtime.js";

const config = parseNasControlPlaneConfig(process.env);
const workerStorePath = process.env.ATTYS_NAS_WORKER_STORE_PATH
  ? path.resolve(process.env.ATTYS_NAS_WORKER_STORE_PATH)
  : path.resolve("data", "workers.json");
const handoffRoot = process.env.ATTYS_NAS_HANDOFF_ROOT
  ? path.resolve(process.env.ATTYS_NAS_HANDOFF_ROOT)
  : path.resolve("data", "handoff");
const intervalMs = Number(process.env.ATTYS_NAS_STATUS_POLL_INTERVAL_MS ?? 60_000);
const safeIntervalMs = Number.isInteger(intervalMs) && intervalMs >= 10_000 && intervalMs <= 900_000
  ? intervalMs
  : 60_000;

let stopping = false;

async function tick(): Promise<void> {
  const snapshot = await buildNasControlPlaneSnapshot(config, {
    workerStorePath,
    handoffRoot,
  });
  console.log(JSON.stringify({
    event: "nas-control-plane-status",
    ...snapshot,
  }));
}

console.log(JSON.stringify({
  event: "nas-control-plane-started",
  controlPlaneName: config.controlPlaneName,
  configuredWorkers: config.workers.length,
  pollIntervalMs: safeIntervalMs,
}));

await tick();
const timer = setInterval(() => {
  if (!stopping) {
    void tick().catch((error) => {
      console.error(JSON.stringify({
        event: "nas-control-plane-status-error",
        message: error instanceof Error ? error.message : String(error),
      }));
    });
  }
}, safeIntervalMs);

function shutdown(): void {
  stopping = true;
  clearInterval(timer);
  console.log(JSON.stringify({
    event: "nas-control-plane-stopped",
    controlPlaneName: config.controlPlaneName,
  }));
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
