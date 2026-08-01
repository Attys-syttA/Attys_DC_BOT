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
}

interface DeployJson {
  sourceCommit?: unknown;
  packageVersion?: unknown;
  includeSource?: unknown;
}

interface SnapshotJson {
  buildInfo?: DeployJson;
  codexExecutionEnabled?: unknown;
  workerHealth?: unknown;
  handoffStore?: {
    rootStatus?: unknown;
  };
  checkedAt?: unknown;
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

function snapshotAgeOk(checkedAt: unknown, now: Date, maxSnapshotAgeMs: number): boolean {
  if (typeof checkedAt !== "string") return false;
  const checkedAtMs = Date.parse(checkedAt);
  if (!Number.isFinite(checkedAtMs)) return false;
  return now.getTime() - checkedAtMs <= maxSnapshotAgeMs;
}

export function verifyNasDeploy(
  shareRoot: string,
  options: NasDeployVerificationOptions = {},
): NasDeployVerificationResult {
  const now = options.now?.() ?? new Date();
  const maxSnapshotAgeMs = options.maxSnapshotAgeMs ?? 10 * 60_000;
  const manifest = readJsonObject(path.join(shareRoot, "NAS_STAGING_MANIFEST.json")) as DeployJson | null;
  const buildInfo = readJsonObject(path.join(shareRoot, "app", "NAS_BUILD_INFO.json")) as DeployJson | null;
  const snapshot = readJsonObject(path.join(shareRoot, "logs", "nas-control-plane-status.json")) as SnapshotJson | null;
  const checks: NasDeployVerificationCheck[] = [];

  pushCheck(checks, "manifest", Boolean(manifest), manifest ? "readable" : "missing or unreadable");
  pushCheck(checks, "build-info", Boolean(buildInfo), buildInfo ? "readable" : "missing or unreadable");
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

  const snapshotMatchesBuild = Boolean(
    snapshot &&
    buildInfo &&
    snapshot.buildInfo?.sourceCommit === buildInfo.sourceCommit &&
    snapshot.buildInfo?.packageVersion === buildInfo.packageVersion,
  );
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

  const fresh = snapshotAgeOk(snapshot?.checkedAt, now, maxSnapshotAgeMs);
  pushCheck(checks, "snapshot-freshness", fresh, fresh ? "fresh" : "stale or missing timestamp");

  return {
    ok: checks.every((check) => check.ok),
    sourceCommit,
    packageVersion,
    checkedAt: now.toISOString(),
    checks,
  };
}
