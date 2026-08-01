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
const config = parseNasControlPlaneConfig(process.env);
const repoStatus = [];

for (const worker of config.workers) {
  repoStatus.push(await new NasWorkerHttpClient({ worker }).getRepoStatus(project));
}

console.log(JSON.stringify({
  project,
  configuredWorkers: buildPublicNasWorkerTargets(config.workers),
  repoStatus,
}, null, 2));
