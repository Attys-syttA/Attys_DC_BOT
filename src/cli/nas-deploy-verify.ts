import path from "node:path";
import { verifyNasDeploy } from "../nas/deploy-verification.js";
import { formatNasDeployVerification } from "../nas/deploy-verification-format.js";

function argValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

const targetRoot = argValue("--target-root") ?? process.env.ATTYS_NAS_SHARE_ROOT ?? "K:\\";
const maxAgeRaw = argValue("--max-age-ms") ?? process.env.ATTYS_NAS_DEPLOY_VERIFY_MAX_AGE_MS ?? "";
const retryCountRaw = argValue("--snapshot-read-retry-count") ?? process.env.ATTYS_NAS_DEPLOY_VERIFY_SNAPSHOT_READ_RETRY_COUNT ?? "";
const retryDelayRaw = argValue("--snapshot-read-retry-delay-ms") ?? process.env.ATTYS_NAS_DEPLOY_VERIFY_SNAPSHOT_READ_RETRY_DELAY_MS ?? "";
const jsonOutput = process.argv.includes("--json");
const maxSnapshotAgeMs = Number(maxAgeRaw);
const snapshotReadRetryCount = Number(retryCountRaw);
const snapshotReadRetryDelayMs = Number(retryDelayRaw);
const result = verifyNasDeploy(path.resolve(targetRoot), {
  ...(Number.isInteger(maxSnapshotAgeMs) && maxSnapshotAgeMs >= 10_000
    ? { maxSnapshotAgeMs }
    : {}),
  snapshotReadRetryCount: Number.isInteger(snapshotReadRetryCount) && snapshotReadRetryCount >= 0
    ? snapshotReadRetryCount
    : 3,
  snapshotReadRetryDelayMs: Number.isInteger(snapshotReadRetryDelayMs) && snapshotReadRetryDelayMs >= 0
    ? snapshotReadRetryDelayMs
    : 1_000,
});

if (jsonOutput) {
  console.log(JSON.stringify(result, null, 2));
} else {
  process.stdout.write(formatNasDeployVerification(result));
}
if (!result.ok) {
  process.exitCode = 1;
}
