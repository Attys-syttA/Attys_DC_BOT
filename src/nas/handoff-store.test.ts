import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createHandoffEnvelope,
  archiveHandoffEnvelope,
  ensureHandoffStore,
  listHandoffEnvelopeFiles,
  readHandoffEnvelope,
  readPublicHandoffStore,
  writeHandoffEnvelope,
} from "./handoff-store.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "attys-nas-handoff-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("NAS handoff store", () => {
  it("creates the expected shared-folder mailbox layout", () => {
    const root = makeTempDir();

    ensureHandoffStore(root);

    for (const name of ["inbox", "outbox", "archive", "tmp"]) {
      expect(fs.statSync(path.join(root, name)).isDirectory()).toBe(true);
    }
  });

  it("writes and reads a public-safe handoff envelope", () => {
    const root = makeTempDir();
    const envelope = createHandoffEnvelope({
      id: "Audit Request 1",
      type: "audit.request",
      source: "discord-control",
      target: "pc-worker",
      status: "queued",
      publicSummary: "Run check for E:\\codex_works\\secret-project with TOKEN=abc123",
      publicFields: {
        "Project Path": "E:\\codex_works\\secret-project",
        "Discord Channel": "123456789012345678",
        "Mode": "check-only",
      },
    }, new Date("2026-08-01T12:00:00.000Z"));

    const filePath = writeHandoffEnvelope(root, "inbox", envelope);

    expect(filePath.endsWith(path.join("inbox", "audit-request-1.json"))).toBe(true);
    expect(readHandoffEnvelope(filePath)).toEqual({
      schemaVersion: 1,
      id: "audit-request-1",
      type: "audit.request",
      createdAt: "2026-08-01T12:00:00.000Z",
      source: "discord-control",
      target: "pc-worker",
      status: "queued",
      publicSummary: "Run check for <local-path> with TOKEN=<redacted>",
      publicFields: {
        "project-path": "<local-path>",
        "discord-channel": "<id>",
        mode: "check-only",
      },
    });
  });

  it("reports missing and invalid boxes without exposing raw paths", () => {
    const root = makeTempDir();
    ensureHandoffStore(root);
    fs.writeFileSync(path.join(root, "outbox", "bad.json"), "{not json", "utf8");

    const result = readPublicHandoffStore(root);

    expect(result).toEqual({
      rootStatus: "invalid",
      boxes: [
        {
          box: "inbox",
          status: "ready",
          validMessages: 0,
          invalidMessages: 0,
          latestMessageAt: null,
        },
        {
          box: "outbox",
          status: "invalid",
          validMessages: 0,
          invalidMessages: 1,
          latestMessageAt: null,
        },
        {
          box: "archive",
          status: "ready",
          validMessages: 0,
          invalidMessages: 0,
          latestMessageAt: null,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain(root);
  });

  it("refuses path escape ids and duplicate messages", () => {
    const root = makeTempDir();
    const envelope = createHandoffEnvelope({
      id: "first-message",
      type: "control.status",
      source: "nas-control-plane",
      target: "discord-control",
      status: "completed",
      publicSummary: "Control plane ready",
    });

    writeHandoffEnvelope(root, "outbox", envelope);

    expect(() => createHandoffEnvelope({
      id: "..\\escape",
      type: "audit.request",
      source: "discord-control",
      target: "pc-worker",
      status: "queued",
      publicSummary: "bad",
    })).toThrow("Invalid handoff message id.");
    expect(() => writeHandoffEnvelope(root, "outbox", envelope)).toThrow(
      "Refusing to overwrite existing handoff message.",
    );
  });

  it("lists and archives handoff envelope files without overwriting", () => {
    const root = makeTempDir();
    const envelope = createHandoffEnvelope({
      id: "archive-me",
      type: "control.status",
      source: "nas-control-plane",
      target: "discord-control",
      status: "completed",
      publicSummary: "Control plane ready",
    });

    writeHandoffEnvelope(root, "inbox", envelope);

    expect(listHandoffEnvelopeFiles(root, "inbox").map((filePath) => path.basename(filePath))).toEqual([
      "archive-me.json",
    ]);
    expect(archiveHandoffEnvelope(root, "inbox", "archive-me").endsWith(path.join("archive", "archive-me.json"))).toBe(true);
    expect(listHandoffEnvelopeFiles(root, "inbox")).toEqual([]);
    expect(listHandoffEnvelopeFiles(root, "archive").map((filePath) => path.basename(filePath))).toEqual([
      "archive-me.json",
    ]);
  });
});
