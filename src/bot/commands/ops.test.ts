import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildBotOpsWorkersReply } from "./ops.js";
import { workerSupervisorPaths } from "../../botops/worker-supervisor.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "attys-ops-workers-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("/ops workers", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  it("shows read-only worker supervisor status without exposing paths", () => {
    const repo = makeTempDir();
    const nasPaths = workerSupervisorPaths(repo, "nas");
    fs.mkdirSync(nasPaths.dir, { recursive: true });
    fs.writeFileSync(nasPaths.pidFile, "999999999\n", "utf8");

    const reply = buildBotOpsWorkersReply(repo);

    expect(reply).toContain("BotOps workers");
    expect(reply).toContain("mode: supervisor status only");
    expect(reply).toContain("start/stop/restart from Discord: disabled");
    expect(reply).toContain("worker target: nas");
    expect(reply).toContain("state: stale");
    expect(reply).toContain("worker target: windows");
    expect(reply).toContain("state: stopped");
    expect(reply).toContain("log: nas.out.log");
    expect(reply).not.toContain(repo);
    expect(reply).not.toContain(":\\");
  });
});
