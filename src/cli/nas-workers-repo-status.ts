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
const config = parseNasControlPlaneConfig(process.env);
const repoStatus = [];

for (const worker of config.workers) {
  repoStatus.push(await new NasWorkerHttpClient({ worker }).getRepoStatus(project));
}

const payload = {
  project,
  configuredWorkers: buildPublicNasWorkerTargets(config.workers),
  repoStatus,
};

if (hasFlag("json")) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log(`NAS workers repo status: project=${project}`);
  if (repoStatus.length === 0) {
    console.log("- INFO no workers configured");
  }
  for (const result of repoStatus) {
    const prefix = result.ok ? "OK" : "FAIL";
    const branch = result.branch ?? "unknown";
    const clean = result.clean === null ? "unknown" : String(result.clean);
    const status = result.statusCode === null ? "no-status" : String(result.statusCode);
    console.log(`- ${prefix} ${result.workerId}: branch=${branch} clean=${clean} summary=${result.summary} (${status})`);
  }
}
