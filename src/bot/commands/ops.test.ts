import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ApplicationCommandOptionType } from "discord.js";
import { afterEach, describe, expect, it } from "vitest";
import { buildBotOpsApproveReply, buildBotOpsWorkersReply, data } from "./ops.js";
import type { BotOpsJob } from "../../botops/contract.js";
import { workerSupervisorPaths } from "../../botops/worker-supervisor.js";

const tempDirs: string[] = [];
const baseJob: BotOpsJob = {
  job_id: "job-approval-test",
  requested_by: "operator",
  target: "windows",
  capability: "git.push",
  summary: "push current branch",
  payload_json: "",
  expected_action: "fetch remote refs and push the current clean branch to its upstream",
  validation_condition: "fetch succeeds, branch is not behind upstream, and push succeeds without force or rebase",
  created_at: "2026-08-20T08:00:00.000Z",
  status: "WaitingApproval",
  approval_state: "required",
  approved_by: null,
  approval_expires_at: null,
  lease_owner: null,
  lease_expires_at: null,
  heartbeat_at: null,
  logs: "",
  result: "",
  updated_at: "2026-08-20T08:00:00.000Z",
};

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

describe("/ops command surface", () => {
  it("registers recover as an explicit operator action", () => {
    const json = data.toJSON();
    const recover = json.options?.find((option) => option.name === "recover");

    expect(recover).toBeDefined();
    expect(recover?.type).toBe(ApplicationCommandOptionType.Subcommand);
    if (recover?.type !== ApplicationCommandOptionType.Subcommand) return;
    expect(recover?.description).toContain("lease-expired");
    expect(recover?.options?.[0]).toMatchObject({
      name: "job_id",
      required: true,
    });
  });

  it("registers preview as a read-only approval inspection action", () => {
    const json = data.toJSON();
    const preview = json.options?.find((option) => option.name === "preview");

    expect(preview).toBeDefined();
    expect(preview?.type).toBe(ApplicationCommandOptionType.Subcommand);
    if (preview?.type !== ApplicationCommandOptionType.Subcommand) return;
    expect(preview?.description).toContain("Preview");
    expect(preview?.options?.[0]).toMatchObject({
      name: "job_id",
      required: true,
    });
  });
});

describe("/ops approve replies", () => {
  it("reports a missing job without claiming approval", () => {
    const reply = buildBotOpsApproveReply("missing-job", undefined, undefined);

    expect(reply).toBe("BotOps job `missing-job` was not found.");
    expect(reply).not.toContain("approval recorded");
  });

  it("records approval only when the current job required approval", () => {
    const approvedJob: BotOpsJob = {
      ...baseJob,
      approval_state: "approved",
      approved_by: "operator-1",
      approval_expires_at: "2026-08-20T08:10:00.000Z",
      status: "WaitingWorker",
      updated_at: "2026-08-20T08:01:00.000Z",
    };

    const reply = buildBotOpsApproveReply(baseJob.job_id, baseJob, approvedJob);

    expect(reply).toContain("BotOps approval recorded");
    expect(reply).toContain("approval: approved");
    expect(reply).toContain("No execution was started by this approval command.");
  });

  it("refuses stale approvals and shows current job details", () => {
    const staleJob: BotOpsJob = {
      ...baseJob,
      approval_state: "stale",
      status: "Failed",
      result: "approval expired",
      updated_at: "2026-08-20T08:11:00.000Z",
    };

    const reply = buildBotOpsApproveReply(staleJob.job_id, staleJob, undefined);

    expect(reply).toContain("was not approved: approval stale");
    expect(reply).toContain("approval: stale");
    expect(reply).toContain("result: approval expired");
    expect(reply).not.toContain("BotOps approval recorded");
  });

  it("refuses jobs that do not require approval", () => {
    const readOnlyJob: BotOpsJob = {
      ...baseJob,
      capability: "status.read",
      approval_state: "not_required",
      status: "Completed",
      expected_action: "read public-safe worker status",
      validation_condition: "worker reports a public-safe status result",
      result: "status read completed",
      updated_at: "2026-08-20T08:02:00.000Z",
    };

    const reply = buildBotOpsApproveReply(readOnlyJob.job_id, readOnlyJob, undefined);

    expect(reply).toContain("was not approved: approval not_required");
    expect(reply).toContain("approval: not_required");
    expect(reply).not.toContain("BotOps approval recorded");
  });

  it("reports an approval update failure without claiming success", () => {
    const reply = buildBotOpsApproveReply(baseJob.job_id, baseJob, undefined);

    expect(reply).toContain("was not approved: approval update failed");
    expect(reply).toContain("approval: required");
    expect(reply).not.toContain("BotOps approval recorded");
  });
});
