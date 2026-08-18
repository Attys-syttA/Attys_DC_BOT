import { describe, expect, it } from "vitest";
import type { AuditJobRecord, AuditStepRecord } from "../db/types.js";
import { defaultAuditCapabilities } from "./types.js";
import {
  AUDIT_JOB_STEP_CONTRACT_VERSION,
  buildAuditJobStepContract,
  validateAuditJobStepContract,
  type AuditJobStepContract,
} from "./job-step-contract.js";

function makeJob(overrides: Partial<AuditJobRecord> = {}): AuditJobRecord {
  return {
    id: "audit-job-1",
    channel_id: "channel-1",
    project_label: "E:\\codex_works\\private-project",
    mode: "approved-repair",
    status: "waiting_manual_review",
    requested_check: "tests",
    current_step: null,
    iteration: 1,
    max_iterations: 2,
    stop_requested: 0,
    capabilities_json: JSON.stringify(defaultAuditCapabilities("approved-repair")),
    created_at: "2026-08-18T10:00:00.000Z",
    updated_at: "2026-08-18T10:01:00.000Z",
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
    public_output: "```FAIL``` public-safe assertion summary",
    started_at: "2026-08-18T10:00:00.000Z",
    finished_at: "2026-08-18T10:01:00.000Z",
    duration_ms: 60_000,
    created_at: "2026-08-18T10:01:00.000Z",
    ...overrides,
  };
}

describe("audit job step contract", () => {
  it("builds a versioned public-safe contract from persisted audit records", () => {
    const job = makeJob();
    const steps = [makeStep()];
    const contract = buildAuditJobStepContract({ job, steps });
    const serialized = JSON.stringify(contract);

    expect(contract.version).toBe(AUDIT_JOB_STEP_CONTRACT_VERSION);
    expect(contract.jobId).toBe("audit-job-1");
    expect(contract.projectLabel).toBe("<local-path>/private-project");
    expect(contract.mode).toBe("approved-repair");
    expect(contract.status).toBe("waiting_manual_review");
    expect(contract.stopRequested).toBe(false);
    expect(contract.capabilities).toEqual(defaultAuditCapabilities("approved-repair"));
    expect(contract.steps).toMatchObject([
      {
        id: "step-1",
        name: "tests",
        status: "failed",
        exitCode: 1,
        timedOut: false,
        stopped: false,
        outputSummary: "'''FAIL''' public-safe assertion summary",
      },
    ]);
    expect(serialized).not.toContain("channel-1");
    expect(serialized).not.toContain("E:\\codex_works");
    expect(validateAuditJobStepContract(contract, { job, steps })).toEqual([]);
  });

  it("detects version, iteration, and source record drift", () => {
    const job = makeJob();
    const steps = [makeStep()];
    const contract = buildAuditJobStepContract({ job, steps });
    const broken: AuditJobStepContract = {
      ...contract,
      version: "audit-job-step-contract/v0" as typeof AUDIT_JOB_STEP_CONTRACT_VERSION,
      iteration: 3,
      maxIterations: 2,
      steps: [],
    };

    expect(validateAuditJobStepContract(broken, { job, steps })).toEqual([
      "unsupported audit job step contract version",
      "audit iteration exceeds max iterations",
      "audit step count drift",
      "audit step drift at index 0",
    ]);
  });
});
