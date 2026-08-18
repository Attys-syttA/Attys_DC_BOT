import { describe, expect, it } from "vitest";
import {
  evaluateNasHandoffGate,
  renderNasHandoffGateReport,
  type NasHandoffGateCriterion,
} from "./handoff-gate.js";

describe("NAS handoff gate", () => {
  it("is ready after the unified NAS plan and remote-boundary checkpoints", () => {
    const report = evaluateNasHandoffGate();

    expect(report.status).toBe("ready");
    expect(report.criteria.every((criterion) => criterion.status === "ok")).toBe(true);
    expect(report.nextAction).toBe("NAS handoff may proceed under command-by-command approval gates");
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
    expect(report.nextAction).toBe("NAS handoff may proceed under command-by-command approval gates");
  });

  it("renders a public-safe operator report without local paths or secrets", () => {
    const content = renderNasHandoffGateReport();

    expect(content).toContain("NAS handoff gate");
    expect(content).toContain("status: ready");
    expect(content).toContain("OK source publication checkpoint");
    expect(content).toContain("OK security boundary review");
    expect(content).toContain("OK shared vs NAS-specific split");
    expect(content).toContain("OK unified NAS/BotOps plan");
    expect(content).toContain("OK remote boundary approval");
    expect(content).toContain("approval-gated actions: NAS source/share writes, remote execution changes, deploy, rebuild, restart");
    expect(content).not.toContain("E:\\");
    expect(content).not.toContain("token");
  });
});
