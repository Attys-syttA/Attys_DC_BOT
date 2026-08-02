import {
  createAuditRepairExecution,
  updateAuditRepairExecutionResult,
} from "../db/database.js";
import {
  startAuditRepairExecution,
  type AuditRepairExecutorInput,
  type AuditRepairExecutorResult,
} from "./repair-executor.js";

export interface TrackedAuditRepairExecutionOptions extends AuditRepairExecutorInput {
  jobId: string;
  executionId: string;
  now?: () => Date;
}

export async function startTrackedAuditRepairExecution(
  options: TrackedAuditRepairExecutionOptions,
): Promise<AuditRepairExecutorResult> {
  const now = options.now ?? (() => new Date());
  const createdAt = now().toISOString();
  createAuditRepairExecution({
    id: options.executionId,
    jobId: options.jobId,
    status: "starting",
    threadId: null,
    turnId: null,
    resultSummary: "audit repair execution requested",
    createdAt,
    updatedAt: createdAt,
  });

  const result = await startAuditRepairExecution(options);
  updateAuditRepairExecutionResult(
    options.executionId,
    result.status === "started" ? "started" : "failed",
    result.summary,
    now().toISOString(),
    result.threadId,
    result.turnId,
  );

  return result;
}
