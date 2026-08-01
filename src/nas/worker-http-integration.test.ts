import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NasWorkerHttpClient } from "./worker-http-client.js";
import { createWorkerHttpServer } from "../worker/worker-http-server.js";
import type { WorkerHttpConfig } from "../worker/worker-http-config.js";

const servers: Array<ReturnType<typeof createWorkerHttpServer>> = [];
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  })));
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

describe("NAS worker HTTP integration", () => {
  it("lets the NAS client read health and repo status from the PC worker server", async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "attys-worker-http-integration-"));
    tempRoots.push(workspaceRoot);
    const projectPath = path.join(workspaceRoot, "Attys_DC_BOT");
    fs.mkdirSync(projectPath);
    execFileSync("git", ["init", "-b", "main"], { cwd: projectPath, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: projectPath, stdio: "ignore" });
    execFileSync("git", ["config", "user.name", "Test User"], { cwd: projectPath, stdio: "ignore" });
    fs.writeFileSync(path.join(projectPath, "README.md"), "# Test\n");
    execFileSync("git", ["add", "README.md"], { cwd: projectPath, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "init"], { cwd: projectPath, stdio: "ignore" });

    const config: WorkerHttpConfig = {
      enabled: true,
      host: "127.0.0.1",
      port: 0,
      workerId: "loopback-worker",
      label: "Loopback Worker",
      workspaceRootLabel: "codex_works-home",
      workspaceRoot,
      sharedSecretEnv: "ATTYS_WORKER_SHARED_SECRET_HOME",
    };
    const server = createWorkerHttpServer({
      config,
      env: { ATTYS_WORKER_SHARED_SECRET_HOME: "local-test-token" },
      now: () => new Date("2026-08-01T12:00:00.000Z"),
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");

    const client = new NasWorkerHttpClient({
      worker: {
        id: "loopback-worker",
        label: "Loopback Worker",
        baseUrl: `http://127.0.0.1:${address.port}`,
        sharedSecretEnv: "ATTYS_WORKER_SHARED_SECRET_HOME",
        workspaceRootLabel: "codex_works-home",
      },
      env: { ATTYS_WORKER_SHARED_SECRET_HOME: "local-test-token" },
    });

    await expect(client.probeHealth()).resolves.toMatchObject({
      workerId: "loopback-worker",
      ok: true,
      statusCode: 200,
      summary: "worker health ready",
    });
    await expect(client.getRepoStatus("Attys_DC_BOT")).resolves.toMatchObject({
      workerId: "loopback-worker",
      ok: true,
      statusCode: 200,
      project: "<local-path>/Attys_DC_BOT",
      branch: "main",
    });
  });
});
