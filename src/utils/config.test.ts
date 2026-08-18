import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("config", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    // Set valid env vars
    process.env.DISCORD_BOT_TOKEN = "test-token";
    delete process.env.DISCORD_APPLICATION_ID;
    process.env.DISCORD_GUILD_ID = "test-guild";
    delete process.env.DISCORD_NOTIFICATION_CHANNEL_ID;
    process.env.ALLOWED_USER_IDS = "user1,user2";
    delete process.env.ALLOWED_ROLE_IDS;
    process.env.BASE_PROJECT_DIR = "/projects";
    // Clear optional vars to use defaults
    delete process.env.DISCORD_DATABASE_PATH;
    delete process.env.DISCORD_SESSION_STORE_PATH;
    delete process.env.RATE_LIMIT_PER_MINUTE;
    delete process.env.DISCORD_QUEUE_MAX_ITEMS;
    delete process.env.DISCORD_ENABLE_MESSAGE_PROMPTS;
    delete process.env.DISCORD_ENABLE_ATTACHMENT_MESSAGES;
    delete process.env.DISCORD_EPHEMERAL_RESPONSES;
    delete process.env.DISCORD_REGISTER_COMMANDS;
    delete process.env.DISCORD_ENABLE_RUN_TESTS;
    delete process.env.DISCORD_ENABLE_AUDIT;
    delete process.env.DISCORD_ENABLE_AUDIT_REPAIR;
    delete process.env.DISCORD_ENABLE_AUDIT_REPAIR_EXECUTION;
    delete process.env.DISCORD_ENABLE_AUDIT_REPAIR_APPLY;
    delete process.env.DISCORD_ENABLE_NAS_STATUS;
    delete process.env.DISCORD_ENABLE_NAS_HANDOFF;
    delete process.env.DISCORD_ENABLE_NAS_BRIDGE_LIFECYCLE;
    delete process.env.DISCORD_ENABLE_NAS_BRIDGE_SMOKE;
    delete process.env.DISCORD_ENABLE_NAS_SYNC_STATUS;
    delete process.env.DISCORD_ENABLE_NAS_RESULT_NOTIFICATIONS;
    delete process.env.DISCORD_NAS_RESULT_POLL_INTERVAL_MS;
    delete process.env.DISCORD_NAS_REQUEST_STALE_AFTER_MS;
    delete process.env.DISCORD_ENABLE_AUTO_APPROVE;
    delete process.env.DISCORD_ENABLE_SESSION_DELETE;
    delete process.env.DISCORD_ENABLE_BOT_LIFECYCLE;
    delete process.env.SHOW_COST;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("loadConfig returns valid config from environment", async () => {
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    expect(config.DISCORD_BOT_TOKEN).toBe("test-token");
    expect(config.DISCORD_APPLICATION_ID).toBe("");
    expect(config.DISCORD_GUILD_ID).toBe("test-guild");
    expect(config.DISCORD_NOTIFICATION_CHANNEL_ID).toBe("");
    expect(config.ALLOWED_USER_IDS).toEqual(["user1", "user2"]);
    expect(config.ALLOWED_ROLE_IDS).toEqual([]);
    expect(config.BASE_PROJECT_DIR).toBe("/projects");
  });

  it("uses default values for optional fields", async () => {
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    expect(config.RATE_LIMIT_PER_MINUTE).toBe(10);
    expect(config.DISCORD_DATABASE_PATH).toBe(".discord-bot-state/bridge.sqlite");
    expect(config.DISCORD_SESSION_STORE_PATH).toBe(".discord-bot-state/sessions.json");
    expect(config.DISCORD_QUEUE_MAX_ITEMS).toBe(10);
    expect(config.DISCORD_ENABLE_MESSAGE_PROMPTS).toBe(false);
    expect(config.DISCORD_ENABLE_ATTACHMENT_MESSAGES).toBe(false);
    expect(config.DISCORD_EPHEMERAL_RESPONSES).toBe(true);
    expect(config.DISCORD_REGISTER_COMMANDS).toBe(false);
    expect(config.DISCORD_ENABLE_RUN_TESTS).toBe(false);
    expect(config.DISCORD_ENABLE_AUDIT).toBe(false);
    expect(config.DISCORD_ENABLE_AUDIT_REPAIR).toBe(false);
    expect(config.DISCORD_ENABLE_AUDIT_REPAIR_EXECUTION).toBe(false);
    expect(config.DISCORD_ENABLE_AUDIT_REPAIR_APPLY).toBe(false);
    expect(config.DISCORD_ENABLE_NAS_STATUS).toBe(false);
    expect(config.DISCORD_ENABLE_NAS_HANDOFF).toBe(false);
    expect(config.DISCORD_ENABLE_NAS_BRIDGE_LIFECYCLE).toBe(false);
    expect(config.DISCORD_ENABLE_NAS_BRIDGE_SMOKE).toBe(false);
    expect(config.DISCORD_ENABLE_NAS_SYNC_STATUS).toBe(false);
    expect(config.DISCORD_ENABLE_NAS_RESULT_NOTIFICATIONS).toBe(false);
    expect(config.DISCORD_NAS_RESULT_POLL_INTERVAL_MS).toBe(60_000);
    expect(config.DISCORD_NAS_REQUEST_STALE_AFTER_MS).toBe(900_000);
    expect(config.DISCORD_ENABLE_AUTO_APPROVE).toBe(false);
    expect(config.DISCORD_ENABLE_SESSION_DELETE).toBe(false);
    expect(config.DISCORD_ENABLE_BOT_LIFECYCLE).toBe(false);
    expect(config.SHOW_COST).toBe(false);
  });

  it("parses DISCORD_APPLICATION_ID when provided", async () => {
    process.env.DISCORD_APPLICATION_ID = "app-id";
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    expect(config.DISCORD_APPLICATION_ID).toBe("app-id");
  });

  it("parses DISCORD_NOTIFICATION_CHANNEL_ID when provided", async () => {
    process.env.DISCORD_NOTIFICATION_CHANNEL_ID = "notify-channel";
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    expect(config.DISCORD_NOTIFICATION_CHANNEL_ID).toBe("notify-channel");
  });

  it("parses ALLOWED_USER_IDS with spaces", async () => {
    process.env.ALLOWED_USER_IDS = " user1 , user2 , user3 , ";
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    expect(config.ALLOWED_USER_IDS).toEqual(["user1", "user2", "user3"]);
  });

  it("parses ALLOWED_ROLE_IDS with spaces", async () => {
    process.env.ALLOWED_ROLE_IDS = " role1 , role2 , ";
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    expect(config.ALLOWED_ROLE_IDS).toEqual(["role1", "role2"]);
  });

  it("coerces RATE_LIMIT_PER_MINUTE to integer", async () => {
    process.env.RATE_LIMIT_PER_MINUTE = "20";
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    expect(config.RATE_LIMIT_PER_MINUTE).toBe(20);
  });

  it("parses SHOW_COST as boolean", async () => {
    process.env.SHOW_COST = "false";
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    expect(config.SHOW_COST).toBe(false);
  });

  it("parses DISCORD_ENABLE_AUTO_APPROVE as boolean", async () => {
    process.env.DISCORD_ENABLE_AUTO_APPROVE = "true";
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    expect(config.DISCORD_ENABLE_AUTO_APPROVE).toBe(true);
  });

  it("parses DISCORD_ENABLE_ATTACHMENT_MESSAGES as boolean", async () => {
    process.env.DISCORD_ENABLE_ATTACHMENT_MESSAGES = "true";
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    expect(config.DISCORD_ENABLE_ATTACHMENT_MESSAGES).toBe(true);
  });

  it("parses DISCORD_ENABLE_SESSION_DELETE as boolean", async () => {
    process.env.DISCORD_ENABLE_SESSION_DELETE = "true";
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    expect(config.DISCORD_ENABLE_SESSION_DELETE).toBe(true);
  });

  it("parses DISCORD_ENABLE_BOT_LIFECYCLE as boolean", async () => {
    process.env.DISCORD_ENABLE_BOT_LIFECYCLE = "true";
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    expect(config.DISCORD_ENABLE_BOT_LIFECYCLE).toBe(true);
  });

  it("parses DISCORD_ENABLE_AUDIT as boolean", async () => {
    process.env.DISCORD_ENABLE_AUDIT = "true";
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    expect(config.DISCORD_ENABLE_AUDIT).toBe(true);
  });

  it("parses DISCORD_ENABLE_AUDIT_REPAIR as boolean", async () => {
    process.env.DISCORD_ENABLE_AUDIT_REPAIR = "true";
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    expect(config.DISCORD_ENABLE_AUDIT_REPAIR).toBe(true);
  });

  it("parses DISCORD_ENABLE_AUDIT_REPAIR_EXECUTION as boolean", async () => {
    process.env.DISCORD_ENABLE_AUDIT_REPAIR_EXECUTION = "true";
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    expect(config.DISCORD_ENABLE_AUDIT_REPAIR_EXECUTION).toBe(true);
  });

  it("parses DISCORD_ENABLE_AUDIT_REPAIR_APPLY as boolean", async () => {
    process.env.DISCORD_ENABLE_AUDIT_REPAIR_APPLY = "true";
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    expect(config.DISCORD_ENABLE_AUDIT_REPAIR_APPLY).toBe(true);
  });

  it("parses DISCORD_ENABLE_NAS_STATUS as boolean", async () => {
    process.env.DISCORD_ENABLE_NAS_STATUS = "true";
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    expect(config.DISCORD_ENABLE_NAS_STATUS).toBe(true);
  });

  it("parses DISCORD_ENABLE_NAS_HANDOFF as boolean", async () => {
    process.env.DISCORD_ENABLE_NAS_HANDOFF = "true";
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    expect(config.DISCORD_ENABLE_NAS_HANDOFF).toBe(true);
  });

  it("parses DISCORD_ENABLE_NAS_BRIDGE_LIFECYCLE as boolean", async () => {
    process.env.DISCORD_ENABLE_NAS_BRIDGE_LIFECYCLE = "true";
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    expect(config.DISCORD_ENABLE_NAS_BRIDGE_LIFECYCLE).toBe(true);
  });

  it("parses DISCORD_ENABLE_NAS_BRIDGE_SMOKE as boolean", async () => {
    process.env.DISCORD_ENABLE_NAS_BRIDGE_SMOKE = "true";
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    expect(config.DISCORD_ENABLE_NAS_BRIDGE_SMOKE).toBe(true);
  });

  it("parses DISCORD_ENABLE_NAS_SYNC_STATUS as boolean", async () => {
    process.env.DISCORD_ENABLE_NAS_SYNC_STATUS = "true";
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    expect(config.DISCORD_ENABLE_NAS_SYNC_STATUS).toBe(true);
  });

  it("parses NAS result notification settings", async () => {
    process.env.DISCORD_ENABLE_NAS_RESULT_NOTIFICATIONS = "true";
    process.env.DISCORD_NAS_RESULT_POLL_INTERVAL_MS = "30000";
    process.env.DISCORD_NAS_REQUEST_STALE_AFTER_MS = "120000";
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    expect(config.DISCORD_ENABLE_NAS_RESULT_NOTIFICATIONS).toBe(true);
    expect(config.DISCORD_NAS_RESULT_POLL_INTERVAL_MS).toBe(30_000);
    expect(config.DISCORD_NAS_REQUEST_STALE_AFTER_MS).toBe(120_000);
  });

  it("accepts legacy NAS archive env names without overriding current names", async () => {
    delete process.env.DISCORD_BOT_TOKEN;
    delete process.env.ALLOWED_USER_IDS;
    delete process.env.ALLOWED_ROLE_IDS;
    process.env.DISCORD_TOKEN = "legacy-token";
    process.env.DISCORD_ALLOWED_USER_IDS = "legacy-user";
    process.env.DISCORD_ALLOWED_ROLE_IDS = "legacy-role";

    const { loadConfig } = await import("./config.js");
    const config = loadConfig();

    expect(config.DISCORD_BOT_TOKEN).toBe("legacy-token");
    expect(config.ALLOWED_USER_IDS).toEqual(["legacy-user"]);
    expect(config.ALLOWED_ROLE_IDS).toEqual(["legacy-role"]);
  });

  it("calls process.exit(1) when required env vars are missing", async () => {
    delete process.env.DISCORD_BOT_TOKEN;
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const { loadConfig } = await import("./config.js");
    expect(() => loadConfig()).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it("getConfig returns cached config on second call", async () => {
    const { loadConfig, getConfig } = await import("./config.js");
    const first = loadConfig();
    const second = getConfig();
    expect(first).toBe(second); // same reference
  });

  it("getConfig calls loadConfig if not yet loaded", async () => {
    const { getConfig } = await import("./config.js");
    const config = getConfig();
    expect(config.DISCORD_BOT_TOKEN).toBe("test-token");
  });
});
