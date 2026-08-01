import { describe, expect, it } from "vitest";
import {
  AUDIT_CAPABILITIES,
  AUDIT_JOB_STATUSES,
  assertAuditModeAllowsCapabilities,
  buildPublicAuditJobSummary,
  canTransitionAuditStatus,
  defaultAuditCapabilities,
  isAuditCapability,
  isAuditJobStatus,
  isAuditMode,
  isTerminalAuditStatus,
  type AuditJobSummary,
} from "./types.js";

describe("audit domain contract", () => {
  it("defines the first explicit audit modes, statuses, and capabilities", () => {
    expect(isAuditMode("check-only")).toBe(true);
    expect(isAuditMode("approved-repair")).toBe(true);
    expect(isAuditMode("auto-repair")).toBe(false);
    expect(AUDIT_JOB_STATUSES).toContain("waiting_repair_approval");
    expect(AUDIT_JOB_STATUSES).toContain("waiting_nas_result");
    expect(AUDIT_JOB_STATUSES).not.toContain("interrupted");
    expect(AUDIT_CAPABILITIES).toEqual(["read-context", "edit-existing", "create-delete"]);
    expect(isAuditJobStatus("running_checks")).toBe(true);
    expect(isAuditCapability("create-delete")).toBe(true);
  });

  it("allows only the planned first state transitions", () => {
    expect(canTransitionAuditStatus("queued", "planning")).toBe(true);
    expect(canTransitionAuditStatus("running_checks", "completed")).toBe(true);
    expect(canTransitionAuditStatus("waiting_nas_result", "completed")).toBe(true);
    expect(canTransitionAuditStatus("waiting_nas_result", "running_checks")).toBe(false);
    expect(canTransitionAuditStatus("waiting_manual_review", "rechecking")).toBe(true);
    expect(canTransitionAuditStatus("running_checks", "repairing")).toBe(false);
    expect(canTransitionAuditStatus("completed", "running_checks")).toBe(false);
    expect(canTransitionAuditStatus("stagnated", "repairing")).toBe(false);
    expect(isTerminalAuditStatus("completed")).toBe(true);
    expect(isTerminalAuditStatus("waiting_manual_review")).toBe(false);
  });

  it("keeps check-only audits read-context only", () => {
    const capabilities = defaultAuditCapabilities("check-only");

    expect(capabilities).toEqual([
      { capability: "read-context", approved: true },
      { capability: "edit-existing", approved: false },
      { capability: "create-delete", approved: false },
    ]);
    expect(() => assertAuditModeAllowsCapabilities("check-only", capabilities)).not.toThrow();
    expect(() => assertAuditModeAllowsCapabilities("check-only", [
      { capability: "read-context", approved: true },
      { capability: "edit-existing", approved: true },
      { capability: "create-delete", approved: false },
    ])).toThrow("check-only audit cannot approve write capabilities");
  });

  it("keeps create/delete behind edit approval", () => {
    expect(() => assertAuditModeAllowsCapabilities("approved-repair", [
      { capability: "read-context", approved: true },
      { capability: "edit-existing", approved: false },
      { capability: "create-delete", approved: true },
    ])).toThrow("create-delete capability requires edit-existing approval");
  });

  it("builds public summaries without raw channel ids or local paths", () => {
    const summary: AuditJobSummary = {
      id: "audit-1",
      channelId: "123456789012345678",
      projectLabel: "E:\\codex_works\\private-project",
      mode: "check-only",
      status: "running_checks",
      currentStep: "tests",
      iteration: 0,
      maxIterations: 2,
      stopRequested: false,
      capabilities: defaultAuditCapabilities("check-only"),
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:01.000Z",
    };

    const publicSummary = buildPublicAuditJobSummary(summary);
    const serialized = JSON.stringify(publicSummary);

    expect(publicSummary).not.toHaveProperty("channelId");
    expect(publicSummary.projectLabel).toBe("<local-path>/private-project");
    expect(serialized).not.toContain("123456789012345678");
    expect(serialized).not.toContain("E:\\codex_works");
  });
});
