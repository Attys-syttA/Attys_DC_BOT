import { buildPublicNasWorkerTargets, type NasControlPlaneConfig } from "./control-plane-config.js";
import { readPublicHandoffStore, type PublicHandoffStoreStatus } from "./handoff-store.js";
import { probeNasWorkersHealth, type NasWorkerHealthResult } from "./worker-http-client.js";
import { readPublicWorkerStore, type PublicWorkerStoreStatus } from "./worker-store.js";

export interface NasControlPlaneRuntimePaths {
  workerStorePath: string;
  handoffRoot: string;
}

export interface NasControlPlaneSnapshot {
  controlPlaneName: string;
  publicBaseUrl: string;
  codexExecutionEnabled: false;
  configuredWorkers: ReturnType<typeof buildPublicNasWorkerTargets>;
  workerHealth: NasWorkerHealthResult[];
  workerStore: PublicWorkerStoreStatus;
  handoffStore: PublicHandoffStoreStatus;
  checkedAt: string;
}

export interface NasControlPlaneSnapshotOptions {
  probeWorkersHealth?: typeof probeNasWorkersHealth;
  now?: () => Date;
}

export async function buildNasControlPlaneSnapshot(
  config: NasControlPlaneConfig,
  paths: NasControlPlaneRuntimePaths,
  options: NasControlPlaneSnapshotOptions = {},
): Promise<NasControlPlaneSnapshot> {
  const now = options.now ?? (() => new Date());
  const probeWorkersHealth = options.probeWorkersHealth ?? probeNasWorkersHealth;

  return {
    controlPlaneName: config.controlPlaneName,
    publicBaseUrl: config.publicBaseUrl,
    codexExecutionEnabled: config.codexExecutionEnabled,
    configuredWorkers: buildPublicNasWorkerTargets(config.workers),
    workerHealth: await probeWorkersHealth(config.workers),
    workerStore: readPublicWorkerStore(
      paths.workerStorePath,
      now(),
      config.workerHeartbeatTimeoutMs,
    ),
    handoffStore: readPublicHandoffStore(paths.handoffRoot),
    checkedAt: now().toISOString(),
  };
}
