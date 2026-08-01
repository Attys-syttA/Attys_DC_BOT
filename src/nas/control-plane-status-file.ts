import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { NasControlPlaneSnapshot } from "./control-plane-runtime.js";

export function writeNasControlPlaneStatusFile(
  statusPath: string,
  snapshot: NasControlPlaneSnapshot,
): void {
  const directory = path.dirname(statusPath);
  fs.mkdirSync(directory, { recursive: true });
  const tempPath = path.join(directory, `${path.basename(statusPath)}.${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, statusPath);
}
