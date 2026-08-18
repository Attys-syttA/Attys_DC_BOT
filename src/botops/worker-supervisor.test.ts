import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildWorkerSupervisorCommand,
  formatWorkerSupervisorStatus,
  readWorkerSupervisorStatus,
  restartWorkerSupervisor,
  startWorkerSupervisor,
  stopWorkerSupervisor,
  workerSupervisorPaths,
  type ProcessProbe,
  type ProcessTerminator,
  type WorkerStarter,
} from "./worker-supervisor.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "attys-worker-supervisor-test-"));
  tempDirs.push(dir);
  return dir;
}

function writeMetadata(repo: string, target: "nas" | "windows", processId: number): void {
  const paths = workerSupervisorPaths(repo, target);
  const command = buildWorkerSupervisorCommand(target);
  fs.writeFileSync(paths.metadataFile, `${JSON.stringify({
    pid: processId,
    target,
    command: command.command,
    args: command.args,
  }, null, 2)}\n`, "utf8");
}

describe("worker supervisor", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  it("builds fixed npm loop commands without arbitrary shell input", () => {
    expect(buildWorkerSupervisorCommand("nas").args).toEqual([
      "node_modules/tsx/dist/cli.mjs",
      "src/cli/botops-nas-worker.ts",
      "--loop",
    ]);
    expect(buildWorkerSupervisorCommand("windows").args).toEqual([
      "node_modules/tsx/dist/cli.mjs",
      "src/cli/botops-windows-worker.ts",
      "--loop",
    ]);
  });

  it("reports stopped without exposing absolute log paths", () => {
    const repo = makeTempDir();
    const status = readWorkerSupervisorStatus(repo, "nas");
    const formatted = formatWorkerSupervisorStatus(status);

    expect(status).toMatchObject({
      target: "nas",
      state: "stopped",
      pid: null,
      verified: false,
      log_name: "nas.out.log",
      error_log_name: "nas.err.log",
    });
    expect(formatted).toContain("state: stopped");
    expect(formatted).not.toContain(repo);
  });

  it("starts a worker through the fixed command and records the pid", () => {
    const repo = makeTempDir();
    const starts: string[] = [];
    const starter: WorkerStarter = (input) => {
      starts.push(`${input.command} ${input.args.join(" ")}`);
      return 12345;
    };
    const probe: ProcessProbe = (processId) => processId === 12345;

    const result = startWorkerSupervisor(repo, "nas", probe, starter);

    expect(result.ok).toBe(true);
    expect(result.status.state).toBe("running");
    expect(result.status.verified).toBe(true);
    expect(result.message).toBe("worker start requested");
    expect(starts).toHaveLength(1);
    expect(starts[0]).toContain("src/cli/botops-nas-worker.ts --loop");
    expect(fs.readFileSync(workerSupervisorPaths(repo, "nas").pidFile, "utf8")).toBe("12345\n");
    expect(fs.existsSync(workerSupervisorPaths(repo, "nas").metadataFile)).toBe(true);
  });

  it("does not start a duplicate worker when the pid is already running", () => {
    const repo = makeTempDir();
    const paths = workerSupervisorPaths(repo, "windows");
    fs.mkdirSync(paths.dir, { recursive: true });
    fs.writeFileSync(paths.pidFile, "222\n", "utf8");
    let startCount = 0;

    const result = startWorkerSupervisor(
      repo,
      "windows",
      (processId) => processId === 222,
      () => {
        startCount += 1;
        return 333;
      },
    );

    expect(result.ok).toBe(true);
    expect(result.status.pid).toBe(222);
    expect(result.message).toBe("worker already running; no duplicate started");
    expect(startCount).toBe(0);
  });

  it("removes stale pid files on explicit stop", () => {
    const repo = makeTempDir();
    const paths = workerSupervisorPaths(repo, "nas");
    fs.mkdirSync(paths.dir, { recursive: true });
    fs.writeFileSync(paths.pidFile, "444\n", "utf8");

    const result = stopWorkerSupervisor(repo, "nas", () => false);

    expect(result.ok).toBe(true);
    expect(result.message).toBe("stale worker pid removed");
    expect(fs.existsSync(paths.pidFile)).toBe(false);
  });

  it("removes the pid file when explicit stop observes process exit", () => {
    const repo = makeTempDir();
    const paths = workerSupervisorPaths(repo, "nas");
    fs.mkdirSync(paths.dir, { recursive: true });
    fs.writeFileSync(paths.pidFile, "444\n", "utf8");
    writeMetadata(repo, "nas", 444);
    let running = true;

    const result = stopWorkerSupervisor(
      repo,
      "nas",
      () => running,
      () => {
        running = false;
        return true;
      },
    );

    expect(result.ok).toBe(true);
    expect(result.message).toBe("worker stopped");
    expect(result.status.state).toBe("stopped");
    expect(fs.existsSync(paths.pidFile)).toBe(false);
    expect(fs.existsSync(paths.metadataFile)).toBe(false);
  });

  it("fails closed instead of stopping a running pid without matching metadata", () => {
    const repo = makeTempDir();
    const paths = workerSupervisorPaths(repo, "nas");
    fs.mkdirSync(paths.dir, { recursive: true });
    fs.writeFileSync(paths.pidFile, "444\n", "utf8");
    let terminated = false;

    const result = stopWorkerSupervisor(
      repo,
      "nas",
      (processId) => processId === 444,
      () => {
        terminated = true;
        return true;
      },
    );

    expect(result.ok).toBe(false);
    expect(result.status.state).toBe("running");
    expect(result.status.verified).toBe(false);
    expect(result.message).toBe("worker stop blocked: pid metadata missing or mismatched");
    expect(terminated).toBe(false);
  });

  it("blocks restart when the previous process does not exit", async () => {
    const repo = makeTempDir();
    const paths = workerSupervisorPaths(repo, "windows");
    fs.mkdirSync(paths.dir, { recursive: true });
    fs.writeFileSync(paths.pidFile, "555\n", "utf8");
    writeMetadata(repo, "windows", 555);
    const terminator: ProcessTerminator = () => true;
    let startCount = 0;

    const result = await restartWorkerSupervisor(
      repo,
      "windows",
      (processId) => processId === 555,
      terminator,
      () => {
        startCount += 1;
        return 777;
      },
      100,
    );

    expect(result.ok).toBe(false);
    expect(result.message).toBe("worker restart blocked: previous worker still running");
    expect(startCount).toBe(0);
  });
});
