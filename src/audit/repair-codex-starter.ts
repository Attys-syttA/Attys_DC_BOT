import { codexAppServer } from "../codex/app-server-client.js";
import type { AuditRepairStartResult } from "./repair-executor.js";

export interface AuditRepairCodexClient {
  startThread(cwd: string): Promise<{ id: string }>;
  startTurn(threadId: string, prompt: string): Promise<{ id: string }>;
}

export function createAuditRepairCodexStarter(
  client: AuditRepairCodexClient = codexAppServer,
): (worktreePath: string, prompt: string) => Promise<AuditRepairStartResult> {
  return async (worktreePath, prompt) => {
    const thread = await client.startThread(worktreePath);
    const turn = await client.startTurn(thread.id, prompt);
    return {
      threadId: thread.id,
      turnId: turn.id,
    };
  };
}
