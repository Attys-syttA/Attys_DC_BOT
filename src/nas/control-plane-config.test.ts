import { describe, expect, it } from "vitest";
import {
  buildPublicNasWorkerTargets,
  parseNasControlPlaneConfig,
} from "./control-plane-config.js";

describe("NAS control-plane config", () => {
  it("uses safe defaults for the staging slice", () => {
    expect(parseNasControlPlaneConfig({})).toEqual({
      controlPlaneName: "attys-dc-bot-nas",
      publicBaseUrl: "",
      workerHeartbeatTimeoutMs: 120_000,
      workers: [],
      statusProject: "Attys_DC_BOT",
      statusCheck: null,
      codexExecutionEnabled: false,
    });
  });

  it("parses explicit public-safe NAS values", () => {
    expect(parseNasControlPlaneConfig({
      ATTYS_NAS_CONTROL_PLANE_NAME: "home nas control",
      ATTYS_NAS_PUBLIC_BASE_URL: "https://nas.example.invalid/discord-codex",
      ATTYS_WORKER_HEARTBEAT_TIMEOUT_MS: "60000",
      ATTYS_NAS_CODEX_EXECUTION_ENABLED: "false",
    })).toEqual({
      controlPlaneName: "home-nas-control",
      publicBaseUrl: "https://nas.example.invalid/discord-codex",
      workerHeartbeatTimeoutMs: 60_000,
      workers: [],
      statusProject: "Attys_DC_BOT",
      statusCheck: null,
      codexExecutionEnabled: false,
    });
  });

  it("parses optional worker status project and fixed check", () => {
    expect(parseNasControlPlaneConfig({
      ATTYS_NAS_STATUS_PROJECT: "email_header_analyzer",
      ATTYS_NAS_STATUS_CHECK: "plans",
    })).toMatchObject({
      statusProject: "email_header_analyzer",
      statusCheck: "plans",
    });
  });

  it("parses archive-derived worker targets without exposing shared secrets", () => {
    const config = parseNasControlPlaneConfig({
      ATTYS_NAS_WORKERS_JSON: JSON.stringify([{
        id: "Otthon",
        label: "Otthoni Worker",
        baseUrl: "http://worker-home.example.invalid:8787/",
        sharedSecretEnv: "ATTYS_WORKER_SHARED_SECRET_HOME",
        workspaceRootLabel: "E:\\codex_works",
      }]),
    });

    expect(config.workers).toEqual([{
      id: "otthon",
      label: "Otthoni Worker",
      baseUrl: "http://worker-home.example.invalid:8787",
      sharedSecretEnv: "ATTYS_WORKER_SHARED_SECRET_HOME",
      workspaceRootLabel: "<local-path>",
    }]);
    expect(buildPublicNasWorkerTargets(config.workers)).toEqual([{
      id: "otthon",
      label: "Otthoni Worker",
      hasSharedSecret: true,
      workspaceRootLabel: "<local-path>",
    }]);
    expect(JSON.stringify(buildPublicNasWorkerTargets(config.workers))).not.toContain("worker-home.example.invalid");
  });

  it("rejects duplicate or non-http worker targets", () => {
    expect(() => parseNasControlPlaneConfig({
      ATTYS_NAS_WORKERS_JSON: JSON.stringify([
        {
          id: "home",
          label: "Home",
          baseUrl: "http://worker-home.example.invalid",
          sharedSecretEnv: "ATTYS_WORKER_SHARED_SECRET_HOME",
        },
        {
          id: "home",
          label: "Home 2",
          baseUrl: "http://worker-home-2.example.invalid",
          sharedSecretEnv: "ATTYS_WORKER_SHARED_SECRET_HOME",
        },
      ]),
    })).toThrow("Duplicate worker id");

    expect(() => parseNasControlPlaneConfig({
      ATTYS_NAS_WORKERS_JSON: JSON.stringify([
        {
          id: "home",
          label: "Home",
          baseUrl: "file:///tmp/worker.sock",
          sharedSecretEnv: "ATTYS_WORKER_SHARED_SECRET_HOME",
        },
      ]),
    })).toThrow("worker baseUrl must be an http(s) URL");
  });

  it("requires public worker targets to use a configured shared-secret env name", () => {
    expect(() => parseNasControlPlaneConfig({
      ATTYS_NAS_WORKERS_JSON: JSON.stringify([{
        id: "home",
        label: "Home",
        baseUrl: "http://worker-home.example.invalid:8787",
      }]),
    })).toThrow("sharedSecretEnv must be a non-empty environment variable name");

    expect(() => parseNasControlPlaneConfig({
      ATTYS_NAS_WORKERS_JSON: JSON.stringify([{
        id: "home",
        label: "Home",
        baseUrl: "http://worker-home.example.invalid:8787",
        sharedSecretEnv: "worker-secret",
      }]),
    })).toThrow("sharedSecretEnv must be an uppercase environment variable name");
  });

  it("rejects loopback worker targets for the NAS control-plane", () => {
    for (const baseUrl of [
      "http://localhost:8787",
      "http://127.0.0.1:8787",
      "http://127.10.20.30:8787",
      "http://0.0.0.0:8787",
      "http://[::1]:8787",
    ]) {
      expect(() => parseNasControlPlaneConfig({
        ATTYS_NAS_WORKERS_JSON: JSON.stringify([{
          id: "home",
          label: "Home",
          baseUrl,
          sharedSecretEnv: "ATTYS_WORKER_SHARED_SECRET_HOME",
        }]),
      }), baseUrl).toThrow("worker baseUrl must point to a reachable PC worker host");
    }
  });

  it("allows loopback worker targets only for explicit local smoke tests", () => {
    expect(parseNasControlPlaneConfig({
      ATTYS_NAS_ALLOW_LOOPBACK_WORKERS_FOR_SMOKE: "true",
      ATTYS_NAS_WORKERS_JSON: JSON.stringify([{
        id: "loopback",
        label: "Loopback",
        baseUrl: "http://127.0.0.1:8787",
        sharedSecretEnv: "ATTYS_WORKER_SHARED_SECRET_HOME",
      }]),
    }).workers[0]?.baseUrl).toBe("http://127.0.0.1:8787");
  });

  it("rejects unsupported NAS-side Codex execution", () => {
    expect(() => parseNasControlPlaneConfig({
      ATTYS_NAS_CODEX_EXECUTION_ENABLED: "true",
    })).toThrow("NAS-side Codex execution is not supported");
  });

  it("rejects invalid public base URLs", () => {
    expect(() => parseNasControlPlaneConfig({
      ATTYS_NAS_PUBLIC_BASE_URL: "file:///tmp/socket",
    })).toThrow("ATTYS_NAS_PUBLIC_BASE_URL must be empty or an http(s) URL");
  });

  it("keeps heartbeat timeout inside the supported envelope", () => {
    expect(() => parseNasControlPlaneConfig({
      ATTYS_WORKER_HEARTBEAT_TIMEOUT_MS: "999",
    })).toThrow("ATTYS_WORKER_HEARTBEAT_TIMEOUT_MS");
    expect(() => parseNasControlPlaneConfig({
      ATTYS_WORKER_HEARTBEAT_TIMEOUT_MS: "9999999",
    })).toThrow("ATTYS_WORKER_HEARTBEAT_TIMEOUT_MS");
  });

  it("rejects unsafe project names and unsupported status checks", () => {
    expect(() => parseNasControlPlaneConfig({
      ATTYS_NAS_STATUS_PROJECT: "..\\secret",
    })).toThrow("ATTYS_NAS_STATUS_PROJECT");

    expect(() => parseNasControlPlaneConfig({
      ATTYS_NAS_STATUS_CHECK: "npm install",
    })).toThrow("ATTYS_NAS_STATUS_CHECK");
  });
});
