import { describe, expect, it } from "vitest";
import { parseNasControlPlaneConfig } from "./control-plane-config.js";

describe("NAS control-plane config", () => {
  it("uses safe defaults for the staging slice", () => {
    expect(parseNasControlPlaneConfig({})).toEqual({
      controlPlaneName: "attys-dc-bot-nas",
      publicBaseUrl: "",
      workerHeartbeatTimeoutMs: 120_000,
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
      codexExecutionEnabled: false,
    });
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
