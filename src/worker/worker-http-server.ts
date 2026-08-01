import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { isAuditCheckName, type AuditCheckName } from "../audit/check-catalog.js";
import { runAuditCheckPipeline, type AuditCheckRunResult } from "../audit/check-runner.js";
import { sanitizePublicText } from "../utils/public-safety.js";
import { readWorkerRepoStatus } from "./repo-status.js";
import { resolveProjectPath } from "./repo-status.js";
import type { WorkerHttpConfig } from "./worker-http-config.js";

export interface WorkerHttpServerOptions {
  config: WorkerHttpConfig;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  runCheck?: (projectPath: string, checkName: AuditCheckName) => Promise<AuditCheckRunResult[]>;
}

export interface WorkerHealthPayload {
  ok: true;
  status: "ready";
  workerId: string;
  label: string;
  hostKind: "windows-worker";
  workspaceRootLabel: string;
  startedAt: string;
  checkedAt: string;
  capabilities: string[];
}

export function createWorkerHttpServer(options: WorkerHttpServerOptions): http.Server {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();

  return http.createServer((request, response) => {
    void handleRequest(request, response, {
      config: options.config,
      env,
      now,
      startedAt,
    });
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: WorkerHttpServerOptions & { startedAt: string; now: () => Date },
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://worker.local");
  const checkMatch = /^\/checks\/([^/]+)$/.exec(url.pathname);
  if (
    !(
      (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/repo-status")) ||
      (request.method === "POST" && checkMatch)
    )
  ) {
    writeJson(response, 404, { ok: false, error: "not found" });
    return;
  }

  if (!isAuthorized(request, context.config, context.env ?? process.env)) {
    writeJson(response, 401, { ok: false, error: "unauthorized" });
    return;
  }

  if (url.pathname === "/health") {
    writeJson(response, 200, buildWorkerHealthPayload(context.config, context.startedAt, context.now()));
    return;
  }

  if (checkMatch) {
    await handleNamedCheck(url, response, context.config, checkMatch[1], context.runCheck ?? runAuditCheckPipeline);
    return;
  }

  const project = url.searchParams.get("project") ?? "";
  if (!project) {
    writeJson(response, 400, { ok: false, error: "project is required" });
    return;
  }

  try {
    writeJson(response, 200, await readWorkerRepoStatus(context.config.workspaceRoot, project));
  } catch (error) {
    writeJson(response, 400, {
      ok: false,
      error: sanitizePublicText(error instanceof Error ? error.message : String(error), 160),
    });
  }
}

async function handleNamedCheck(
  url: URL,
  response: ServerResponse,
  config: WorkerHttpConfig,
  rawCheckName: string,
  runCheck: (projectPath: string, checkName: AuditCheckName) => Promise<AuditCheckRunResult[]>,
): Promise<void> {
  const project = url.searchParams.get("project") ?? "";
  if (!project) {
    writeJson(response, 400, { ok: false, error: "project is required" });
    return;
  }
  if (!isAuditCheckName(rawCheckName)) {
    writeJson(response, 400, { ok: false, error: "unsupported check" });
    return;
  }

  try {
    const projectPath = resolveProjectPath(config.workspaceRoot, project);
    const results = await runCheck(projectPath, rawCheckName);
    writeJson(response, 200, {
      ok: results.every((result) => result.status === "passed"),
      check: rawCheckName,
      project: sanitizePublicText(project, 120),
      results,
    });
  } catch (error) {
    writeJson(response, 400, {
      ok: false,
      error: sanitizePublicText(error instanceof Error ? error.message : String(error), 160),
    });
  }
}

function isAuthorized(
  request: IncomingMessage,
  config: WorkerHttpConfig,
  env: NodeJS.ProcessEnv,
): boolean {
  const expected = env[config.sharedSecretEnv]?.trim();
  if (!expected) return true;
  const provided = request.headers["x-telecodex-shared-secret"];
  return typeof provided === "string" && provided === expected;
}

function buildWorkerHealthPayload(
  config: WorkerHttpConfig,
  startedAt: string,
  checkedAt: Date,
): WorkerHealthPayload {
  return {
    ok: true,
    status: "ready",
    workerId: config.workerId,
    label: sanitizePublicText(config.label, 120) || "Windows Worker",
    hostKind: "windows-worker",
    workspaceRootLabel: sanitizePublicText(config.workspaceRootLabel, 120) || "codex_works",
    startedAt,
    checkedAt: checkedAt.toISOString(),
    capabilities: ["health", "repo-status", "named-checks"],
  };
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(payload)}\n`);
}
