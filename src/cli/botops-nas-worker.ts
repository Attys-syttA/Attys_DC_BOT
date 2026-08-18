import "dotenv/config";
import { initDatabase } from "../db/database.js";
import {
  buildNasWorkerStatusSnapshot,
  defaultNasWorkerId,
  formatNasWorkerStatus,
  recordNasWorkerStatus,
  runNasWorkerOnce,
} from "../botops/nas-worker.js";

function print(message: string): void {
  process.stdout.write(`${message}\n`);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  initDatabase();

  const mode = process.argv[2] ?? "--once";
  const workerId = process.env.BOTOPS_NAS_WORKER_ID || defaultNasWorkerId();

  if (mode === "--status") {
    const snapshot = buildNasWorkerStatusSnapshot(workerId);
    recordNasWorkerStatus(snapshot, "status", "manual status check");
    print(formatNasWorkerStatus(snapshot));
    return;
  }

  if (mode === "--once") {
    const result = runNasWorkerOnce(workerId);
    print(`status=${result.status}`);
    print(result.result);
    return;
  }

  if (mode === "--loop") {
    const intervalMs = parsePositiveInt(process.env.BOTOPS_NAS_WORKER_POLL_MS, 15_000);
    print(`NAS worker loop started: ${workerId}`);
    while (true) {
      const result = runNasWorkerOnce(workerId);
      print(`${new Date().toISOString()} status=${result.status}`);
      await sleep(intervalMs);
    }
  }

  print("Usage: tsx src/cli/botops-nas-worker.ts --status|--once|--loop");
  process.exitCode = 1;
}

main().catch((error) => {
  print(error instanceof Error ? error.message : "NAS worker failed");
  process.exitCode = 1;
});
