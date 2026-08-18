import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  inspectRepairWorktreeChanges,
  removeAppliedRepairWorktree,
  removeRevertedRepairWorktree,
  prepareRepairWorktree,
  removeRepairWorktree,
  type GitCommandRunner,
} from "./worktree-manager.js";

const tempRoots: string[] = [];

function makeTempRepo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "attys-audit-worktree-"));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, ".git"));
  return root;
}

function makeRealGitRepo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "attys-audit-worktree-real-"));
  tempRoots.push(root);
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore", windowsHide: true });
  execFileSync("git", ["config", "user.email", "codex@example.invalid"], { cwd: root, stdio: "ignore", windowsHide: true });
  execFileSync("git", ["config", "user.name", "Codex Test"], { cwd: root, stdio: "ignore", windowsHide: true });
  fs.writeFileSync(path.join(root, "package.json"), "{\"scripts\":{\"test\":\"vitest\"}}\n", "utf8");
  execFileSync("git", ["add", "package.json"], { cwd: root, stdio: "ignore", windowsHide: true });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: root, stdio: "ignore", windowsHide: true });
  return root;
}

function makeGitRunner(repoRoot: string, options: { dirty?: boolean } = {}): GitCommandRunner {
  return vi.fn(async (args: string[]) => {
    const command = args.join(" ");
    if (command === "rev-parse --show-toplevel") {
      return { stdout: `${repoRoot}\n`, stderr: "" };
    }
    if (command === "status --porcelain") {
      return { stdout: options.dirty ? " M src/index.ts\n" : "", stderr: "" };
    }
    if (command === "rev-parse --git-dir") {
      return { stdout: ".git\n", stderr: "" };
    }
    if (command === "rev-parse --verify HEAD") {
      return { stdout: "0123456789abcdef0123456789abcdef01234567\n", stderr: "" };
    }
    if (args[0] === "worktree" && args[1] === "add") {
      return { stdout: "", stderr: "" };
    }
    if (args[0] === "worktree" && args[1] === "remove") {
      return { stdout: "", stderr: "" };
    }
    throw new Error(`unexpected git command: ${command}`);
  });
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("prepareRepairWorktree", () => {
  it("creates an isolated repair worktree branch from a clean repo", async () => {
    const repoRoot = makeTempRepo();
    const runGit = makeGitRunner(repoRoot);

    const prepared = await prepareRepairWorktree({
      sourceRoot: repoRoot,
      jobId: "audit-job-1",
      runGit,
    });

    expect(prepared).toMatchObject({
      sourceRoot: fs.realpathSync.native(repoRoot),
      branchName: "audit-repair/audit-job-1",
      headCommit: "0123456789abcdef0123456789abcdef01234567",
    });
    expect(prepared.worktreePath).toContain(path.join(".discord-bot-state", "audit-worktrees", "audit-job-1"));
    expect(runGit).toHaveBeenCalledWith(
      ["worktree", "add", "-b", "audit-repair/audit-job-1", prepared.worktreePath, "HEAD"],
      { cwd: fs.realpathSync.native(repoRoot) },
    );
  });

  it("rejects dirty source worktrees before creating a repair worktree", async () => {
    const repoRoot = makeTempRepo();
    const runGit = makeGitRunner(repoRoot, { dirty: true });

    await expect(prepareRepairWorktree({
      sourceRoot: repoRoot,
      jobId: "audit-job-1",
      runGit,
    })).rejects.toThrow("clean source worktree");

    expect(runGit).not.toHaveBeenCalledWith(
      expect.arrayContaining(["worktree", "add"]),
      expect.anything(),
    );
  });

  it("rejects Git operations already in progress", async () => {
    const repoRoot = makeTempRepo();
    fs.writeFileSync(path.join(repoRoot, ".git", "MERGE_HEAD"), "merge", "utf8");

    await expect(prepareRepairWorktree({
      sourceRoot: repoRoot,
      jobId: "audit-job-1",
      runGit: makeGitRunner(repoRoot),
    })).rejects.toThrow("in-progress operation");
  });

  it("rejects unsafe job identifiers that could escape the worktree root", async () => {
    const repoRoot = makeTempRepo();

    await expect(prepareRepairWorktree({
      sourceRoot: repoRoot,
      jobId: "..\\escape",
      runGit: makeGitRunner(repoRoot),
    })).rejects.toThrow("safe local identifier");
  });

  it("rejects symlinked worktree roots", async () => {
    const repoRoot = makeTempRepo();
    const realBase = path.join(repoRoot, "real-worktrees");
    const linkedBase = path.join(repoRoot, "linked-worktrees");
    fs.mkdirSync(realBase);

    try {
      fs.symlinkSync(realBase, linkedBase, "junction");
    } catch {
      return;
    }

    await expect(prepareRepairWorktree({
      sourceRoot: repoRoot,
      jobId: "audit-job-1",
      baseDir: linkedBase,
      runGit: makeGitRunner(repoRoot),
    })).rejects.toThrow("symlink");
  });
});

describe("removeRepairWorktree", () => {
  it("removes only the matching isolated repair worktree without force", async () => {
    const repoRoot = makeTempRepo();
    const realRepoRoot = fs.realpathSync.native(repoRoot);
    const worktreePath = path.join(realRepoRoot, ".discord-bot-state", "audit-worktrees", "audit-job-1");
    fs.mkdirSync(worktreePath, { recursive: true });
    const runGit = makeGitRunner(repoRoot);

    const result = await removeRepairWorktree({
      sourceRoot: repoRoot,
      jobId: "audit-job-1",
      worktreePath,
      runGit,
    });

    expect(result).toEqual({ removed: true, summary: "removed" });
    expect(runGit).toHaveBeenCalledWith(
      ["worktree", "remove", path.resolve(worktreePath)],
      { cwd: realRepoRoot },
    );
  });

  it("treats a missing matching repair worktree as already removed", async () => {
    const repoRoot = makeTempRepo();
    const worktreePath = path.join(fs.realpathSync.native(repoRoot), ".discord-bot-state", "audit-worktrees", "audit-job-1");
    const runGit = makeGitRunner(repoRoot);

    const result = await removeRepairWorktree({
      sourceRoot: repoRoot,
      jobId: "audit-job-1",
      worktreePath,
      runGit,
    });

    expect(result).toEqual({ removed: false, summary: "already removed" });
    expect(runGit).not.toHaveBeenCalledWith(expect.arrayContaining(["worktree", "remove"]), expect.anything());
  });

  it("rejects cleanup paths outside the audit job boundary", async () => {
    const repoRoot = makeTempRepo();
    const realRepoRoot = fs.realpathSync.native(repoRoot);

    await expect(removeRepairWorktree({
      sourceRoot: repoRoot,
      jobId: "audit-job-1",
      worktreePath: path.join(realRepoRoot, ".discord-bot-state", "audit-worktrees", "other-job"),
      runGit: makeGitRunner(repoRoot),
    })).rejects.toThrow("cleanup boundary");
  });
});

describe("removeAppliedRepairWorktree", () => {
  it("removes an applied dirty repair worktree only after matching source diff is verified", async () => {
    const sourceRoot = makeRealGitRepo();
    const baseDir = path.join(path.dirname(sourceRoot), "applied-repair-worktrees");
    const worktreePath = path.join(baseDir, "audit-job-1");
    tempRoots.push(baseDir);
    fs.mkdirSync(baseDir, { recursive: true });
    execFileSync("git", ["worktree", "add", "-b", "audit-repair/audit-job-1", worktreePath, "HEAD"], {
      cwd: sourceRoot,
      stdio: "ignore",
      windowsHide: true,
    });
    fs.writeFileSync(path.join(sourceRoot, "package.json"), "{\"scripts\":{\"test\":\"node check.js\"}}\n", "utf8");
    fs.writeFileSync(path.join(worktreePath, "package.json"), "{\"scripts\":{\"test\":\"node check.js\"}}\n", "utf8");

    const result = await removeAppliedRepairWorktree({
      sourceRoot,
      jobId: "audit-job-1",
      worktreePath,
      baseDir,
    });

    expect(result).toEqual({ removed: true, summary: "removed" });
    expect(fs.existsSync(worktreePath)).toBe(false);
    expect(execFileSync("git", ["status", "--porcelain=v1"], {
      cwd: sourceRoot,
      encoding: "utf8",
      windowsHide: true,
    }).trim()).toBe("M package.json");
  });

  it("blocks applied cleanup when the source diff does not match the repair diff", async () => {
    const sourceRoot = makeRealGitRepo();
    const baseDir = path.join(path.dirname(sourceRoot), "mismatched-repair-worktrees");
    const worktreePath = path.join(baseDir, "audit-job-1");
    tempRoots.push(baseDir);
    fs.mkdirSync(baseDir, { recursive: true });
    execFileSync("git", ["worktree", "add", "-b", "audit-repair/audit-job-1", worktreePath, "HEAD"], {
      cwd: sourceRoot,
      stdio: "ignore",
      windowsHide: true,
    });
    fs.writeFileSync(path.join(sourceRoot, "package.json"), "{\"scripts\":{\"test\":\"node source.js\"}}\n", "utf8");
    fs.writeFileSync(path.join(worktreePath, "package.json"), "{\"scripts\":{\"test\":\"node repair.js\"}}\n", "utf8");

    await expect(removeAppliedRepairWorktree({
      sourceRoot,
      jobId: "audit-job-1",
      worktreePath,
      baseDir,
    })).rejects.toThrow("source and repair diffs to match");

    expect(fs.existsSync(worktreePath)).toBe(true);
  });

  it("reports already removed when the applied repair worktree path is gone", async () => {
    const sourceRoot = makeRealGitRepo();
    const baseDir = path.join(path.dirname(sourceRoot), "missing-applied-repair-worktrees");
    const worktreePath = path.join(baseDir, "audit-job-1");
    tempRoots.push(baseDir);
    fs.mkdirSync(baseDir, { recursive: true });

    const result = await removeAppliedRepairWorktree({
      sourceRoot,
      jobId: "audit-job-1",
      worktreePath,
      baseDir,
    });

    expect(result).toEqual({ removed: false, summary: "already removed" });
  });
});

describe("removeRevertedRepairWorktree", () => {
  it("removes a reverted repair worktree only when the source worktree is clean", async () => {
    const sourceRoot = makeRealGitRepo();
    const baseDir = path.join(path.dirname(sourceRoot), "reverted-repair-worktrees");
    const worktreePath = path.join(baseDir, "audit-job-1");
    tempRoots.push(baseDir);
    fs.mkdirSync(baseDir, { recursive: true });
    execFileSync("git", ["worktree", "add", "-b", "audit-repair/audit-job-1", worktreePath, "HEAD"], {
      cwd: sourceRoot,
      stdio: "ignore",
      windowsHide: true,
    });
    fs.writeFileSync(path.join(worktreePath, "package.json"), "{\"scripts\":{\"test\":\"node check.js\"}}\n", "utf8");

    const result = await removeRevertedRepairWorktree({
      sourceRoot,
      jobId: "audit-job-1",
      worktreePath,
      baseDir,
    });

    expect(result).toEqual({ removed: true, summary: "removed" });
    expect(fs.existsSync(worktreePath)).toBe(false);
    expect(execFileSync("git", ["status", "--porcelain=v1"], {
      cwd: sourceRoot,
      encoding: "utf8",
      windowsHide: true,
    }).trim()).toBe("");
  });

  it("blocks reverted cleanup while source handoff changes still exist", async () => {
    const sourceRoot = makeRealGitRepo();
    const baseDir = path.join(path.dirname(sourceRoot), "dirty-source-reverted-repair-worktrees");
    const worktreePath = path.join(baseDir, "audit-job-1");
    tempRoots.push(baseDir);
    fs.mkdirSync(baseDir, { recursive: true });
    execFileSync("git", ["worktree", "add", "-b", "audit-repair/audit-job-1", worktreePath, "HEAD"], {
      cwd: sourceRoot,
      stdio: "ignore",
      windowsHide: true,
    });
    fs.writeFileSync(path.join(sourceRoot, "package.json"), "{\"scripts\":{\"test\":\"node source.js\"}}\n", "utf8");
    fs.writeFileSync(path.join(worktreePath, "package.json"), "{\"scripts\":{\"test\":\"node repair.js\"}}\n", "utf8");

    await expect(removeRevertedRepairWorktree({
      sourceRoot,
      jobId: "audit-job-1",
      worktreePath,
      baseDir,
    })).rejects.toThrow("clean source worktree");

    expect(fs.existsSync(worktreePath)).toBe(true);
  });
});

describe("inspectRepairWorktreeChanges", () => {
  it("summarizes repair worktree changes without exposing file names", () => {
    const repoRoot = makeRealGitRepo();
    fs.writeFileSync(path.join(repoRoot, "package.json"), "{\"scripts\":{\"test\":\"vitest\",\"build\":\"tsup\"}}\n", "utf8");
    fs.writeFileSync(path.join(repoRoot, "new-secret-looking-name.txt"), "do not expose filename\n", "utf8");

    const summary = inspectRepairWorktreeChanges(repoRoot);

    expect(summary).toMatchObject({
      available: true,
      changedFiles: 2,
      staged: 0,
      unstaged: 1,
      untracked: 1,
      summary: "files=2 staged=0 unstaged=1 untracked=1",
    });
    expect(summary.summary).not.toContain("new-secret-looking-name");
  });

  it("reports unavailable repair worktree changes safely", () => {
    const summary = inspectRepairWorktreeChanges(path.join(os.tmpdir(), "missing-audit-worktree"));

    expect(summary).toMatchObject({
      available: false,
      summary: "unavailable",
      changedFiles: 0,
    });
  });
});
