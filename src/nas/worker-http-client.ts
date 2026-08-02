import { sanitizePublicText } from "../utils/public-safety.js";
import type { AuditCheckName } from "../audit/check-catalog.js";
import type { NasWorkerTarget } from "./control-plane-config.js";

export interface NasWorkerHealthResult {
  workerId: string;
  ok: boolean;
  statusCode: number | null;
  summary: string;
}

export interface NasWorkerRepoStatusResult {
  workerId: string;
  ok: boolean;
  statusCode: number | null;
  project: string;
  branch: string | null;
  clean: boolean | null;
  summary: string;
}

export interface NasWorkerNamedCheckResult {
  workerId: string;
  ok: boolean;
  statusCode: number | null;
  check: string;
  project: string;
  summary: string;
}

export interface NasWorkerHttpClientOptions {
  worker: NasWorkerTarget;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class NasWorkerHttpClient {
  private readonly worker: NasWorkerTarget;
  private readonly env: NodeJS.ProcessEnv;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: NasWorkerHttpClientOptions) {
    this.worker = options.worker;
    this.env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async probeHealth(): Promise<NasWorkerHealthResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.worker.baseUrl}/health`, {
        method: "GET",
        headers: this.authHeaders(),
        signal: controller.signal,
      });
      const body = await response.text().catch(() => "");
      return {
        workerId: this.worker.id,
        ok: response.ok,
        statusCode: response.status,
        summary: response.ok
          ? summarizeHealthBody(body)
          : sanitizePublicText(`${response.status} ${response.statusText}`, 160),
      };
    } catch (error) {
      return {
        workerId: this.worker.id,
        ok: false,
        statusCode: null,
        summary: sanitizePublicText(error instanceof Error ? error.message : String(error), 160) || "worker probe failed",
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async getRepoStatus(project: string): Promise<NasWorkerRepoStatusResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const safeProject = sanitizePublicText(project, 120) || "unknown";
    try {
      const url = new URL(`${this.worker.baseUrl}/repo-status`);
      url.searchParams.set("project", project);
      const response = await this.fetchImpl(url.toString(), {
        method: "GET",
        headers: this.authHeaders(),
        signal: controller.signal,
      });
      const body = await response.text().catch(() => "");
      if (!response.ok) {
        return {
          workerId: this.worker.id,
          ok: false,
          statusCode: response.status,
          project: safeProject,
          branch: null,
          clean: null,
          summary: sanitizePublicText(`${response.status} ${response.statusText}`, 160),
        };
      }
      return normalizeRepoStatus(this.worker.id, safeProject, body, response.status);
    } catch (error) {
      return {
        workerId: this.worker.id,
        ok: false,
        statusCode: null,
        project: safeProject,
        branch: null,
        clean: null,
        summary: sanitizePublicText(error instanceof Error ? error.message : String(error), 160) || "worker repo status failed",
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async runNamedCheck(project: string, checkName: AuditCheckName): Promise<NasWorkerNamedCheckResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const safeProject = sanitizePublicText(project, 120) || "unknown";
    try {
      const url = new URL(`${this.worker.baseUrl}/checks/${encodeURIComponent(checkName)}`);
      url.searchParams.set("project", project);
      const response = await this.fetchImpl(url.toString(), {
        method: "POST",
        headers: this.authHeaders(),
        signal: controller.signal,
      });
      const body = await response.text().catch(() => "");
      return normalizeNamedCheckResult(this.worker.id, safeProject, checkName, body, response.status, response.ok);
    } catch (error) {
      return {
        workerId: this.worker.id,
        ok: false,
        statusCode: null,
        check: checkName,
        project: safeProject,
        summary: sanitizePublicText(error instanceof Error ? error.message : String(error), 160) || "worker named check failed",
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private authHeaders(): Record<string, string> {
    const secret = this.env[this.worker.sharedSecretEnv]?.trim();
    if (!secret) {
      throw new Error(`Worker shared secret env is missing: ${this.worker.sharedSecretEnv}`);
    }

    // Keep the old NAS archive worker header for compatibility with the historical worker contract.
    return { "x-telecodex-shared-secret": secret };
  }
}

export async function probeNasWorkersHealth(
  workers: NasWorkerTarget[],
  options: Omit<NasWorkerHttpClientOptions, "worker"> = {},
): Promise<NasWorkerHealthResult[]> {
  const results: NasWorkerHealthResult[] = [];
  for (const worker of workers) {
    results.push(await new NasWorkerHttpClient({ ...options, worker }).probeHealth());
  }
  return results;
}

export async function readNasWorkersRepoStatus(
  workers: NasWorkerTarget[],
  project: string,
  options: Omit<NasWorkerHttpClientOptions, "worker"> = {},
): Promise<NasWorkerRepoStatusResult[]> {
  const results: NasWorkerRepoStatusResult[] = [];
  for (const worker of workers) {
    results.push(await new NasWorkerHttpClient({ ...options, worker }).getRepoStatus(project));
  }
  return results;
}

export async function runNasWorkersNamedCheck(
  workers: NasWorkerTarget[],
  project: string,
  checkName: AuditCheckName,
  options: Omit<NasWorkerHttpClientOptions, "worker"> = {},
): Promise<NasWorkerNamedCheckResult[]> {
  const results: NasWorkerNamedCheckResult[] = [];
  for (const worker of workers) {
    results.push(await new NasWorkerHttpClient({ ...options, worker }).runNamedCheck(project, checkName));
  }
  return results;
}

function summarizeHealthBody(body: string): string {
  if (!body.trim()) return "worker health ok";
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const status = parsed.status ?? parsed.ok ?? "ok";
    return sanitizePublicText(`worker health ${String(status)}`, 160);
  } catch {
    return sanitizePublicText(body, 160) || "worker health ok";
  }
}

function normalizeRepoStatus(
  workerId: string,
  fallbackProject: string,
  body: string,
  statusCode: number,
): NasWorkerRepoStatusResult {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return {
      workerId,
      ok: parsed.ok === true,
      statusCode,
      project: sanitizePublicText(parsed.project ?? fallbackProject, 160) || fallbackProject,
      branch: typeof parsed.branch === "string" ? sanitizePublicText(parsed.branch, 80) : null,
      clean: typeof parsed.clean === "boolean" ? parsed.clean : null,
      summary: sanitizePublicText(parsed.summary ?? "repo status unavailable", 160),
    };
  } catch {
    return {
      workerId,
      ok: false,
      statusCode,
      project: fallbackProject,
      branch: null,
      clean: null,
      summary: sanitizePublicText(body, 160) || "repo status unavailable",
    };
  }
}

function normalizeNamedCheckResult(
  workerId: string,
  fallbackProject: string,
  checkName: string,
  body: string,
  statusCode: number,
  responseOk: boolean,
): NasWorkerNamedCheckResult {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return {
      workerId,
      ok: responseOk && parsed.ok === true,
      statusCode,
      check: sanitizePublicText(parsed.check ?? checkName, 80) || checkName,
      project: sanitizePublicText(parsed.project ?? fallbackProject, 160) || fallbackProject,
      summary: summarizeCheckResults(parsed),
    };
  } catch {
    return {
      workerId,
      ok: false,
      statusCode,
      check: checkName,
      project: fallbackProject,
      summary: sanitizePublicText(body, 160) || "named check unavailable",
    };
  }
}

function summarizeCheckResults(parsed: Record<string, unknown>): string {
  const results = Array.isArray(parsed.results) ? parsed.results : [];
  if (results.length === 0) {
    return sanitizePublicText(parsed.error ?? "no check results", 160);
  }
  const passed = results.filter((result) =>
    result && typeof result === "object" && (result as { status?: unknown }).status === "passed",
  ).length;
  return `${passed}/${results.length} passed`;
}
