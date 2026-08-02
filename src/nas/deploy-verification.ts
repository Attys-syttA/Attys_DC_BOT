import fs from "node:fs";
import path from "node:path";
import { sanitizePublicText } from "../utils/public-safety.js";

export interface NasDeployVerificationCheck {
  name: string;
  ok: boolean;
  summary: string;
}

export interface NasDeployVerificationResult {
  ok: boolean;
  sourceCommit: string;
  packageVersion: string;
  checkedAt: string;
  checks: NasDeployVerificationCheck[];
}

export interface NasDeployVerificationOptions {
  now?: () => Date;
  maxSnapshotAgeMs?: number;
  maxSnapshotFutureSkewMs?: number;
  snapshotReadRetryCount?: number;
  snapshotReadRetryDelayMs?: number;
}

interface DeployJson {
  sourceCommit?: unknown;
  packageVersion?: unknown;
  includeSource?: unknown;
}

interface SnapshotJson {
  buildInfo?: DeployJson;
  codexExecutionEnabled?: unknown;
  configuredWorkers?: unknown;
  workerHealth?: unknown;
  handoffStore?: {
    rootStatus?: unknown;
  };
  checkedAt?: unknown;
}

interface ComposeIdentity {
  imageTag?: string;
  sourceCommitLabel?: string;
  packageVersionLabel?: string;
}

function readJsonObject(filePath: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function readComposeIdentity(filePath: string): ComposeIdentity | null {
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }

  const imageMatch = content.match(/^\s*image:\s*attys-dc-bot-control-plane:([A-Za-z0-9_.-]+)\s*$/m);
  const sourceCommitLabelMatch = content.match(/^\s*attys\.dc-bot\.source-commit:\s*["']?([^"'\r\n#]+)["']?\s*$/m);
  const packageVersionLabelMatch = content.match(/^\s*attys\.dc-bot\.package-version:\s*["']?([^"'\r\n#]+)["']?\s*$/m);

  return {
    imageTag: imageMatch?.[1]?.trim(),
    sourceCommitLabel: sourceCommitLabelMatch?.[1]?.trim(),
    packageVersionLabel: packageVersionLabelMatch?.[1]?.trim(),
  };
}

function sleepMs(delayMs: number): void {
  if (delayMs <= 0) return;
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, delayMs);
}

function safeText(value: unknown, fallback = "unknown"): string {
  return typeof value === "string"
    ? sanitizePublicText(value, 80) || fallback
    : fallback;
}

function pushCheck(checks: NasDeployVerificationCheck[], name: string, ok: boolean, summary: string): void {
  checks.push({
    name,
    ok,
    summary,
  });
}

function snapshotAgeOk(
  checkedAt: unknown,
  now: Date,
  maxSnapshotAgeMs: number,
  maxSnapshotFutureSkewMs: number,
): boolean {
  if (typeof checkedAt !== "string") return false;
  const checkedAtMs = Date.parse(checkedAt);
  if (!Number.isFinite(checkedAtMs)) return false;
  const ageMs = now.getTime() - checkedAtMs;
  return ageMs >= -maxSnapshotFutureSkewMs && ageMs <= maxSnapshotAgeMs;
}

function publicWorkerMetadataSafe(configuredWorkers: unknown): boolean {
  if (!Array.isArray(configuredWorkers)) return true;
  return configuredWorkers.every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const record = entry as Record<string, unknown>;
    return !("baseUrl" in record) && !("url" in record);
  });
}

function snapshotMatchesBuildInfo(snapshot: SnapshotJson | null, buildInfo: DeployJson | null): boolean {
  return Boolean(
    snapshot &&
    buildInfo &&
    snapshot.buildInfo?.sourceCommit === buildInfo.sourceCommit &&
    snapshot.buildInfo?.packageVersion === buildInfo.packageVersion,
  );
}

function readSnapshotWithRetry(
  filePath: string,
  buildInfo: DeployJson | null,
  retryCount: number,
  retryDelayMs: number,
): SnapshotJson | null {
  let snapshot = readJsonObject(filePath) as SnapshotJson | null;
  for (let attempt = 0; attempt < retryCount && !snapshotMatchesBuildInfo(snapshot, buildInfo); attempt += 1) {
    sleepMs(retryDelayMs);
    snapshot = readJsonObject(filePath) as SnapshotJson | null;
  }
  return snapshot;
}

