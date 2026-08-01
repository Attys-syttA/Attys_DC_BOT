import { describe, expect, it } from "vitest";
import {
  AUDIT_CHECK_NAMES,
  auditNpmCommand,
  buildAuditCheckPipeline,
  checkAuditPipelineSupport,
  isAuditCheckName,
} from "./check-catalog.js";

describe("audit named-check catalog", () => {
  it("accepts only the first fixed named checks", () => {
    expect(AUDIT_CHECK_NAMES).toEqual([
      "plans",
      "lint",
      "typecheck",
      "tests",
      "build",
      "full",
    ]);
    expect(isAuditCheckName("tests")).toBe(true);
    expect(isAuditCheckName("npm install")).toBe(false);
    expect(isAuditCheckName("shell")).toBe(false);
  });

  it("builds structured npm invocations without shell strings", () => {
    expect(buildAuditCheckPipeline("tests", "win32")).toEqual([{
      name: "tests",
      executable: "npm.cmd",
      args: ["test"],
      timeoutMs: 300_000,
      requiredPackageScript: "test",
    }]);
    expect(buildAuditCheckPipeline("plans", "linux")[0]).toMatchObject({
      executable: "npm",
      args: ["run", "plans:check"],
      timeoutMs: 60_000,
    });
    expect(auditNpmCommand("win32")).toBe("npm.cmd");
  });

  it("expands full into observable steps instead of one opaque npm run check", () => {
    const pipeline = buildAuditCheckPipeline("full", "win32");

    expect(pipeline.map((step) => step.name)).toEqual([
      "plans",
      "lint",
      "typecheck",
      "tests",
      "build",
    ]);
    expect(pipeline.map((step) => step.args.join(" "))).not.toContain("run check");
  });

  it("marks missing package scripts unsupported instead of guessing commands", () => {
    const support = checkAuditPipelineSupport("full", {
      "plans:check": "tsx src/cli/plans-check.ts",
      test: "vitest run",
    }, "win32");

    expect(support).toEqual([
      { name: "plans", status: "supported", reason: null },
      { name: "lint", status: "unsupported", reason: "missing package script: lint" },
      { name: "typecheck", status: "unsupported", reason: "missing package script: typecheck" },
      { name: "tests", status: "supported", reason: null },
      { name: "build", status: "unsupported", reason: "missing package script: build" },
    ]);
  });
});
