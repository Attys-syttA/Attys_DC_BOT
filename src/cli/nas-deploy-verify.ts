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
const jsonOutput = process.argv.includes("--json");
const maxSnapshotAgeMs = Number(maxAgeRaw);
const result = verifyNasDeploy(path.resolve(targetRoot), {
  ...(Number.isInteger(maxSnapshotAgeMs) && maxSnapshotAgeMs >= 10_000
    ? { maxSnapshotAgeMs }
    : {}),
});

if (jsonOutput) {
  console.log(JSON.stringify(result, null, 2));
} else {
  process.stdout.write(formatNasDeployVerification(result));
}
if (!result.ok) {
  process.exitCode = 1;
}
