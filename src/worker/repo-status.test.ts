import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readWorkerRepoStatus, resolveProjectPath } from "./repo-status.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "attys-worker-repo-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("worker repo status", () => {
  it("resolves only projects below the configured workspace root", () => {
    const root = makeTempDir();

    expect(resolveProjectPath(root, "Attys_DC_BOT")).toBe(path.join(root, "Attys_DC_BOT"));
    expect(() => resolveProjectPath(root, "..\\secret")).toThrow("Invalid project name");
    expect(() => resolveProjectPath("", "repo")).toThrow("ATTYS_WORKER_WORKSPACE_ROOT");
  });

  it("returns public-safe unavailable status for non-git projects", async () => {
    const root = makeTempDir();
    fs.mkdirSync(path.join(root, "plain-repo"));

    const result = await readWorkerRepoStatus(root, "plain-repo");

    expect(result.ok).toBe(false);
    expect(result.project).toBe("<local-path>/plain-repo");
    expect(result.branch).toBeNull();
    expect(result.clean).toBeNull();
    expect(JSON.stringify(result)).not.toContain(root);
  });
});
