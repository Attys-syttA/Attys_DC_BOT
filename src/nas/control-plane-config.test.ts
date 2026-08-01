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
      codexExecutionEnabled: false,
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
      baseUrl: "http://worker-home.example.invalid:8787",
      hasSharedSecret: true,
      workspaceRootLabel: "<local-path>",
    }]);
  });

  it("rejects duplicate or non-http worker targets", () => {
    expect(() => parseNasControlPlaneConfig({
      ATTYS_NAS_WORKERS_JSON: JSON.stringify([
        { id: "home", label: "Home", baseUrl: "http://worker-home.example.invalid" },
        { id: "home", label: "Home 2", baseUrl: "http://worker-home-2.example.invalid" },
      ]),
    })).toThrow("Duplicate worker id");

    expect(() => parseNasControlPlaneConfig({
      ATTYS_NAS_WORKERS_JSON: JSON.stringify([
        { id: "home", label: "Home", baseUrl: "file:///tmp/worker.sock" },
      ]),
    })).toThrow("worker baseUrl must be an http(s) URL");
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
});
