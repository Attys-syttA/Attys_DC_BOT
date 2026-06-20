import { describe, expect, it, vi } from "vitest";
import { buildStartupNotification, sendStartupNotification } from "./notifications.js";
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
    expect(message).toContain("slash command registration: enabled");
    expect(message).toContain("slash commands loaded: 19");
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
