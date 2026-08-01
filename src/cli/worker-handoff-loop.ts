import fs from "node:fs";
import path from "node:path";
import { processQueuedHandoffOnce } from "../nas/handoff-worker.js";

const rawHandoffRoot = process.env.ATTYS_NAS_HANDOFF_ROOT?.trim();
if (!rawHandoffRoot) {
  throw new Error("ATTYS_NAS_HANDOFF_ROOT is required for the handoff loop.");
}

const handoffRoot = path.resolve(rawHandoffRoot);
if (!fs.existsSync(handoffRoot)) {
  throw new Error(`ATTYS_NAS_HANDOFF_ROOT is not reachable: ${handoffRoot}`);
}

const workspaceRoot = process.env.ATTYS_WORKER_WORKSPACE_ROOT
  ? path.resolve(process.env.ATTYS_WORKER_WORKSPACE_ROOT)
  : path.resolve("..");

const intervalMs = Number(process.env.ATTYS_WORKER_HANDOFF_POLL_INTERVAL_MS ?? 15_000);
const safeIntervalMs = Number.isInteger(intervalMs) && intervalMs >= 5_000 && intervalMs <= 300_000
  ? intervalMs
  : 15_000;

let stopping = false;
let running = false;

async function tick(): Promise<void> {
  if (running || stopping) return;
  running = true;
  try {
    const result = await processQueuedHandoffOnce({
      handoffRoot,
      workspaceRoot,
    });
    console.log(JSON.stringify({
      event: "worker-handoff-tick",
      ...result,
      checkedAt: new Date().toISOString(),
    }));
  } catch (error) {
    console.error(JSON.stringify({
      event: "worker-handoff-error",
      message: error instanceof Error ? error.message : String(error),
      checkedAt: new Date().toISOString(),
    }));
  } finally {
    running = false;
  }
}

console.log(JSON.stringify({
  event: "worker-handoff-started",
  pollIntervalMs: safeIntervalMs,
  handoffRootStatus: "ready",
  workspaceRootLabel: "codex_works",
}));

await tick();

const timer = setInterval(() => {
  void tick();
}, safeIntervalMs);

function shutdown(): void {
  stopping = true;
  clearInterval(timer);
  console.log(JSON.stringify({
    event: "worker-handoff-stopped",
    stoppedAt: new Date().toISOString(),
  }));
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
