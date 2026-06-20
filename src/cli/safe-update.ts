import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { decideSafeUpdate, parseAheadBehind } from "../utils/git-update-state.js";

const repoRoot = process.cwd();
const updateLogPath = path.join(repoRoot, "update.log");

function run(command: string, args: string[], options: { log?: boolean } = {}): { code: number; output: string } {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf-8",
    shell: false,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (options.log) {
    fs.appendFileSync(updateLogPath, `$ ${command} ${args.join(" ")}\n${output}\n\n`);
  }
  return {
    code: result.status ?? 1,
    output,
  };
}

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function print(message: string): void {
  process.stdout.write(`${message}\n`);
}

function gitState(options: { log?: boolean } = {}): { dirty: boolean; ahead: number; behind: number; packageFilesChanged: boolean } {
  run("git", ["fetch", "--prune", "origin"], { log: Boolean(options.log) });

  const dirty = Boolean(run("git", ["status", "--porcelain"]).output.trim());
  const counts = parseAheadBehind(run("git", ["rev-list", "--left-right", "--count", "HEAD...origin/main"]).output);
  if (!counts) {
    throw new Error("Could not read ahead/behind state against origin/main.");
  }

  const changedFiles = run("git", ["diff", "--name-only", "HEAD..origin/main"]).output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    dirty,
    ahead: counts.ahead,
    behind: counts.behind,
    packageFilesChanged: changedFiles.includes("package.json") || changedFiles.includes("package-lock.json"),
  };
}

function status(): void {
  const state = gitState();
  const decision = decideSafeUpdate(state);
  print(`status=${decision.status}`);
  print(`canSafeUpdate=${decision.canSafeUpdate ? "true" : "false"}`);
  print(`detail=${decision.detail}`);
  print(`packageFilesChanged=${state.packageFilesChanged ? "true" : "false"}`);
}

function apply(): void {
  fs.writeFileSync(updateLogPath, `Attys DC BOT safe update\n${new Date().toISOString()}\n\n`);
  const state = gitState({ log: true });
  const decision = decideSafeUpdate(state);
  print(decision.detail);

  if (!decision.canSafeUpdate) {
    process.exitCode = 2;
    return;
  }

  const pull = run("git", ["pull", "--ff-only"], { log: true });
  if (pull.code !== 0) {
    print("git pull --ff-only failed; see update.log");
    process.exitCode = pull.code;
    return;
  }

  if (state.packageFilesChanged) {
    const install = run(npmCommand(), ["install"], { log: true });
    if (install.code !== 0) {
      print("npm install failed; see update.log");
      process.exitCode = install.code;
      return;
    }
  }

  for (const args of [["run", "build"], ["run", "check"]]) {
    const result = run(npmCommand(), args, { log: true });
    if (result.code !== 0) {
      print(`npm ${args.join(" ")} failed; see update.log`);
      process.exitCode = result.code;
      return;
    }
  }

  print("safe update completed; restart the bot from the platform launcher if needed");
}

const mode = process.argv[2] ?? "--status";

try {
  if (mode === "--status") {
    status();
  } else if (mode === "--apply") {
    apply();
  } else {
    print("Usage: tsx src/cli/safe-update.ts --status|--apply");
    process.exitCode = 1;
  }
} catch (error) {
  print(error instanceof Error ? error.message : "safe update failed");
  process.exitCode = 1;
}
