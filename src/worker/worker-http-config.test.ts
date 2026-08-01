import { describe, expect, it } from "vitest";
import { parseWorkerHttpConfig } from "./worker-http-config.js";

describe("worker HTTP config", () => {
  it("uses safe disabled defaults", () => {
    expect(parseWorkerHttpConfig({})).toEqual({
      enabled: false,
      host: "127.0.0.1",
      port: 8787,
      workerId: "local-windows-worker",
      label: "Windows Worker",
      workspaceRootLabel: "codex_works",
      workspaceRoot: "",
      sharedSecretEnv: "ATTYS_WORKER_SHARED_SECRET_HOME",
    });
  });

  it("parses public worker metadata without exposing raw local paths", () => {
    expect(parseWorkerHttpConfig({
      ATTYS_WORKER_HTTP_ENABLED: "true",
      ATTYS_WORKER_HTTP_HOST: "0.0.0.0",
      ATTYS_WORKER_HTTP_PORT: "9876",
      ATTYS_WORKER_ID: "Otthon Worker",
      ATTYS_WORKER_LABEL: "E:\\codex_works\\Attys_DC_BOT",
      ATTYS_WORKSPACE_ROOT_LABEL: "E:\\codex_works",
      ATTYS_WORKER_WORKSPACE_ROOT: "E:\\codex_works",
      ATTYS_WORKER_SHARED_SECRET_ENV: "ATTYS_WORKER_SHARED_SECRET_HOME",
    })).toEqual({
      enabled: true,
      host: "0.0.0.0",
      port: 9876,
      workerId: "otthon-worker",
      label: "<local-path>",
      workspaceRootLabel: "<local-path>",
      workspaceRoot: "E:\\codex_works",
      sharedSecretEnv: "ATTYS_WORKER_SHARED_SECRET_HOME",
    });
  });

  it("rejects unsupported bind host and port values", () => {
    expect(() => parseWorkerHttpConfig({
      ATTYS_WORKER_HTTP_HOST: "http://bad.example.invalid",
    })).toThrow("ATTYS_WORKER_HTTP_HOST");
    expect(() => parseWorkerHttpConfig({
      ATTYS_WORKER_HTTP_PORT: "80",
    })).toThrow("ATTYS_WORKER_HTTP_PORT");
  });
});
