import path from "node:path";
import {
  buildPublicNasWorkerTargets,
  parseNasControlPlaneConfig,
} from "../nas/control-plane-config.js";
import { readNasControlPlaneBuildInfo } from "../nas/control-plane-runtime.js";
import { readPublicWorkerStore } from "../nas/worker-store.js";

const config = parseNasControlPlaneConfig(process.env);
const workerStorePath = process.env.ATTYS_NAS_WORKER_STORE_PATH
  ? path.resolve(process.env.ATTYS_NAS_WORKER_STORE_PATH)
  : path.resolve("data", "workers.json");

const status = {
  controlPlaneName: config.controlPlaneName,
  publicBaseUrl: config.publicBaseUrl,
  buildInfo: readNasControlPlaneBuildInfo(process.env.ATTYS_NAS_BUILD_INFO_PATH
    ? path.resolve(process.env.ATTYS_NAS_BUILD_INFO_PATH)
    : path.resolve("NAS_BUILD_INFO.json")),
  codexExecutionEnabled: config.codexExecutionEnabled,
  configuredWorkers: buildPublicNasWorkerTargets(config.workers),
  workerStore: readPublicWorkerStore(
    workerStorePath,
    new Date(),
    config.workerHeartbeatTimeoutMs,
  ),
};

console.log(JSON.stringify(status, null, 2));
