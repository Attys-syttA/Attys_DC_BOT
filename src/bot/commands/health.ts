import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import fs from "node:fs";
import path from "node:path";
import { loadCodexUsageCache } from "../../codex/usage.js";
import { runLocalCommand } from "./local-command.js";
import { operatorToolsStatusFromLog, readOperatorStartupLog } from "./tools.js";
import { HELP_ENTRIES } from "./help-data.js";

type HealthLineLevel = "OK" | "INFO" | "FAIL";

export const data = new SlashCommandBuilder()
  .setName("health")
  .setDescription("Show public-safe bot runtime health");

function healthLine(level: HealthLineLevel, label: string, detail?: string): string {
  return detail ? `${level} ${label}: ${detail}` : `${level} ${label}`;
}

export function formatHealthAge(timestampMs: number, now = Date.now()): string {
  const diffMs = Math.max(0, now - timestampMs);
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 48) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

function safeBranchName(value: string): string {
  const first = value.trim().split(/\r?\n/)[0] ?? "";
  return /^[A-Za-z0-9._/-]{1,80}$/.test(first) ? first : "unknown";
}

export function parseAheadBehind(value: string): { behind: number; ahead: number } | null {
  const [behindRaw, aheadRaw] = value.trim().split(/\s+/);
  const behind = Number.parseInt(behindRaw ?? "", 10);
  const ahead = Number.parseInt(aheadRaw ?? "", 10);
  if (!Number.isInteger(behind) || !Number.isInteger(ahead)) return null;
  return { behind, ahead };
}

async function gitHealthLines(repoRoot: string): Promise<string[]> {
  const branch = await runLocalCommand("git", ["branch", "--show-current"], repoRoot, 10_000);
  const status = await runLocalCommand("git", ["status", "--short"], repoRoot, 10_000);
  const counts = await runLocalCommand("git", ["rev-list", "--left-right", "--count", "origin/main...HEAD"], repoRoot, 10_000);
  const parsedCounts = counts.exitCode === 0 ? parseAheadBehind(counts.output) : null;
  const dirty = status.exitCode === 0 && status.output.trim().length > 0;

  const lines: string[] = [];
  lines.push(branch.exitCode === 0
    ? healthLine("OK", "bot repo branch", safeBranchName(branch.output))
    : healthLine("FAIL", "bot repo branch", "git unavailable"));

  if (!parsedCounts) {
    lines.push(healthLine("INFO", "bot repo sync", "upstream count unavailable"));
  } else if (parsedCounts.behind === 0 && parsedCounts.ahead === 0) {
    lines.push(healthLine("OK", "bot repo sync", "origin/main parity"));
  } else {
    lines.push(healthLine("INFO", "bot repo sync", `behind ${parsedCounts.behind} / ahead ${parsedCounts.ahead}`));
  }

  lines.push(dirty
    ? healthLine("INFO", "bot repo worktree", "local changes present")
    : healthLine("OK", "bot repo worktree", "clean"));

  return lines;
}

function botLogHealthLine(repoRoot: string): string {
  const errorLogPath = path.join(repoRoot, "bot.err.log");
  try {
    const stat = fs.statSync(errorLogPath);
    return stat.size === 0
      ? healthLine("OK", "bot error log", "empty")
      : healthLine("INFO", "bot error log", "has content");
  } catch {
    return healthLine("INFO", "bot error log", "not found yet");
  }
}

function usageHealthLine(): string {
  const cached = loadCodexUsageCache();
  return cached
    ? healthLine("OK", "Codex usage cache", formatHealthAge(cached.fetchedAt))
    : healthLine("INFO", "Codex usage cache", "missing or unreadable");
}

function packageVersionLine(repoRoot: string): string {
  try {
    const raw = fs.readFileSync(path.join(repoRoot, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === "string" && /^[0-9A-Za-z.+-]{1,40}$/.test(parsed.version)
      ? healthLine("OK", "bot version", parsed.version)
      : healthLine("INFO", "bot version", "unknown");
  } catch {
    return healthLine("INFO", "bot version", "unknown");
  }
}

function commandSurfaceLine(): string {
  return healthLine("OK", "slash command surface", `${HELP_ENTRIES.length} known commands`);
}

function operatorToolsHealthLine(repoRoot: string): string {
  const status = operatorToolsStatusFromLog(readOperatorStartupLog(repoRoot));
  if (status === "ready") return healthLine("OK", "operator tools", "ready");
  if (status === "failed") return healthLine("FAIL", "operator tools", "failed");
  return healthLine("INFO", "operator tools", status);
}

export async function buildHealthReport(repoRoot: string): Promise<string> {
  const uptimeSec = Math.max(0, Math.floor(process.uptime()));
  const lines = [
    healthLine("OK", "bot process", `pid ${process.pid}, uptime ${uptimeSec}s`),
    packageVersionLine(repoRoot),
    commandSurfaceLine(),
    healthLine("OK", "node runtime", process.version),
    botLogHealthLine(repoRoot),
    operatorToolsHealthLine(repoRoot),
    usageHealthLine(),
    ...(await gitHealthLines(repoRoot)),
  ];

  return `**Attys DC BOT Health**\n\`\`\`text\n${lines.join("\n")}\n\`\`\``;
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.editReply({
    content: await buildHealthReport(process.cwd()),
  });
}