export function verifyNasDeploy(
  shareRoot: string,
  options: NasDeployVerificationOptions = {},
): NasDeployVerificationResult {
  const now = options.now?.() ?? new Date();
  const maxSnapshotAgeMs = options.maxSnapshotAgeMs ?? 10 * 60_000;
  const maxSnapshotFutureSkewMs = options.maxSnapshotFutureSkewMs ?? 60_000;
  const snapshotReadRetryCount = options.snapshotReadRetryCount ?? 0;
  const snapshotReadRetryDelayMs = options.snapshotReadRetryDelayMs ?? 0;
  const manifest = readJsonObject(path.join(shareRoot, "NAS_STAGING_MANIFEST.json")) as DeployJson | null;
  const buildInfo = readJsonObject(path.join(shareRoot, "app", "NAS_BUILD_INFO.json")) as DeployJson | null;
  const compose = readComposeIdentity(path.join(shareRoot, "docker-compose.yml"));
  const snapshot = readSnapshotWithRetry(
    path.join(shareRoot, "logs", "nas-control-plane-status.json"),
    buildInfo,
    snapshotReadRetryCount,
    snapshotReadRetryDelayMs,
  );
  const checks: NasDeployVerificationCheck[] = [];

  pushCheck(checks, "manifest", Boolean(manifest), manifest ? "readable" : "missing or unreadable");
  pushCheck(checks, "build-info", Boolean(buildInfo), buildInfo ? "readable" : "missing or unreadable");
  pushCheck(checks, "compose-file", Boolean(compose), compose ? "readable" : "missing or unreadable");
  pushCheck(checks, "control-plane-snapshot", Boolean(snapshot), snapshot ? "readable" : "missing or unreadable");

  const sourceCommit = safeText(buildInfo?.sourceCommit ?? manifest?.sourceCommit);
  const packageVersion = safeText(buildInfo?.packageVersion ?? manifest?.packageVersion);
  const manifestMatchesBuild = Boolean(
    manifest &&
    buildInfo &&
    manifest.sourceCommit === buildInfo.sourceCommit &&
    manifest.packageVersion === buildInfo.packageVersion,
  );
  pushCheck(checks, "manifest-build-match", manifestMatchesBuild, manifestMatchesBuild ? "manifest matches build info" : "manifest does not match build info");

  const composeImageMatchesBuild = Boolean(
    compose &&
    buildInfo &&
    typeof buildInfo.sourceCommit === "string" &&
    compose.imageTag === buildInfo.sourceCommit,
  );
  pushCheck(checks, "compose-image-build-match", composeImageMatchesBuild, composeImageMatchesBuild ? "compose image tag matches build info" : "compose image tag does not match build info");

  const composeLabelsMatchBuild = Boolean(
    compose &&
    buildInfo &&
    compose.sourceCommitLabel === buildInfo.sourceCommit &&
    compose.packageVersionLabel === buildInfo.packageVersion,
  );
  pushCheck(checks, "compose-labels-build-match", composeLabelsMatchBuild, composeLabelsMatchBuild ? "compose labels match build info" : "compose labels do not match build info");

  const snapshotMatchesBuild = snapshotMatchesBuildInfo(snapshot, buildInfo);
  pushCheck(checks, "snapshot-build-match", snapshotMatchesBuild, snapshotMatchesBuild ? "snapshot matches staged build" : "snapshot does not match staged build");

  const sourceIncluded = manifest?.includeSource === true && buildInfo?.includeSource === true && snapshot?.buildInfo?.includeSource === true;
  pushCheck(checks, "source-included", sourceIncluded, sourceIncluded ? "source included" : "source include flag missing");

  const codexDisabled = snapshot?.codexExecutionEnabled === false;
  pushCheck(checks, "nas-codex-disabled", codexDisabled, codexDisabled ? "NAS-side Codex disabled" : "NAS-side Codex flag unsafe or unknown");

  const handoffReady = snapshot?.handoffStore?.rootStatus === "ready";
  pushCheck(checks, "handoff-store", handoffReady, handoffReady ? "ready" : "not ready");

  const workerHealth = Array.isArray(snapshot?.workerHealth) ? snapshot.workerHealth : [];
  const healthyWorkers = workerHealth.filter((entry) => entry && typeof entry === "object" && (entry as { ok?: unknown }).ok === true).length;
  const workersOk = workerHealth.length > 0 && healthyWorkers === workerHealth.length;
  pushCheck(checks, "worker-health", workersOk, workersOk ? `${healthyWorkers}/${workerHealth.length} healthy` : `${healthyWorkers}/${workerHealth.length} healthy`);

  const workerMetadataSafe = publicWorkerMetadataSafe(snapshot?.configuredWorkers);
  pushCheck(checks, "public-worker-metadata", workerMetadataSafe, workerMetadataSafe ? "worker metadata public-safe" : "worker metadata exposes URL fields");

  const fresh = snapshotAgeOk(snapshot?.checkedAt, now, maxSnapshotAgeMs, maxSnapshotFutureSkewMs);
  pushCheck(checks, "snapshot-freshness", fresh, fresh ? "fresh" : "stale, missing, or clock-skewed timestamp");

  return {
    ok: checks.every((check) => check.ok),
    sourceCommit,
    packageVersion,
    checkedAt: now.toISOString(),
    checks,
  };
}
