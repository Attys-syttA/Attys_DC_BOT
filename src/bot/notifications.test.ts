import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordOperatorEvent: vi.fn(),
}));

vi.mock("./operator-events.js", () => ({
  recordOperatorEvent: mocks.recordOperatorEvent,
}));

import {
  buildOperatorAttentionNotification,
  buildOperatorTaskOutcomeNotification,
  buildStartupNotification,
  sendOperatorAttentionNotification,
  sendOperatorTaskOutcomeNotification,
  sendStartupNotification,
} from "./notifications.js";
import type { Config } from "../utils/config.js";

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    DISCORD_BOT_TOKEN: "token",
    DISCORD_APPLICATION_ID: "app-id",
    DISCORD_GUILD_ID: "guild-id",
    DISCORD_NOTIFICATION_CHANNEL_ID: "",
    ALLOWED_USER_IDS: ["user-id"],
    ALLOWED_ROLE_IDS: [],
    BASE_PROJECT_DIR: "/projects",
    DISCORD_DATABASE_PATH: ".discord-bot-state/bridge.sqlite",
    DISCORD_SESSION_STORE_PATH: ".discord-bot-state/sessions.json",
    RATE_LIMIT_PER_MINUTE: 10,
    DISCORD_QUEUE_MAX_ITEMS: 10,
    DISCORD_ENABLE_MESSAGE_PROMPTS: false,
    DISCORD_EPHEMERAL_RESPONSES: true,
    DISCORD_REGISTER_COMMANDS: false,
    DISCORD_ENABLE_RUN_TESTS: false,
    DISCORD_ENABLE_AUTO_APPROVE: false,
    DISCORD_ENABLE_SESSION_DELETE: false,
    DISCORD_ENABLE_BOT_LIFECYCLE: false,
    SHOW_COST: false,
    ...overrides,
  };
}

describe("startup notifications", () => {
  it("builds a public-safe startup message", () => {
    const message = buildStartupNotification(
      makeConfig({
        DISCORD_ENABLE_MESSAGE_PROMPTS: true,
        DISCORD_REGISTER_COMMANDS: true,
      }),
      {
        botTag: "Codex_Dscrd_BOT#2018",
        commandCount: 19,
        launchReason: "windows-tray-restart",
        operatorToolsStatus: "ready",
      },
    );

    expect(message).toContain("Attys DC BOT online.");
    expect(message).toContain("launch reason: Windows tray restart");
    expect(message).toContain("bot user: Codex_Dscrd_BOT#2018");
    expect(message).toContain("operator tools: ready");
    expect(message).toContain("message prompt mode: enabled");
    expect(message).toContain("application command registration: enabled");
    expect(message).toContain("application commands loaded: 19");
    expect(message).not.toContain("token");
    expect(message).not.toContain("guild-id");
  });

  it("falls back to a generic reason for unknown launch contexts", () => {
    const message = buildStartupNotification(makeConfig(), {
      launchReason: "C:\\private\\local\\script.bat",
      operatorToolsStatus: "C:\\private\\tool.log",
    });

    expect(message).toContain("launch reason: manual or external start");
    expect(message).toContain("operator tools: unknown");
    expect(message).not.toContain("private");
  });

  it("allows the duplicate-preflight running startup status", () => {
    const message = buildStartupNotification(makeConfig(), {
      operatorToolsStatus: "running",
    });

    expect(message).toContain("operator tools: running");
  });

  it("skips sending when no notification channel is configured", async () => {
    const fetch = vi.fn();
    await sendStartupNotification({ channels: { fetch } } as never, makeConfig());
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.recordOperatorEvent).toHaveBeenCalledWith({ kind: "startup", status: "online" });
  });

  it("sends to the configured notification channel", async () => {
    const send = vi.fn();
    const fetch = vi.fn().mockResolvedValue({
      isSendable: () => true,
      send,
    });

    await sendStartupNotification(
      { channels: { fetch } } as never,
      makeConfig({ DISCORD_NOTIFICATION_CHANNEL_ID: "notify-channel" }),
    );

    expect(fetch).toHaveBeenCalledWith("notify-channel");
    expect(send).toHaveBeenCalledWith(expect.stringContaining("Attys DC BOT online."));
  });
});

