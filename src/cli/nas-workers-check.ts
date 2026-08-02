import { isAuditCheckName } from "../audit/check-catalog.js";
import { buildPublicNasWorkerTargets, parseNasControlPlaneConfig } from "../nas/control-plane-config.js";
import { NasWorkerHttpClient } from "../nas/worker-http-client.js";

function optionValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const project = optionValue("project") ?? "Attys_DC_BOT";
const check = optionValue("check") ?? "plans";
if (!isAuditCheckName(check)) {
  throw new Error(`Unsupported check: ${check}`);
}

const config = parseNasControlPlaneConfig(process.env);
const checks = [];

for (const worker of config.workers) {
  checks.push(await new NasWorkerHttpClient({ worker }).runNamedCheck(project, check));
}

const payload = {
  project,
  check,
  configuredWorkers: buildPublicNasWorkerTargets(config.workers),
  checks,
};

if (hasFlag("json")) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log(`NAS workers check: project=${project} check=${check}`);
  if (checks.length === 0) {
    console.log("- INFO no workers configured");
  }
  for (const result of checks) {
    const prefix = result.ok ? "OK" : "FAIL";
    const status = result.statusCode === null ? "no-status" : String(result.statusCode);
    console.log(`- ${prefix} ${result.workerId}: ${result.summary} (${status})`);
  }
}
