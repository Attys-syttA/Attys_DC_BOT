import { describe, expect, it } from "vitest";
import { buildAuditIssueFingerprint, hasMatchingPreviousFailure } from "./fingerprint.js";
import type { AuditCheckRunResult } from "./check-runner.js";
import type { AuditStepRecord } from "../db/types.js";

function makeResult(overrides: Partial<AuditCheckRunResult> = {}): AuditCheckRunResult {
  return {
    name: "tests",
    status: "failed",
    exitCode: 1,
    timedOut: false,
    stopped: false,
    publicOutput: "FAIL test\nfinished at 2026-08-01T12:00:00.000Z in 123ms",
    startedAt: "2026-08-01T12:00:00.000Z",
    finishedAt: "2026-08-01T12:00:01.000Z",
    durationMs: 1_000,
    ...overrides,
  };
}

function makeStep(overrides: Partial<AuditStepRecord> = {}): AuditStepRecord {
  return {
    id: "step-1",
    job_id: "audit-job-1",
    step_name: "tests",
    status: "failed",
    exit_code: 1,
    timed_out: 0,
    stopped: 0,
    public_output: "FAIL test\nfinished at 2026-08-02T13:00:00.000Z in 456ms",
    started_at: "2026-08-01T12:00:00.000Z",
    finished_at: "2026-08-01T12:00:01.000Z",
    duration_ms: 1_000,
    created_at: "2026-08-01T12:00:01.000Z",
    ...overrides,
  };
}

describe("audit issue fingerprints", () => {
  it("normalizes noisy timestamps and durations", () => {
    const first = buildAuditIssueFingerprint({
      name: "tests",
      status: "failed",
      exitCode: 1,
      timedOut: false,
      stopped: false,
      publicOutput: "FAIL test\nfinished at 2026-08-01T12:00:00.000Z in 123ms",
    });
    const second = buildAuditIssueFingerprint({
      name: "tests",
      status: "failed",
      exitCode: 1,
      timedOut: false,
      stopped: false,
      publicOutput: "FAIL test\nfinished at 2026-08-02T13:00:00.000Z in 456ms",
    });

    expect(second).toBe(first);
  });

  it("matches a repeated public-safe failed check output", () => {
    expect(hasMatchingPreviousFailure([makeStep()], makeResult())).toBe(true);
  });

  it("does not match passed results or different checks", () => {
    expect(hasMatchingPreviousFailure([makeStep()], makeResult({ status: "passed", exitCode: 0 }))).toBe(false);
    expect(hasMatchingPreviousFailure([makeStep({ step_name: "lint" })], makeResult())).toBe(false);
  });
});
