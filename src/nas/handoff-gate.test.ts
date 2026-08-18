import { describe, expect, it } from "vitest";
import {
  evaluateNasHandoffGate,
  renderNasHandoffGateReport,
  type NasHandoffGateCriterion,
} from "./handoff-gate.js";

describe("NAS handoff gate", () => {
  it("fails closed while boundary decisions remain unresolved", () => {
    const report = evaluateNasHandoffGate();

    expect(report.status).toBe("blocked");
    expect(report.criteria.some((criterion) => criterion.status === "blocked")).toBe(true);
    expect(report.nextAction).toBe("resolve source publication checkpoint");
  });

  it("can render a ready report only when every criterion is ok", () => {
    const criteria: NasHandoffGateCriterion[] = [
      {
        id: "one",
        label: "one",
        status: "ok",
        summary: "passed",
      },
      {
        id: "two",
        label: "two",
        status: "ok",
        summary: "passed",
      },
    ];

    const report = evaluateNasHandoffGate(criteria);

    expect(report.status).toBe("ready");
    expect(report.nextAction).toBe("NAS handoff may proceed to the dedicated architecture plan");
  });

  it("renders a public-safe operator report without local paths or secrets", () => {
    const content = renderNasHandoffGateReport();

    expect(content).toContain("NAS handoff gate");
    expect(content).toContain("status: blocked");
    expect(content).toContain("BLOCKED source publication checkpoint");
    expect(content).toContain("blocked actions: NAS repo source writes, remote execution architecture changes, deploy");
    expect(content).not.toContain("E:\\");
    expect(content).not.toContain("token");
  });
});
