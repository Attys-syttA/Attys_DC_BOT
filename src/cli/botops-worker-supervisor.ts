import "dotenv/config";
import { initDatabase } from "../db/database.js";
import {
  formatWorkerSupervisorStatus,
  readWorkerSupervisorStatus,
  restartWorkerSupervisor,
  startWorkerSupervisor,
  stopWorkerSupervisor,
  type WorkerSupervisorTarget,
} from "../botops/worker-supervisor.js";

function print(message: string): void {
  process.stdout.write(`${message}\n`);
}

function parseTarget(value: string | undefined): WorkerSupervisorTarget | null {
  return value === "nas" || value === "windows" ? value : null;
}

async function main(): Promise<void> {
  initDatabase();

  const target = parseTarget(process.argv[2]);
  const action = process.argv[3] ?? "status";
  if (!target || !["status", "start", "stop", "restart"].includes(action)) {
    print("Usage: tsx src/cli/worker-supervisor.ts nas|windows status|start|stop|restart");
    process.exitCode = 1;
    return;
  }

  if (action === "status") {
    print(formatWorkerSupervisorStatus(readWorkerSupervisorStatus(process.cwd(), target)));
    return;
  }

  const result = action === "start"
    ? startWorkerSupervisor(process.cwd(), target)
    : action === "stop"
      ? stopWorkerSupervisor(process.cwd(), target)
      : await restartWorkerSupervisor(process.cwd(), target);

  print(result.message);
  print(formatWorkerSupervisorStatus(result.status));
  process.exitCode = result.ok ? 0 : 1;
}

main().catch((error) => {
  print(error instanceof Error ? error.message : "worker supervisor failed");
  process.exitCode = 1;
});
