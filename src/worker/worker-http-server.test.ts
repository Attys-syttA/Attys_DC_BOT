import { afterEach, describe, expect, it } from "vitest";
import { createWorkerHttpServer } from "./worker-http-server.js";
import type { WorkerHttpConfig } from "./worker-http-config.js";

const servers: Array<ReturnType<typeof createWorkerHttpServer>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  })));
});

const config: WorkerHttpConfig = {
  enabled: true,
  host: "127.0.0.1",
  port: 0,
  workerId: "otthon-worker",
  label: "Otthoni Worker",
  workspaceRootLabel: "codex_works-home",
  workspaceRoot: "",
  sharedSecretEnv: "ATTYS_WORKER_SHARED_SECRET_HOME",
};

async function startServer(env: NodeJS.ProcessEnv = {}) {
  const server = createWorkerHttpServer({
    config,
    env,
    now: () => new Date("2026-08-01T12:00:00.000Z"),
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing test server address");
  return `http://127.0.0.1:${address.port}`;
}

describe("worker HTTP server", () => {
  it("serves public-safe health without a secret when none is configured", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/health`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      status: "ready",
      workerId: "otthon-worker",
      label: "Otthoni Worker",
      hostKind: "windows-worker",
      workspaceRootLabel: "codex_works-home",
      startedAt: "2026-08-01T12:00:00.000Z",
      checkedAt: "2026-08-01T12:00:00.000Z",
      capabilities: ["health", "repo-status", "named-checks"],
    });
  });

  it("requires the archive-compatible shared-secret header when configured", async () => {
    const baseUrl = await startServer({ ATTYS_WORKER_SHARED_SECRET_HOME: "secret-value" });

    await expect(fetch(`${baseUrl}/health`)).resolves.toMatchObject({ status: 401 });

    const response = await fetch(`${baseUrl}/health`, {
      headers: { "x-telecodex-shared-secret": "secret-value" },
    });

    expect(response.status).toBe(200);
  });

  it("requires a project name for repo status", async () => {
    const baseUrl = await startServer();

    await expect(fetch(`${baseUrl}/repo-status`)).resolves.toMatchObject({ status: 400 });
  });

  it("runs only fixed named checks through the injected runner", async () => {
    const server = createWorkerHttpServer({
      config: {
        ...config,
        workspaceRoot: "E:\\codex_works",
      },
      runCheck: async () => [{
        name: "plans",
        status: "passed",
        exitCode: 0,
        timedOut: false,
        stopped: false,
        publicOutput: "ok",
        startedAt: "2026-08-01T12:00:00.000Z",
        finishedAt: "2026-08-01T12:00:00.010Z",
        durationMs: 10,
      }],
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");

    const response = await fetch(`http://127.0.0.1:${address.port}/checks/plans?project=Attys_DC_BOT`, {
      method: "POST",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      check: "plans",
      project: "Attys_DC_BOT",
    });
    await expect(fetch(`http://127.0.0.1:${address.port}/checks/install?project=Attys_DC_BOT`, {
      method: "POST",
    })).resolves.toMatchObject({ status: 400 });
  });

  it("does not expose local paths in health payload", async () => {
    const server = createWorkerHttpServer({
      config: {
        ...config,
        label: "C:\\Users\\operator\\repo",
        workspaceRootLabel: "E:\\codex_works",
      },
      now: () => new Date("2026-08-01T12:00:00.000Z"),
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");

    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    const serialized = JSON.stringify(await response.json());

    expect(serialized).toContain("<local-path>");
    expect(serialized).not.toContain("operator");
  });
});
