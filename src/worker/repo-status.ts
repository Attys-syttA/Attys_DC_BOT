import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { sanitizePublicFileLabel, sanitizePublicText } from "../utils/public-safety.js";

const execFileAsync = promisify(execFile);

export interface WorkerRepoStatus {
  ok: boolean;
  project: string;
  branch: string | null;
  clean: boolean | null;
  summary: string;
}

export async function readWorkerRepoStatus(
  workspaceRoot: string,
  projectName: string,
): Promise<WorkerRepoStatus> {
  const projectPath = resolveProjectPath(workspaceRoot, projectName);
  const projectLabel = sanitizePublicFileLabel(projectPath);

  try {
    const branch = await runGit(projectPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const status = await runGit(projectPath, ["status", "--short"]);
    const clean = status.trim().length === 0;
    return {
      ok: true,
      project: projectLabel,
      branch: sanitizePublicText(branch.trim(), 80) || null,
      clean,
      summary: clean ? "clean" : "dirty",
    };
  } catch (error) {
    return {
      ok: false,
      project: projectLabel,
      branch: null,
      clean: null,
      summary: sanitizePublicText(error instanceof Error ? error.message : String(error), 160) || "repo status unavailable",
    };
  }
}

export function resolveProjectPath(workspaceRoot: string, projectName: string): string {
  if (!workspaceRoot.trim()) {
    throw new Error("ATTYS_WORKER_WORKSPACE_ROOT is required for repo status");
  }

  const safeProjectName = projectName.trim();
  if (!/^[A-Za-z0-9._ -]{1,120}$/.test(safeProjectName) || safeProjectName.includes("..")) {
    throw new Error("Invalid project name");
  }

  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(root, safeProjectName);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Project path escapes workspace root");
  }

  return resolved;
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, {
    cwd,
    timeout: 10_000,
    windowsHide: true,
    maxBuffer: 128 * 1024,
  });
  return result.stdout;
}
