import path from "node:path";
import { processQueuedHandoffOnce } from "../nas/handoff-worker.js";

const handoffRoot = process.env.ATTYS_NAS_HANDOFF_ROOT
  ? path.resolve(process.env.ATTYS_NAS_HANDOFF_ROOT)
  : path.resolve("data", "handoff");

const workspaceRoot = process.env.ATTYS_WORKER_WORKSPACE_ROOT
  ? path.resolve(process.env.ATTYS_WORKER_WORKSPACE_ROOT)
  : path.resolve("..");

const result = await processQueuedHandoffOnce({
  handoffRoot,
  workspaceRoot,
});

console.log(JSON.stringify(result, null, 2));
