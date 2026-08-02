import { buildPublicNasWorkerTargets, parseNasControlPlaneConfig } from "../nas/control-plane-config.js";
import { probeNasWorkersHealth } from "../nas/worker-http-client.js";

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const config = parseNasControlPlaneConfig(process.env);
const health = await probeNasWorkersHealth(config.workers, {
  timeoutMs: 10_000,
});

const payload = {
  configuredWorkers: buildPublicNasWorkerTargets(config.workers),
  health,
};

if (hasFlag("json")) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log("NAS workers health");
  if (health.length === 0) {
    console.log("- INFO no workers configured");
  }
  for (const result of health) {
    const prefix = result.ok ? "OK" : "FAIL";
    const status = result.statusCode === null ? "no-status" : String(result.statusCode);
    console.log(`- ${prefix} ${result.workerId}: ${result.summary} (${status})`);
  }
}
