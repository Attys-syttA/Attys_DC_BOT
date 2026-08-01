import { buildPublicNasWorkerTargets, type NasControlPlaneConfig } from "./control-plane-config.js";
import { readPublicHandoffStore, type PublicHandoffStoreStatus } from "./handoff-store.js";
import {
  probeNasWorkersHealth,
  readNasWorkersRepoStatus,
  runNasWorkersNamedCheck,
  type NasWorkerHealthResult,
  type NasWorkerNamedCheckResult,
  type NasWorkerRepoStatusResult,
} from "./worker-http-client.js";
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
  workerRepoStatus: NasWorkerRepoStatusResult[];
  workerNamedChecks: NasWorkerNamedCheckResult[];
  workerStore: PublicWorkerStoreStatus;
  handoffStore: PublicHandoffStoreStatus;
  checkedAt: string;
}

export interface NasControlPlaneSnapshotOptions {
  probeWorkersHealth?: typeof probeNasWorkersHealth;
  readWorkersRepoStatus?: typeof readNasWorkersRepoStatus;
  runWorkersNamedCheck?: typeof runNasWorkersNamedCheck;
  now?: () => Date;
}

export async function buildNasControlPlaneSnapshot(
  config: NasControlPlaneConfig,
  paths: NasControlPlaneRuntimePaths,
  options: NasControlPlaneSnapshotOptions = {},
): Promise<NasControlPlaneSnapshot> {
  const now = options.now ?? (() => new Date());
  const probeWorkersHealth = options.probeWorkersHealth ?? probeNasWorkersHealth;
  const readWorkersRepoStatus = options.readWorkersRepoStatus ?? readNasWorkersRepoStatus;
  const runWorkersNamedCheck = options.runWorkersNamedCheck ?? runNasWorkersNamedCheck;

  return {
    controlPlaneName: config.controlPlaneName,
    publicBaseUrl: config.publicBaseUrl,
    codexExecutionEnabled: config.codexExecutionEnabled,
    configuredWorkers: buildPublicNasWorkerTargets(config.workers),
    workerHealth: await probeWorkersHealth(config.workers),
    workerRepoStatus: await readWorkersRepoStatus(config.workers, config.statusProject),
    workerNamedChecks: config.statusCheck
      ? await runWorkersNamedCheck(config.workers, config.statusProject, config.statusCheck)
      : [],
    workerStore: readPublicWorkerStore(
      paths.workerStorePath,
      now(),
      config.workerHeartbeatTimeoutMs,
    ),
    handoffStore: readPublicHandoffStore(paths.handoffRoot),
    checkedAt: now().toISOString(),
  };
}
