import { isAuditCheckName } from "../audit/check-catalog.js";
import { runAuditCheckPipeline, type AuditCheckRunResult } from "../audit/check-runner.js";
import { sanitizePublicText } from "../utils/public-safety.js";
import { resolveProjectPath } from "../worker/repo-status.js";
import {
  archiveHandoffEnvelope,
  createHandoffEnvelope,
  listHandoffEnvelopeFiles,
  readHandoffEnvelope,
  writeHandoffEnvelope,
  type HandoffEnvelope,
} from "./handoff-store.js";

export interface HandoffWorkerOptions {
  handoffRoot: string;
  workspaceRoot: string;
  runCheck?: typeof runAuditCheckPipeline;
  now?: () => Date;
}

export interface HandoffWorkerProcessResult {
  processed: number;
  skipped: number;
  outboxIds: string[];
  archivedIds: string[];
}

export async function processQueuedHandoffOnce(options: HandoffWorkerOptions): Promise<HandoffWorkerProcessResult> {
  const runCheck = options.runCheck ?? runAuditCheckPipeline;
  const now = options.now ?? (() => new Date());
  const result: HandoffWorkerProcessResult = {
    processed: 0,
    skipped: 0,
    outboxIds: [],
    archivedIds: [],
  };

  for (const filePath of listHandoffEnvelopeFiles(options.handoffRoot, "inbox")) {
    let envelope: HandoffEnvelope;
    try {
      envelope = readHandoffEnvelope(filePath);
    } catch {
      result.skipped += 1;
      continue;
    }

    if (
      envelope.type !== "audit.request" ||
      envelope.target !== "pc-worker" ||
      envelope.status !== "queued"
    ) {
      result.skipped += 1;
      continue;
    }

    const outboxEnvelope = await processAuditRequest(envelope, options.workspaceRoot, runCheck, now);
    writeHandoffEnvelope(options.handoffRoot, "outbox", outboxEnvelope);
    archiveHandoffEnvelope(options.handoffRoot, "inbox", envelope.id);
    result.processed += 1;
    result.outboxIds.push(outboxEnvelope.id);
    result.archivedIds.push(envelope.id);
  }

  return result;
}

async function processAuditRequest(
  envelope: HandoffEnvelope,
  workspaceRoot: string,
  runCheck: typeof runAuditCheckPipeline,
  now: () => Date,
): Promise<HandoffEnvelope> {
  const project = envelope.publicFields.project ?? "";
  const check = envelope.publicFields.check ?? "";

  if (!isAuditCheckName(check)) {
    return createResultEnvelope(envelope, "failed", {
      check,
      project,
      summary: "unsupported check",
      passed: false,
    }, now());
  }

  try {
    const projectPath = resolveProjectPath(workspaceRoot, project);
    const results = await runCheck(projectPath, check);
    const passed = results.every((entry) => entry.status === "passed");
    return createResultEnvelope(envelope, passed ? "completed" : "failed", {
      check,
      project,
      summary: summarizeAuditResults(results),
      passed,
    }, now());
  } catch (error) {
    return createResultEnvelope(envelope, "failed", {
      check,
      project,
      summary: sanitizePublicText(error instanceof Error ? error.message : String(error), 160),
      passed: false,
    }, now());
  }
}

function createResultEnvelope(
  request: HandoffEnvelope,
  status: "completed" | "failed",
  fields: { check: string; project: string; summary: string; passed: boolean },
  now: Date,
): HandoffEnvelope {
  return createHandoffEnvelope({
    id: `result-${request.id}`,
    type: "audit.result",
    source: "pc-worker",
    target: "nas-control-plane",
    status,
    publicSummary: `Audit result request=${request.id} check=${fields.check} summary=${fields.summary}`,
    publicFields: {
      check: fields.check,
      project: fields.project,
      request: request.id,
      result: fields.passed ? "passed" : "failed",
      summary: fields.summary,
    },
  }, now);
}

function summarizeAuditResults(results: AuditCheckRunResult[]): string {
  if (results.length === 0) return "0/0 passed";
  const passed = results.filter((entry) => entry.status === "passed").length;
  return `${passed}/${results.length} passed`;
}
