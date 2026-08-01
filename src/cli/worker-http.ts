import { createWorkerHttpServer } from "../worker/worker-http-server.js";
import { parseWorkerHttpConfig } from "../worker/worker-http-config.js";

const config = parseWorkerHttpConfig(process.env);

if (!config.enabled) {
  console.error("Worker HTTP server is disabled. Set ATTYS_WORKER_HTTP_ENABLED=true to start it.");
  process.exit(1);
}

const server = createWorkerHttpServer({ config });
server.listen(config.port, config.host, () => {
  console.log(JSON.stringify({
    started: true,
    host: config.host,
    port: config.port,
    workerId: config.workerId,
    label: config.label,
    workspaceRootLabel: config.workspaceRootLabel,
    sharedSecretRequired: Boolean(process.env[config.sharedSecretEnv]?.trim()),
  }, null, 2));
});

function shutdown(): void {
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
