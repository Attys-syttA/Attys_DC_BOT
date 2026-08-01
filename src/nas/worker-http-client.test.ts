import { describe, expect, it, vi } from "vitest";
import {
  NasWorkerHttpClient,
  probeNasWorkersHealth,
  readNasWorkersRepoStatus,
  runNasWorkersNamedCheck,
} from "./worker-http-client.js";

const worker = {
  id: "otthon",
  label: "Otthoni worker",
  baseUrl: "http://worker-home.example.invalid:8787",
  sharedSecretEnv: "ATTYS_WORKER_SHARED_SECRET_HOME",
  workspaceRootLabel: "codex_works-home",
};

describe("NAS worker HTTP client", () => {
  it("probes worker health with the archive-compatible shared-secret header", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status: "ready" }), { status: 200 }));

    const result = await new NasWorkerHttpClient({
      worker,
      env: { ATTYS_WORKER_SHARED_SECRET_HOME: "secret-value" },
      fetchImpl,
    }).probeHealth();

    expect(result).toEqual({
      workerId: "otthon",
      ok: true,
      statusCode: 200,
      summary: "worker health ready",
    });
    expect(fetchImpl).toHaveBeenCalledWith("http://worker-home.example.invalid:8787/health", expect.objectContaining({
      headers: { "x-telecodex-shared-secret": "secret-value" },
      method: "GET",
    }));
  });

  it("returns public-safe failure details without throwing", async () => {
    const fetchImpl = vi.fn(async () => new Response("C:\\Users\\operator\\secret TOKEN=abc123", {
      status: 503,
      statusText: "Service Unavailable",
    }));

    const result = await new NasWorkerHttpClient({ worker, fetchImpl }).probeHealth();

    expect(result).toEqual({
      workerId: "otthon",
      ok: false,
      statusCode: 503,
      summary: "503 Service Unavailable",
    });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("abc123");
  });

  it("probes configured workers sequentially", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 200 }));

    await expect(probeNasWorkersHealth([worker, { ...worker, id: "munkahely" }], {
      fetchImpl,
    })).resolves.toEqual([
      {
        workerId: "otthon",
        ok: true,
        statusCode: 200,
        summary: "worker health ok",
      },
      {
        workerId: "munkahely",
        ok: true,
        statusCode: 200,
        summary: "worker health ok",
      },
    ]);
  });

  it("reads public-safe repo status from a worker", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      project: "E:\\codex_works\\Attys_DC_BOT",
      branch: "main",
      clean: false,
      summary: "dirty",
    }), { status: 200 }));

    const result = await new NasWorkerHttpClient({
      worker,
      env: { ATTYS_WORKER_SHARED_SECRET_HOME: "secret-value" },
      fetchImpl,
    }).getRepoStatus("Attys_DC_BOT");

    expect(result).toEqual({
      workerId: "otthon",
      ok: true,
      statusCode: 200,
      project: "<local-path>",
      branch: "main",
      clean: false,
      summary: "dirty",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://worker-home.example.invalid:8787/repo-status?project=Attys_DC_BOT",
      expect.objectContaining({
        headers: { "x-telecodex-shared-secret": "secret-value" },
        method: "GET",
      }),
    );
  });

  it("runs a fixed named check on a worker", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      check: "plans",
      project: "Attys_DC_BOT",
      results: [{ name: "plans", status: "passed" }],
    }), { status: 200 }));

    await expect(new NasWorkerHttpClient({
      worker,
      fetchImpl,
    }).runNamedCheck("Attys_DC_BOT", "plans")).resolves.toEqual({
      workerId: "otthon",
      ok: true,
      statusCode: 200,
      check: "plans",
      project: "Attys_DC_BOT",
      summary: "1/1 passed",
    });
  });

  it("reads repo status and named checks for all configured workers", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.includes("/repo-status")) {
        return new Response(JSON.stringify({
          ok: true,
          project: "Attys_DC_BOT",
          branch: "main",
          clean: true,
          summary: "clean",
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        ok: true,
        check: "plans",
        project: "Attys_DC_BOT",
        results: [{ name: "plans", status: "passed" }],
      }), { status: 200 });
    });

    await expect(readNasWorkersRepoStatus([worker, { ...worker, id: "munkahely" }], "Attys_DC_BOT", {
      fetchImpl,
    })).resolves.toHaveLength(2);

    await expect(runNasWorkersNamedCheck([worker, { ...worker, id: "munkahely" }], "Attys_DC_BOT", "plans", {
      fetchImpl,
    })).resolves.toHaveLength(2);
  });
});
