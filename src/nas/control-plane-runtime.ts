import fs from "node:fs";
import { buildPublicNasWorkerTargets, type NasControlPlaneConfig } from "./control-plane-config.js";
import { readPublicHandoffStore, type PublicHandoffStoreStatus } from "./handoff-store.js";
import { sanitizePublicText } from "../utils/public-safety.js";
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
  buildInfoPath?: string;
}

export interface NasControlPlaneBuildInfo {
  sourceCommit: string;
  packageVersion: string;
  generatedAt: string;
  includeSource: boolean;
}

export interface NasControlPlaneSnapshot {
  controlPlaneName: string;
  publicBaseUrl: string;
  buildInfo: NasControlPlaneBuildInfo;
  codexExecutionEnabled: false;
  configuredWorkers: ReturnType<typeof buildPublicNasWorkerTargets>;
  workerHealth: NasWorkerHealthResult[];
  workerRepoStatus: NasWorkerRepoStatusResult[];
  workerNamedChecks: NasWorkerNamedCheckResult[];
  workerStore: PublicWorkerStoreStatus;
  handoffStore: PublicHandoffStoreStatus;
  checkedAt: string;
}

function safeBuildInfoText(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  return sanitizePublicText(value, 80) || fallback;
}

export function readNasControlPlaneBuildInfo(buildInfoPath = "NAS_BUILD_INFO.json"): NasControlPlaneBuildInfo {
  if (!fs.existsSync(buildInfoPath)) {
    return {
      sourceCommit: "unknown",
      packageVersion: "unknown",
      generatedAt: "unknown",
      includeSource: false,
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(buildInfoPath, "utf8")) as Record<string, unknown>;
    return {
      sourceCommit: safeBuildInfoText(parsed.sourceCommit, "unknown"),
      packageVersion: safeBuildInfoText(parsed.packageVersion, "unknown"),
      generatedAt: safeBuildInfoText(parsed.generatedAt, "unknown"),
      includeSource: parsed.includeSource === true,
    };
  } catch {
    return {
      sourceCommit: "unknown",
      packageVersion: "unknown",
      generatedAt: "unknown",
      includeSource: false,
    };
  }
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
    buildInfo: readNasControlPlaneBuildInfo(paths.buildInfoPath),
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
