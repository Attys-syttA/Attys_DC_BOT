import { runSyntheticAuditRepairFlowAcceptance } from "../audit/repair-flow-acceptance.js";

try {
  const report = await runSyntheticAuditRepairFlowAcceptance();
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
} catch (error) {
  console.error("Audit repair flow smoke failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
