import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { z } from "zod";
import { sanitizePublicText } from "../utils/public-safety.js";
import { windowsCmdInvocation } from "../utils/process.js";
import {
  AuditCheckDefinition,
  AuditCheckName,
  buildAuditCheckPipeline,
  checkAuditScriptSupport,
} from "./check-catalog.js";

export type AuditCheckRunStatus = "passed" | "failed" | "timed_out" | "unsupported" | "stopped" | "error";

export interface AuditProcessResult {
  exitCode: number | null;
  timedOut: boolean;
  stopped: boolean;
  output: string;
}

export interface AuditCheckRunResult {
  name: AuditCheckDefinition["name"];
  status: AuditCheckRunStatus;
  exitCode: number | null;
  timedOut: boolean;
  stopped: boolean;
  publicOutput: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export type AuditProcessRunner = (
  definition: AuditCheckDefinition,
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal,
) => Promise<AuditProcessResult>;

export interface AuditCheckRunnerOptions {
  runner?: AuditProcessRunner;
  signal?: AbortSignal;
  now?: () => Date;
}

const packageJsonSchema = z.object({
  scripts: z.record(z.string(), z.string()).optional(),
});

export function readPackageScripts(projectPath: string): Record<string, string> {
  const packageJsonPath = path.join(projectPath, "package.json");
  const parsed = packageJsonSchema.parse(JSON.parse(fs.readFileSync(packageJsonPath, "utf8")));
  return parsed.scripts ?? {};
}

function buildPublicOutput(output: string): string {
  return sanitizePublicText(output, 1_800) || "(no output)";
}

function statusFromProcessResult(result: AuditProcessResult): AuditCheckRunStatus {
  if (result.stopped) return "stopped";
  if (result.timedOut) return "timed_out";
  if (result.exitCode === 0) return "passed";
  if (result.exitCode === null) return "error";
  return "failed";
}

function unsupportedResult(
  definition: AuditCheckDefinition,
  reason: string,
  startedAt: Date,
  finishedAt: Date,
): AuditCheckRunResult {
  return {
    name: definition.name,
    status: "unsupported",
    exitCode: null,
    timedOut: false,
    stopped: false,
    publicOutput: reason,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
  };
}

export function runAuditProcess(
  definition: AuditCheckDefinition,
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<AuditProcessResult> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve({
        exitCode: null,
        timedOut: false,
        stopped: true,
        output: "stopped before command start",
      });
      return;
    }

    const invocation = windowsCmdInvocation(definition.executable, definition.args);
    const child = spawn(invocation.command, invocation.args, {
      cwd,
      windowsHide: true,
    });

    let output = "";
    let timedOut = false;
    let stopped = false;
    let settled = false;

    const settle = (result: AuditProcessResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    const onAbort = (): void => {
      stopped = true;
      child.kill();
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      settle({
        exitCode: null,
        timedOut: false,
        stopped,
        output: error.message,
      });
    });
    child.on("close", (code) => {
      settle({
        exitCode: code,
        timedOut,
        stopped,
        output,
      });
    });
  });
}

export async function runAuditCheckPipeline(
  projectPath: string,
  checkName: AuditCheckName,
  options: AuditCheckRunnerOptions = {},
): Promise<AuditCheckRunResult[]> {
  const runner = options.runner ?? runAuditProcess;
  const now = options.now ?? (() => new Date());
  const packageScripts = readPackageScripts(projectPath);
  const results: AuditCheckRunResult[] = [];

  for (const definition of buildAuditCheckPipeline(checkName)) {
    const startedAt = now();
    const support = checkAuditScriptSupport(definition, packageScripts);
    if (support.status === "unsupported") {
      const finishedAt = now();
      results.push(unsupportedResult(definition, support.reason ?? "unsupported check", startedAt, finishedAt));
      break;
    }

    const processResult = await runner(definition, projectPath, definition.timeoutMs, options.signal);
    const finishedAt = now();
    const result: AuditCheckRunResult = {
      name: definition.name,
      status: statusFromProcessResult(processResult),
      exitCode: processResult.exitCode,
      timedOut: processResult.timedOut,
      stopped: processResult.stopped,
      publicOutput: buildPublicOutput(processResult.output),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    };
    results.push(result);

    if (result.status !== "passed") break;
  }

  return results;
}
