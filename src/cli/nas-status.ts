import path from "node:path";
import { parseNasControlPlaneConfig } from "../nas/control-plane-config.js";
import { readPublicWorkerStore } from "../nas/worker-store.js";

const config = parseNasControlPlaneConfig(process.env);
const workerStorePath = process.env.ATTYS_NAS_WORKER_STORE_PATH
  ? path.resolve(process.env.ATTYS_NAS_WORKER_STORE_PATH)
  : path.resolve("data", "workers.json");

const status = {
  controlPlaneName: config.controlPlaneName,
  publicBaseUrl: config.publicBaseUrl,
  codexExecutionEnabled: config.codexExecutionEnabled,
  workerStore: readPublicWorkerStore(
    workerStorePath,
    new Date(),
    config.workerHeartbeatTimeoutMs,
  ),
};

console.log(JSON.stringify(status, null, 2));
