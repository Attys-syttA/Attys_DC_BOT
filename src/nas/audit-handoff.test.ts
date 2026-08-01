import { describe, expect, it } from "vitest";
import {
  createAuditRequestHandoff,
  createAuditStatusHandoff,
} from "./audit-handoff.js";

describe("NAS audit handoff", () => {
  it("creates a public-safe check-only audit request envelope", () => {
    expect(createAuditRequestHandoff({
      requestId: "Run Plans",
      projectLabel: "E:\\codex_works\\secret-project",
      checkName: "plans",
    }, new Date("2026-08-01T12:00:00.000Z"))).toEqual({
      schemaVersion: 1,
      id: "run-plans",
      type: "audit.request",
      createdAt: "2026-08-01T12:00:00.000Z",
      source: "discord-control",
      target: "pc-worker",
      status: "queued",
      publicSummary: "Audit request check=plans project=<local-path>/secret-project mode=check-only",
      publicFields: {
        check: "plans",
        mode: "check-only",
        project: "<local-path>/secret-project",
      },
    });
  });

  it("rejects unknown check names before writing a handoff message", () => {
    expect(() => createAuditRequestHandoff({
      projectLabel: "repo",
      checkName: "npm install",
    })).toThrow("Unsupported audit check for NAS handoff.");
  });

  it("creates a public-safe audit status envelope for NAS visibility", () => {
    const envelope = createAuditStatusHandoff({
      jobId: "019f1234-5678-7777-8888-999999999999",
      projectLabel: "Attys_DC_BOT",
      checkName: "full",
      status: "running_checks",
      currentStep: "typecheck",
    }, new Date("2026-08-01T12:01:00.000Z"));

    expect(envelope).toMatchObject({
      id: "audit-status-019f1234",
      type: "audit.status",
      source: "pc-worker",
      target: "nas-control-plane",
      status: "accepted",
      publicFields: {
        check: "full",
        job: "019f1234",
        project: "Attys_DC_BOT",
        status: "running_checks",
        step: "typecheck",
      },
    });
    expect(JSON.stringify(envelope)).not.toContain("999999999999");
  });
});
