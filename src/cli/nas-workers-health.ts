import { buildPublicNasWorkerTargets, parseNasControlPlaneConfig } from "../nas/control-plane-config.js";
import { probeNasWorkersHealth } from "../nas/worker-http-client.js";

const config = parseNasControlPlaneConfig(process.env);
const health = await probeNasWorkersHealth(config.workers, {
  timeoutMs: 10_000,
});

console.log(JSON.stringify({
  configuredWorkers: buildPublicNasWorkerTargets(config.workers),
  health,
}, null, 2));
