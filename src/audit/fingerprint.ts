import { createHash } from "node:crypto";
import type { AuditCheckRunResult } from "./check-runner.js";
import type { AuditStepRecord } from "../db/types.js";

export interface AuditIssueFingerprintInput {
  name: string;
  status: string;
  exitCode: number | null;
  timedOut: boolean;
  stopped: boolean;
  publicOutput: string;
}

function normalizePublicOutput(output: string): string {
  return output
    .replace(/\r\n/g, "\n")
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, "<iso-timestamp>")
    .replace(/\b\d+(?:\.\d+)?\s?ms\b/gi, "<duration>")
    .replace(/\b\d+(?:\.\d+)?\s?s\b/gi, "<duration>")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function buildAuditIssueFingerprint(input: AuditIssueFingerprintInput): string {
  const payload = JSON.stringify({
    name: input.name,
    status: input.status,
    exitCode: input.exitCode,
    timedOut: input.timedOut,
    stopped: input.stopped,
    publicOutput: normalizePublicOutput(input.publicOutput),
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export function buildAuditRunResultFingerprint(result: AuditCheckRunResult): string {
  return buildAuditIssueFingerprint({
    name: result.name,
    status: result.status,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    stopped: result.stopped,
    publicOutput: result.publicOutput,
  });
}

export function buildAuditStepFingerprint(step: AuditStepRecord): string {
  return buildAuditIssueFingerprint({
    name: step.step_name,
    status: step.status,
    exitCode: step.exit_code,
    timedOut: step.timed_out === 1,
    stopped: step.stopped === 1,
    publicOutput: step.public_output,
  });
}

export function hasMatchingPreviousFailure(
  previousSteps: AuditStepRecord[],
  result: AuditCheckRunResult,
): boolean {
  if (result.status === "passed") return false;

  const resultFingerprint = buildAuditRunResultFingerprint(result);
  return previousSteps
    .filter((step) => step.step_name === result.name && step.status !== "passed")
    .some((step) => buildAuditStepFingerprint(step) === resultFingerprint);
}
