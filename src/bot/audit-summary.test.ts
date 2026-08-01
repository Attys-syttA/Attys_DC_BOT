import { describe, expect, it } from "vitest";
import { describeAuditDashboard, describeAuditInline } from "./audit-summary.js";
import type { AuditJobRecord, AuditStepRecord } from "../db/types.js";

function makeJob(overrides: Partial<AuditJobRecord> = {}): AuditJobRecord {
  return {
    id: "audit-job-1",
    channel_id: "channel-1",
    project_label: "<local-path>/app",
    mode: "check-only",
    status: "running_checks",
    requested_check: "tests",
    current_step: "tests",
    iteration: 0,
    max_iterations: 0,
    stop_requested: 1,
    capabilities_json: "[]",
    created_at: "2026-08-01T12:00:00.000Z",
    updated_at: "2026-08-01T12:00:02.000Z",
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
    public_output: "failed",
    started_at: "2026-08-01T12:00:00.000Z",
    finished_at: "2026-08-01T12:00:02.000Z",
    duration_ms: 2_000,
    created_at: "2026-08-01T12:00:02.000Z",
    ...overrides,
  };
}

describe("audit summary formatting", () => {
  it("builds a detailed public-safe dashboard summary", () => {
    const summary = describeAuditDashboard(makeJob(), [
      makeStep({ step_name: "plans", status: "passed", duration_ms: 1_000 }),
      makeStep({ step_name: "tests", status: "failed", duration_ms: 2_000 }),
    ]);

    expect(summary).toContain("Job: `audit-jo...`");
    expect(summary).toContain("Status: **running_checks** (active)");
    expect(summary).toContain("Stop requested: **yes**");
    expect(summary).toContain("Latest step: **tests failed**");
    expect(summary).toContain("Progress: **failed:1 passed:1**");
    expect(summary).toContain("Runtime: **3s**");
    expect(summary).not.toContain("channel-1");
  });

  it("builds a compact inline summary for status views", () => {
    const summary = describeAuditInline(makeJob({ status: "waiting_manual_review", stop_requested: 0 }), [
      makeStep({ step_name: "tests", status: "failed" }),
    ]);

    expect(summary).toBe("waiting_manual_review tests:failed failed:1");
  });
});
