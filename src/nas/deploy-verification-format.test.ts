import { describe, expect, it } from "vitest";
import { formatNasDeployVerification } from "./deploy-verification-format.js";
import type { NasDeployVerificationResult } from "./deploy-verification.js";

describe("NAS deploy verification formatting", () => {
  it("formats the verification result as a concise human-readable checklist", () => {
    const result: NasDeployVerificationResult = {
      ok: false,
      sourceCommit: "36afe1d65b4f",
      packageVersion: "0.1.1-prerelease.3",
      checkedAt: "2026-08-01T22:12:37.178Z",
      checks: [
        { name: "manifest", ok: true, summary: "readable" },
        { name: "snapshot-build-match", ok: false, summary: "snapshot does not match staged build" },
      ],
    };

    expect(formatNasDeployVerification(result)).toBe([
      "NAS deploy verify: FAIL",
      "source commit: 36afe1d65b4f",
      "package version: 0.1.1-prerelease.3",
      "checked at: 2026-08-01T22:12:37.178Z",
      "checks:",
      "- OK manifest: readable",
      "- FAIL snapshot-build-match: snapshot does not match staged build",
      "",
    ].join("\n"));
  });
});
