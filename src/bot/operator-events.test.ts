import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatOperatorEvent,
  readOperatorEvents,
  recordOperatorEvent,
  summarizeOperatorEvents,
} from "./operator-events.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "attys-events-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("operator events", () => {
  it("formats public-safe event lines", () => {
    const line = formatOperatorEvent(
      { kind: "attention", status: "Codex question", channelId: "123456789012345678" },
      new Date("2026-06-20T18:40:00.000Z"),
    );

    expect(line).toBe("2026-06-20T18:40:00.000Z attention codex-question channel=<#123456789012345678>");
  });

  it("scrubs non-Discord channel ids to a generic channel label", () => {
    const line = formatOperatorEvent(
      { kind: "task", status: "completed", channelId: "C:\\private\\channel" },
      new Date("2026-06-20T18:40:00.000Z"),
    );

    expect(line).toBe("2026-06-20T18:40:00.000Z task completed channel=project-channel");
    expect(line).not.toContain("private");
  });

  it("records and reads only public-safe event lines", () => {
    const dir = makeTempDir();
    recordOperatorEvent({ kind: "startup", status: "online" }, dir);
    fs.appendFileSync(path.join(dir, "operator-events.log"), "private path C:\\Users\\someone\n", "utf8");
    recordOperatorEvent({ kind: "task", status: "failed", channelId: "123456789012345678" }, dir);

    expect(readOperatorEvents(dir)).toEqual([
      expect.stringContaining("startup online"),
      expect.stringContaining("task failed channel=<#123456789012345678>"),
    ]);
  });

  it("limits event reads", () => {
    const dir = makeTempDir();
    recordOperatorEvent({ kind: "startup", status: "one" }, dir);
    recordOperatorEvent({ kind: "startup", status: "two" }, dir);
    recordOperatorEvent({ kind: "startup", status: "three" }, dir);

    expect(readOperatorEvents(dir, 2)).toHaveLength(2);
    expect(readOperatorEvents(dir, 2)[0]).toContain("two");
  });

  it("filters event reads by kind", () => {
    const dir = makeTempDir();
    recordOperatorEvent({ kind: "startup", status: "online" }, dir);
    recordOperatorEvent({ kind: "attention", status: "codex-question" }, dir);
    recordOperatorEvent({ kind: "task", status: "completed" }, dir);

    expect(readOperatorEvents(dir, 10, "attention")).toEqual([
      expect.stringContaining("attention codex-question"),
    ]);
    expect(readOperatorEvents(dir, 10, "task")).toEqual([
      expect.stringContaining("task completed"),
    ]);
  });

  it("filters event reads by public-safe status text", () => {
    const dir = makeTempDir();
    recordOperatorEvent({ kind: "lifecycle", status: "windows-launcher-restart" }, dir);
    recordOperatorEvent({ kind: "task", status: "failed" }, dir);
    recordOperatorEvent({ kind: "task", status: "completed" }, dir);

    expect(readOperatorEvents(dir, 10, "all", "restart")).toEqual([
      expect.stringContaining("lifecycle windows-launcher-restart"),
    ]);
    expect(readOperatorEvents(dir, 10, "task", "fail")).toEqual([
      expect.stringContaining("task failed"),
    ]);
  });

  it("summarizes event lines without private details", () => {
    const summary = summarizeOperatorEvents([
      "2026-06-20T18:40:00.000Z startup online",
      "2026-06-20T18:41:00.000Z attention codex-question channel=<#123456789012345678>",
      "2026-06-20T18:42:00.000Z task completed channel=project-channel",
      "private path C:\\Users\\someone",
    ]);

    expect(summary.total).toBe(3);
    expect(summary.byKind.startup).toBe(1);
    expect(summary.byKind.attention).toBe(1);
    expect(summary.byKind.task).toBe(1);
    expect(summary.byStatus.completed).toBe(1);
    expect(summary.byStatus.private).toBeUndefined();
  });
});
