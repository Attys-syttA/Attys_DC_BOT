import { describe, expect, it, vi } from "vitest";
import { AUDIT_JOB_STEP_CONTRACT_VERSION } from "./job-step-contract.js";
import { AUDIT_REPAIR_CONTRACT_VERSION } from "./repair-contract.js";
import { runSyntheticAuditRepairFlowAcceptance } from "./repair-flow-acceptance.js";

vi.mock("better-sqlite3", async () => {
  const actual = await vi.importActual("better-sqlite3") as any;
  const RealDatabase = actual.default;
  return {
    default: function MemoryDatabase(_path: string, options?: object) {
      return new RealDatabase(":memory:", options);
    },
  };
});

describe("audit repair flow acceptance", () => {
  it("runs one approved isolated repair, requires review, rechecks, and cleans up without touching source", async () => {
    await expect(runSyntheticAuditRepairFlowAcceptance()).resolves.toMatchObject({
      ok: true,
      jobStepContractVersion: AUDIT_JOB_STEP_CONTRACT_VERSION,
      repairContractVersion: AUDIT_REPAIR_CONTRACT_VERSION,
      firstCheckStatus: "failed",
      repairExecutionStatus: "started",
      repairReviewStatus: "reviewed",
      recheckStatus: "passed",
      finalJobStatus: "completed",
      sourceWorktreeClean: true,
      sourceWorktreePreserved: true,
      dirtyCleanupRetained: true,
      finalCleanupStatus: "removed",
    });
  });
});
