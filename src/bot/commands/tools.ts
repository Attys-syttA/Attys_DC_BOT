import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import fs from "node:fs";
import path from "node:path";
import { L } from "../../utils/i18n.js";
import { runLocalCommand } from "./local-command.js";

type OperatorToolsStatus = "ready" | "failed" | "skipped" | "running";

export const data = new SlashCommandBuilder()
  .setName("tools")
  .setDescription("Run or inspect the local operator tools preflight")
  .addStringOption((option) => option
    .setName("action")
    .setDescription("What to do")
    .addChoices(
      { name: "run", value: "run" },
      { name: "status", value: "status" },
    ));

export function operatorToolsStatusFromExit(exitCode: number | null, timedOut: boolean): OperatorToolsStatus {
  if (timedOut || exitCode === null || exitCode === 1) return "failed";
  if (exitCode === 2) return "skipped";
  if (exitCode === 3) return "running";
  return exitCode === 0 ? "ready" : "failed";
}

export function readOperatorStartupLog(repoRoot: string, maxLines = 4): string[] {
  const logPath = path.join(repoRoot, "operator-startup.log");
  if (!fs.existsSync(logPath)) return [];
  const lines = fs.readFileSync(logPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^(20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d )?(START|OK|FAILED|SKIPPED|RUNNING):/.test(line));
  return lines.slice(-maxLines);
}

export function operatorToolsStatusFromLog(logLines: string[]): OperatorToolsStatus {
  for (const line of [...logLines].reverse()) {
    if (line.includes("OK:")) return "ready";
    if (line.includes("FAILED:")) return "failed";
    if (line.includes("RUNNING:")) return "running";
    if (line.includes("SKIPPED:")) return "skipped";
  }

  return "skipped";
}

export function buildToolsReply(status: OperatorToolsStatus, logLines: string[]): string {
  const title = status === "ready"
    ? "Operator tools ready"
    : status === "skipped"
      ? "Operator tools skipped"
      : status === "running"
        ? "Operator tools already running"
        : "Operator tools failed";
  const hint = status === "ready"
    ? "The VS Code-free local tools preflight completed."
    : status === "skipped"
      ? "The shared `codex-ai-tools-mcp-link` launcher was not found or was intentionally skipped."
      : status === "running"
        ? "Another local tools preflight is active, so this request did not start a duplicate run."
        : "The local tools preflight failed. Check `operator-startup.log` on the Windows machine.";

  return [
    `**${title}**`,
    hint,
    "",
    logLines.length > 0
      ? `\`\`\`text\n${logLines.join("\n")}\n\`\`\``
      : "`operator-startup.log` has no public-safe status lines yet.",
  ].join("\n");
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const action = interaction.options.getString("action") ?? "run";
  const repoRoot = process.cwd();

  if (action === "status") {
    const logLines = readOperatorStartupLog(repoRoot);
    await interaction.editReply({
      content: buildToolsReply(operatorToolsStatusFromLog(logLines), logLines),
    });
    return;
  }

  const scriptPath = path.join(repoRoot, "scripts", "operator-startup.ps1");
  if (!fs.existsSync(scriptPath)) {
    await interaction.editReply({
      content: L("Operator tools script is missing.", "Operator tools 스크립트를 찾을 수 없습니다."),
    });
    return;
  }

  await interaction.editReply({ content: L("Running operator tools preflight locally...", "로컬 operator tools preflight 실행 중...") });
  const result = await runLocalCommand("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
  ], repoRoot, 120_000);

  await interaction.followUp({
    content: buildToolsReply(
      operatorToolsStatusFromExit(result.exitCode, result.timedOut),
      readOperatorStartupLog(repoRoot),
    ),
  });
}
