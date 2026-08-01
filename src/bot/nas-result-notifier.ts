import fs from "node:fs";
import type { Client } from "discord.js";
import {
  expireStaleNasHandoffRequests,
  getNasHandoffRequest,
  updateNasHandoffRequestResult,
} from "../db/database.js";
import {
  listHandoffEnvelopeFiles,
  readHandoffEnvelope,
  type HandoffEnvelope,
} from "../nas/handoff-store.js";
import { getConfig } from "../utils/config.js";
import { sanitizePublicText } from "../utils/public-safety.js";
import { readHandoffRootFromWorkerEnv } from "./commands/nas.js";
import { recordOperatorEvent } from "./operator-events.js";

export interface NasResultNotification {
  channelId: string;
  requestId: string;
  checkName: string;
  status: "completed" | "failed";
  summary: string;
  updatedAt: string;
}

function staleCutoff(now = new Date()): string {
  return new Date(now.getTime() - getConfig().DISCORD_NAS_REQUEST_STALE_AFTER_MS).toISOString();
}

function envelopeStatus(value: string | undefined, fallback: HandoffEnvelope["status"]): "completed" | "failed" {
  if (value === "passed") return "completed";
  if (value === "failed") return "failed";
  return fallback === "completed" ? "completed" : "failed";
}

export function reconcileNasHandoffResults(repoRoot: string): NasResultNotification[] {
  const notifications: NasResultNotification[] = [];
  const now = new Date();
  for (const request of expireStaleNasHandoffRequests(staleCutoff(now), now.toISOString())) {
    notifications.push({
      channelId: request.channel_id,
      requestId: request.id,
      checkName: request.check_name,
      status: "failed",
      summary: request.result_summary ?? "no NAS result before stale timeout",
      updatedAt: request.updated_at,
    });
  }

  const handoffRoot = readHandoffRootFromWorkerEnv(repoRoot);
  if (!handoffRoot || !fs.existsSync(handoffRoot)) return notifications;

  const outboxResults = listHandoffEnvelopeFiles(handoffRoot, "outbox")
    .map((filePath) => {
      try {
        return readHandoffEnvelope(filePath);
      } catch {
        return null;
      }
    })
    .filter((envelope): envelope is HandoffEnvelope => envelope?.type === "audit.result");

  for (const envelope of outboxResults) {
    const requestId = envelope.publicFields.request;
    if (!requestId) continue;
    const request = getNasHandoffRequest(requestId);
    if (!request || request.status !== "queued") continue;

    const status = envelopeStatus(envelope.publicFields.result, envelope.status);
    const summary = sanitizePublicText(envelope.publicFields.summary ?? envelope.publicSummary, 240) || "result received";
    updateNasHandoffRequestResult(request.id, status, summary, envelope.createdAt);
    notifications.push({
      channelId: request.channel_id,
      requestId: request.id,
      checkName: request.check_name,
      status,
      summary,
      updatedAt: envelope.createdAt,
    });
  }

  return notifications;
}

export function buildNasResultNotificationMessage(notification: NasResultNotification): string {
  return [
    "**NAS Handoff Result**",
    "```text",
    `request ${notification.requestId.slice(0, 12)} check=${notification.checkName} status=${notification.status}`,
    `summary=${notification.summary}`,
    "```",
  ].join("\n");
}

export async function notifyNasHandoffResults(client: Client, repoRoot: string): Promise<number> {
  const notifications = reconcileNasHandoffResults(repoRoot);
  let sent = 0;

  for (const notification of notifications) {
    try {
      const channel = await client.channels.fetch(notification.channelId);
      if (!channel?.isSendable()) continue;
      await channel.send({ content: buildNasResultNotificationMessage(notification) });
      recordOperatorEvent({ kind: "task", status: `nas-result-${notification.status}`, channelId: notification.channelId }, repoRoot);
      sent += 1;
    } catch {
      recordOperatorEvent({ kind: "task", status: "nas-result-notify-failed", channelId: notification.channelId }, repoRoot);
    }
  }

  return sent;
}

export function startNasResultNotifier(client: Client, repoRoot = process.cwd()): NodeJS.Timeout | null {
  const config = getConfig();
  if (!config.DISCORD_ENABLE_NAS_RESULT_NOTIFICATIONS) return null;

  const poll = () => {
    void notifyNasHandoffResults(client, repoRoot).catch(() => {
      recordOperatorEvent({ kind: "task", status: "nas-result-poll-failed" }, repoRoot);
    });
  };

  poll();
  return setInterval(poll, config.DISCORD_NAS_RESULT_POLL_INTERVAL_MS);
}
