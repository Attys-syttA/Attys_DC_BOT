import type { NasDeployVerificationResult } from "./deploy-verification.js";

function statusText(ok: boolean): string {
  return ok ? "OK" : "FAIL";
}

export function formatNasDeployVerification(result: NasDeployVerificationResult): string {
  const lines = [
    `NAS deploy verify: ${statusText(result.ok)}`,
    `source commit: ${result.sourceCommit}`,
    `package version: ${result.packageVersion}`,
    `checked at: ${result.checkedAt}`,
    "checks:",
  ];

  for (const check of result.checks) {
    lines.push(`- ${statusText(check.ok)} ${check.name}: ${check.summary}`);
  }

  return `${lines.join("\n")}\n`;
}