describe("operator attention notifications", () => {
  it("builds a public-safe attention message", () => {
    const message = buildOperatorAttentionNotification("approval", "channel-1");

    expect(message).toContain("Attys DC BOT needs operator attention.");
    expect(message).toContain("action: tool approval");
    expect(message).toContain("channel: <#channel-1>");
    expect(message).not.toContain("token");
    expect(message).not.toContain("C:\\");
  });

  it("skips sending when notification channel is not configured", async () => {
    const fetch = vi.fn();
    await sendOperatorAttentionNotification(
      { id: "project-channel", client: { channels: { fetch } } } as never,
      makeConfig(),
      "question",
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.recordOperatorEvent).toHaveBeenCalledWith({
      kind: "attention",
      status: "question",
      channelId: "project-channel",
    });
  });

  it("skips duplicate notifications to the same channel", async () => {
    const fetch = vi.fn();
    await sendOperatorAttentionNotification(
      { id: "notify-channel", client: { channels: { fetch } } } as never,
      makeConfig({ DISCORD_NOTIFICATION_CHANNEL_ID: "notify-channel" }),
      "question",
    );

    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends an attention notification to the configured channel", async () => {
    const send = vi.fn();
    const fetch = vi.fn().mockResolvedValue({
      isSendable: () => true,
      send,
    });

    await sendOperatorAttentionNotification(
      { id: "project-channel", client: { channels: { fetch } } } as never,
      makeConfig({ DISCORD_NOTIFICATION_CHANNEL_ID: "notify-channel" }),
      "question",
    );

    expect(fetch).toHaveBeenCalledWith("notify-channel");
    expect(send).toHaveBeenCalledWith(expect.stringContaining("action: Codex question"));
    expect(send).toHaveBeenCalledWith(expect.stringContaining("channel: <#project-channel>"));
  });
});

describe("operator task outcome notifications", () => {
  it("builds a public-safe completion message", () => {
    const message = buildOperatorTaskOutcomeNotification("completed", "channel-1");

    expect(message).toContain("Attys DC BOT task update.");
    expect(message).toContain("status: completed");
    expect(message).toContain("channel: <#channel-1>");
    expect(message).not.toContain("token");
    expect(message).not.toContain("C:\\");
  });

  it("builds a public-safe failure message without error details", () => {
    const message = buildOperatorTaskOutcomeNotification("failed", "channel-1");

    expect(message).toContain("status: failed");
    expect(message).toContain("Open the project channel for the full result.");
    expect(message).not.toContain("stack");
    expect(message).not.toContain("private");
  });

  it("sends task outcome notifications to a separate configured channel", async () => {
    const send = vi.fn();
    const fetch = vi.fn().mockResolvedValue({
      isSendable: () => true,
      send,
    });

    await sendOperatorTaskOutcomeNotification(
      { id: "project-channel", client: { channels: { fetch } } } as never,
      makeConfig({ DISCORD_NOTIFICATION_CHANNEL_ID: "notify-channel" }),
      "completed",
    );

    expect(fetch).toHaveBeenCalledWith("notify-channel");
    expect(send).toHaveBeenCalledWith(expect.stringContaining("status: completed"));
    expect(send).toHaveBeenCalledWith(expect.stringContaining("channel: <#project-channel>"));
  });

  it("skips duplicate task outcome notifications to the same channel", async () => {
    const fetch = vi.fn();

    await sendOperatorTaskOutcomeNotification(
      { id: "notify-channel", client: { channels: { fetch } } } as never,
      makeConfig({ DISCORD_NOTIFICATION_CHANNEL_ID: "notify-channel" }),
      "failed",
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.recordOperatorEvent).toHaveBeenCalledWith({
      kind: "task",
      status: "failed",
      channelId: "notify-channel",
    });
  });
});
