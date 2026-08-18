import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyRepairWorktreeChanges } from "./repair-apply.js";

const tempRoots: string[] = [];

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  }).trim();
}

function makeSourceRepo(): string {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "attys-audit-apply-source-"));
  tempRoots.push(sourceRoot);
  git(sourceRoot, ["init", "-b", "main"]);
  git(sourceRoot, ["config", "user.email", "synthetic@example.invalid"]);
  git(sourceRoot, ["config", "user.name", "Synthetic Test"]);
  fs.writeFileSync(
    path.join(sourceRoot, "package.json"),
    JSON.stringify({
      name: "audit-apply-synthetic",
      version: "0.0.0",
      type: "module",
      scripts: { test: "node check.js" },
    }, null, 2),
    "utf8",
  );
  fs.writeFileSync(path.join(sourceRoot, "check.js"), "console.error('before repair'); process.exit(1);\n", "utf8");
  git(sourceRoot, ["add", "package.json", "check.js"]);
  git(sourceRoot, ["commit", "-m", "initial failing check"]);
  return sourceRoot;
}

function addRepairWorktree(sourceRoot: string): string {
  const worktreePath = path.join(path.dirname(sourceRoot), "repair-worktree");
  git(sourceRoot, ["worktree", "add", "-b", "audit-repair/test-job", worktreePath, "HEAD"]);
  return worktreePath;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    const repairWorktree = path.join(path.dirname(root), "repair-worktree");
    if (fs.existsSync(repairWorktree)) {
      try {
        git(root, ["worktree", "remove", "--force", repairWorktree]);
      } catch {
        fs.rmSync(repairWorktree, { recursive: true, force: true });
      }
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("applyRepairWorktreeChanges", () => {
  it("applies reviewed repair worktree changes to a clean source worktree and validates them", async () => {
    const sourceRoot = makeSourceRepo();
    const worktreePath = addRepairWorktree(sourceRoot);
    fs.writeFileSync(path.join(worktreePath, "check.js"), "console.log('after repair'); process.exit(0);\n", "utf8");

    const result = await applyRepairWorktreeChanges({
      sourceRoot,
      worktreePath,
      requestedCheck: "tests",
    });

    expect(result).toMatchObject({
      changedFiles: 1,
      summary: "applied files=1",
      validationPassed: true,
    });
    expect(result.validationResults).toHaveLength(1);
    expect(result.validationResults[0].status).toBe("passed");
    expect(fs.readFileSync(path.join(sourceRoot, "check.js"), "utf8")).toContain("after repair");
    expect(git(sourceRoot, ["status", "--porcelain=v1"])).toBe("M check.js");
    expect(git(worktreePath, ["status", "--porcelain=v1"])).toBe("M check.js");
  });

  it("blocks untracked repair files before touching the source worktree", async () => {
    const sourceRoot = makeSourceRepo();
    const worktreePath = addRepairWorktree(sourceRoot);
    fs.writeFileSync(path.join(worktreePath, "new-file.txt"), "manual review required\n", "utf8");

    await expect(applyRepairWorktreeChanges({
      sourceRoot,
      worktreePath,
      requestedCheck: "tests",
    })).rejects.toThrow("untracked files");

    expect(fs.readFileSync(path.join(sourceRoot, "check.js"), "utf8")).toContain("before repair");
    expect(git(sourceRoot, ["status", "--porcelain=v1"])).toBe("");
  });

  it("blocks apply while the source worktree is dirty", async () => {
    const sourceRoot = makeSourceRepo();
    const worktreePath = addRepairWorktree(sourceRoot);
    fs.writeFileSync(path.join(worktreePath, "check.js"), "console.log('after repair'); process.exit(0);\n", "utf8");
    fs.writeFileSync(path.join(sourceRoot, "check.js"), "console.error('operator edit'); process.exit(1);\n", "utf8");

    await expect(applyRepairWorktreeChanges({
      sourceRoot,
      worktreePath,
      requestedCheck: "tests",
    })).rejects.toThrow("clean source worktree");

    expect(fs.readFileSync(path.join(sourceRoot, "check.js"), "utf8")).toContain("operator edit");
  });

  it("reports source validation runner errors after applying the patch", async () => {
    const sourceRoot = makeSourceRepo();
    const worktreePath = addRepairWorktree(sourceRoot);
    fs.writeFileSync(path.join(worktreePath, "check.js"), "console.log('after repair'); process.exit(0);\n", "utf8");

    const result = await applyRepairWorktreeChanges({
      sourceRoot,
      worktreePath,
      requestedCheck: "tests",
      runChecks: async () => {
        throw new Error("synthetic validation runner error");
      },
    });

    expect(result.validationPassed).toBe(false);
    expect(result.validationResults).toEqual([expect.objectContaining({
      name: "tests",
      status: "error",
      publicOutput: "synthetic validation runner error",
    })]);
    expect(fs.readFileSync(path.join(sourceRoot, "check.js"), "utf8")).toContain("after repair");
  });
});
