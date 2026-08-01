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

console.log(JSON.stringify({
  project,
  check,
  configuredWorkers: buildPublicNasWorkerTargets(config.workers),
  checks,
}, null, 2));
