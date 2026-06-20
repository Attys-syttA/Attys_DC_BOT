import fs from "node:fs";
import path from "node:path";

export type OperatorEventKind = "startup" | "attention" | "task" | "lifecycle";

export interface OperatorEventInput {
  kind: OperatorEventKind;
  status: string;
  channelId?: string;
}

export interface OperatorEventSummary {
  total: number;
  byKind: Record<OperatorEventKind, number>;
  byStatus: Record<string, number>;
}

const EVENT_LINE_PATTERN = /^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z (startup|attention|task|lifecycle) [a-z0-9-]+(?: channel=(?:<#\d{5,30}>|project-channel))?$/;
const EVENT_PARSE_PATTERN = /^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z (startup|attention|task|lifecycle) ([a-z0-9-]+)/;
const EVENT_KINDS: OperatorEventKind[] = ["startup", "lifecycle", "attention", "task"];

function eventLogPath(repoRoot = process.cwd()): string {
  return path.join(repoRoot, "operator-events.log");
}

export function safeOperatorEventToken(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.slice(0, 48) || "unknown";
}

function safeChannel(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^\d{5,30}$/.test(trimmed) ? `<#${trimmed}>` : "project-channel";
}

export function formatOperatorEvent(
  input: OperatorEventInput,
  now = new Date(),
): string {
  const base = [
    now.toISOString(),
    input.kind,
    safeOperatorEventToken(input.status),
  ].join(" ");
  const channel = safeChannel(input.channelId);
  return channel ? `${base} channel=${channel}` : base;
}

export function recordOperatorEvent(input: OperatorEventInput, repoRoot = process.cwd()): void {
  try {
    fs.appendFileSync(eventLogPath(repoRoot), `${formatOperatorEvent(input)}\n`, "utf8");
  } catch {
    // Operator event logging is diagnostic only.
  }
}

function parseOperatorEventKind(line: string): OperatorEventKind | null {
  const match = line.match(EVENT_PARSE_PATTERN);
  return match ? match[1] as OperatorEventKind : null;
}

function parseOperatorEventStatus(line: string): string | null {
  const match = line.match(EVENT_PARSE_PATTERN);
  return match ? match[2] : null;
}

export function readOperatorEvents(
  repoRoot = process.cwd(),
  maxLines = 10,
  kind: OperatorEventKind | "all" = "all",
  status = "",
): string[] {
  try {
    const statusFilter = status ? safeOperatorEventToken(status) : "";
    const lines = fs.readFileSync(eventLogPath(repoRoot), "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => EVENT_LINE_PATTERN.test(line))
      .filter((line) => kind === "all" || parseOperatorEventKind(line) === kind)
      .filter((line) => !statusFilter || (parseOperatorEventStatus(line)?.includes(statusFilter) ?? false));
    return lines.slice(-Math.max(1, Math.min(25, maxLines)));
  } catch {
    return [];
  }
}

export function summarizeOperatorEvents(lines: string[]): OperatorEventSummary {
  const byKind = Object.fromEntries(EVENT_KINDS.map((kind) => [kind, 0])) as Record<OperatorEventKind, number>;
  const byStatus: Record<string, number> = {};
  let total = 0;

  for (const line of lines) {
    const kind = parseOperatorEventKind(line);
    const status = parseOperatorEventStatus(line);
    if (!kind || !status) continue;
    total += 1;
    byKind[kind] += 1;
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }

  return {
    total,
    byKind,
    byStatus,
  };
}
