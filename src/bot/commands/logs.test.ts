import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLogsReply,
  readPublicLogLines,
  sanitizeLogLine,
} from "./logs.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "attys-logs-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("/logs helpers", () => {
  it("scrubs sensitive-looking log fragments", () => {
    const line = sanitizeLogLine(
      "DISCORD_BOT_TOKEN=abc123 C:\\Users\\someone\\repo channel=<#123456789012345678> id 123456789012345678 ip 127.0.0.1 secret abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    );

    expect(line).toContain("DISCORD_BOT_TOKEN=<redacted>");
    expect(line).toContain("<local-path>");
    expect(line).toContain("<#channel>");
    expect(line).toContain("<id>");
    expect(line).toContain("<ip>");
    expect(line).toContain("<redacted>");
    expect(line).not.toContain("someone");
    expect(line).not.toContain("123456789012345678");
  });

  it("reads only the requested public-safe tail", () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "bot.log"), [
      "line one",
      "line two",
      "line three C:\\private\\repo",
    ].join("\n"), "utf8");

    expect(readPublicLogLines(dir, "bot", 2)).toEqual([
      "line two",
      "line three <local-path>",
    ]);
  });

  it("filters public log lines by scrubbed text", () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "bot.log"), [
      "startup online",
      "operator tools ready",
      "task completed",
    ].join("\n"), "utf8");

    expect(readPublicLogLines(dir, "bot", 10, "tools")).toEqual([
      "operator tools ready",
    ]);
  });

  it("returns empty lines for missing logs", () => {
    expect(readPublicLogLines(makeTempDir(), "error", 5)).toEqual([]);
  });

  it("builds a compact Discord reply", () => {
    const reply = buildLogsReply("events", ["startup online"], "startup");

    expect(reply).toContain("Attys DC BOT Logs");
    expect(reply).toContain("events");
    expect(reply).toContain("contains: startup");
    expect(reply).toContain("startup online");
  });

  it("executes with selected source and line count", async () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "operator-events.log"), "startup online\n", "utf8");
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
    const interaction = {
      options: {
        getString: vi.fn((name: string) => name === "source" ? "events" : "startup"),
        getInteger: vi.fn().mockReturnValue(1),
      },
      editReply: vi.fn(),
    };

    const { execute } = await import("./logs.js");
    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: expect.stringContaining("startup online"),
    });
    cwd.mockRestore();
  });
});
