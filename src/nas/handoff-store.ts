import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { sanitizePublicText } from "../utils/public-safety.js";

export const HANDOFF_BOXES = ["inbox", "outbox", "archive"] as const;
export const HANDOFF_MESSAGE_TYPES = [
  "worker.heartbeat",
  "control.status",
  "audit.request",
  "audit.status",
  "audit.result",
] as const;
export const HANDOFF_STATUSES = [
  "queued",
  "accepted",
  "completed",
  "failed",
  "stopped",
] as const;

export type HandoffBox = typeof HANDOFF_BOXES[number];
export type HandoffMessageType = typeof HANDOFF_MESSAGE_TYPES[number];
export type HandoffStatus = typeof HANDOFF_STATUSES[number];
export type HandoffEndpoint = "discord-control" | "nas-control-plane" | "pc-worker";
export type HandoffStoreStatus = "ready" | "missing" | "invalid";

export interface HandoffEnvelopeInput {
  id?: string;
  type: HandoffMessageType;
  source: HandoffEndpoint;
  target: HandoffEndpoint;
  status: HandoffStatus;
  publicSummary: string;
  publicFields?: Record<string, string>;
}

export interface HandoffEnvelope {
  schemaVersion: 1;
  id: string;
  type: HandoffMessageType;
  createdAt: string;
  source: HandoffEndpoint;
  target: HandoffEndpoint;
  status: HandoffStatus;
  publicSummary: string;
  publicFields: Record<string, string>;
}

export interface PublicHandoffBoxStatus {
  box: HandoffBox;
  status: HandoffStoreStatus;
  validMessages: number;
  invalidMessages: number;
  latestMessageAt: string | null;
}

export interface PublicHandoffStoreStatus {
  rootStatus: HandoffStoreStatus;
  boxes: PublicHandoffBoxStatus[];
}

const endpointSchema = z.enum(["discord-control", "nas-control-plane", "pc-worker"]);
const handoffEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  type: z.enum(HANDOFF_MESSAGE_TYPES),
  createdAt: z.string(),
  source: endpointSchema,
  target: endpointSchema,
  status: z.enum(HANDOFF_STATUSES),
  publicSummary: z.string(),
  publicFields: z.record(z.string(), z.string()),
});

function isHandoffBox(value: string): value is HandoffBox {
  return HANDOFF_BOXES.includes(value as HandoffBox);
}

function safeHandoffId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || /[\\/]/.test(trimmed) || trimmed.includes("..")) {
    throw new Error("Invalid handoff message id.");
  }
  const normalized = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(normalized)) {
    throw new Error("Invalid handoff message id.");
  }
  return normalized;
}

function sanitizePublicFields(fields: Record<string, string> | undefined): Record<string, string> {
  const entries = Object.entries(fields ?? {})
    .slice(0, 30)
    .map(([key, value]) => {
      const safeKey = sanitizePublicText(key, 80)
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "");
      if (!safeKey || safeKey.includes("<redacted>")) return null;
      return [safeKey, sanitizePublicText(value, 240)] as const;
    })
    .filter((entry): entry is readonly [string, string] => entry !== null);
  return Object.fromEntries(entries);
}

function resolveBoxPath(rootPath: string, box: HandoffBox): string {
  return path.join(rootPath, box);
}

function resolveEnvelopePath(rootPath: string, box: HandoffBox, id: string): string {
  return path.join(resolveBoxPath(rootPath, box), `${safeHandoffId(id)}.json`);
}

export function createHandoffEnvelope(
  input: HandoffEnvelopeInput,
  now = new Date(),
): HandoffEnvelope {
  return {
    schemaVersion: 1,
    id: safeHandoffId(input.id ?? crypto.randomUUID()),
    type: input.type,
    createdAt: now.toISOString(),
    source: input.source,
    target: input.target,
    status: input.status,
    publicSummary: sanitizePublicText(input.publicSummary, 240),
    publicFields: sanitizePublicFields(input.publicFields),
  };
}

export function ensureHandoffStore(rootPath: string): void {
  for (const dir of [...HANDOFF_BOXES, "tmp"]) {
    fs.mkdirSync(path.join(rootPath, dir), { recursive: true });
  }
}

export function writeHandoffEnvelope(
  rootPath: string,
  box: HandoffBox,
  envelope: HandoffEnvelope,
): string {
  if (!isHandoffBox(box)) {
    throw new Error("Invalid handoff box.");
  }
  const parsed = handoffEnvelopeSchema.parse(envelope);
  ensureHandoffStore(rootPath);
  const finalPath = resolveEnvelopePath(rootPath, box, parsed.id);
  if (fs.existsSync(finalPath)) {
    throw new Error("Refusing to overwrite existing handoff message.");
  }

  const tempPath = path.join(rootPath, "tmp", `${parsed.id}.${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(tempPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, finalPath);
  return finalPath;
}

export function readHandoffEnvelope(filePath: string): HandoffEnvelope {
  return handoffEnvelopeSchema.parse(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

export function readPublicHandoffStore(rootPath: string): PublicHandoffStoreStatus {
  if (!fs.existsSync(rootPath)) {
    return {
      rootStatus: "missing",
      boxes: HANDOFF_BOXES.map((box) => ({
        box,
        status: "missing",
        validMessages: 0,
        invalidMessages: 0,
        latestMessageAt: null,
      })),
    };
  }

  const boxes = HANDOFF_BOXES.map((box): PublicHandoffBoxStatus => {
    const boxPath = resolveBoxPath(rootPath, box);
    if (!fs.existsSync(boxPath)) {
      return {
        box,
        status: "missing",
        validMessages: 0,
        invalidMessages: 0,
        latestMessageAt: null,
      };
    }

    let validMessages = 0;
    let invalidMessages = 0;
    let latestMessageAt: string | null = null;

    for (const entry of fs.readdirSync(boxPath, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const message = readHandoffEnvelope(path.join(boxPath, entry.name));
        validMessages += 1;
        if (!latestMessageAt || message.createdAt > latestMessageAt) {
          latestMessageAt = message.createdAt;
        }
      } catch {
        invalidMessages += 1;
      }
    }

    return {
      box,
      status: invalidMessages > 0 ? "invalid" : "ready",
      validMessages,
      invalidMessages,
      latestMessageAt,
    };
  });

  return {
    rootStatus: boxes.some((box) => box.status === "invalid") ? "invalid" : "ready",
    boxes,
  };
}
