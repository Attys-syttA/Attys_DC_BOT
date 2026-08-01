import path from "node:path";
import { sanitizePublicFileLabel } from "../utils/public-safety.js";
import { isAuditCheckName, type AuditCheckName } from "../audit/check-catalog.js";
import { runAuditCheckPipeline } from "../audit/check-runner.js";

interface AuditCheckCliReport {
  schemaVersion: 1;
  check: AuditCheckName;
  projectLabel: string;
  results: Awaited<ReturnType<typeof runAuditCheckPipeline>>;
}

function usage(): string {
  return [
    "Usage: npm run audit:check -- <plans|lint|typecheck|tests|build|full> [projectPath]",
    "",
    "Runs only the fixed audit named-check catalog.",
    "No repair, install, Git write, commit, push, or Codex prompt is performed.",
  ].join("\n");
}

async function main(): Promise<void> {
  const [rawCheckName = "full", rawProjectPath = process.cwd()] = process.argv.slice(2);
  if (!isAuditCheckName(rawCheckName)) {
    console.error(`Unsupported audit check: ${rawCheckName}`);
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  const projectPath = path.resolve(rawProjectPath);
  try {
    const results = await runAuditCheckPipeline(projectPath, rawCheckName);
    const report: AuditCheckCliReport = {
      schemaVersion: 1,
      check: rawCheckName,
      projectLabel: sanitizePublicFileLabel(projectPath),
      results,
    };

    console.log(JSON.stringify(report, null, 2));
    process.exitCode = results.every((result) => result.status === "passed") ? 0 : 1;
  } catch (error) {
    console.error(`Audit check failed: ${sanitizePublicFileLabel(projectPath)}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

await main();
