import "dotenv/config";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { initDatabase } from "../db/database.js";
import { resolveCodexCommand } from "../codex/command-resolver.js";
import { loadConfig } from "../utils/config.js";

interface CheckResult {
  ok: boolean;
  label: string;
  detail?: string;
}

function check(ok: boolean, label: string, detail?: string): CheckResult {
  return { ok, label, detail };
}

function run(command: string, args: string[]): CheckResult {
  const result = spawnSync(command, args, {
    encoding: "utf-8",
    windowsHide: true,
    timeout: 10_000,
  });

  return check(
    result.status === 0,
    `${command} ${args.join(" ")}`,
    result.status === 0 ? undefined : "command failed",
  );
}

function print(results: CheckResult[]): void {
  for (const result of results) {
    const prefix = result.ok ? "OK" : "FAIL";
    const detail = result.detail ? `: ${result.detail}` : "";
    console.log(`${prefix} ${result.label}${detail}`);
  }
}

const results: CheckResult[] = [];
const config = loadConfig();

results.push(check(Boolean(config.DISCORD_BOT_TOKEN), "DISCORD_BOT_TOKEN configured"));
results.push(check(Boolean(config.DISCORD_GUILD_ID), "DISCORD_GUILD_ID configured"));
results.push(
  check(
    config.ALLOWED_USER_IDS.length > 0 || config.ALLOWED_ROLE_IDS.length > 0,
    "allowed Discord principals configured",
  ),
);
results.push(check(fs.existsSync(config.BASE_PROJECT_DIR), "BASE_PROJECT_DIR exists"));

try {
  initDatabase();
  results.push(check(true, "SQLite state initialized"));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  results.push(check(false, "SQLite state initialized", message));
}

const codexCommand = resolveCodexCommand();
results.push(run(codexCommand, ["--version"]));
results.push(run(codexCommand, ["login", "status"]));

print(results);

if (results.some((result) => !result.ok)) {
  process.exit(1);
}
