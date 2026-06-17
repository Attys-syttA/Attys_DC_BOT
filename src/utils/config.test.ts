import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("config", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    // Set valid env vars
    process.env.DISCORD_BOT_TOKEN = "test-token";
    delete process.env.DISCORD_APPLICATION_ID;
    process.env.DISCORD_GUILD_ID = "test-guild";
    process.env.ALLOWED_USER_IDS = "user1,user2";
    delete process.env.ALLOWED_ROLE_IDS;
    process.env.BASE_PROJECT_DIR = "/projects";
    // Clear optional vars to use defaults
    delete process.env.DISCORD_DATABASE_PATH;
    delete process.env.DISCORD_SESSION_STORE_PATH;
    delete process.env.RATE_LIMIT_PER_MINUTE;
    delete process.env.DISCORD_QUEUE_MAX_ITEMS;
    delete process.env.DISCORD_ENABLE_MESSAGE_PROMPTS;
    delete process.env.DISCORD_EPHEMERAL_RESPONSES;
    delete process.env.DISCORD_REGISTER_COMMANDS;
    delete process.env.DISCORD_ENABLE_RUN_TESTS;
    delete process.env.DISCORD_ENABLE_AUTO_APPROVE;
    delete process.env.DISCORD_ENABLE_SESSION_DELETE;
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
    expect(config.DISCORD_ENABLE_MESSAGE_PROMPTS).toBe(true);
    expect(config.DISCORD_EPHEMERAL_RESPONSES).toBe(true);
    expect(config.DISCORD_REGISTER_COMMANDS).toBe(false);
    expect(config.DISCORD_ENABLE_RUN_TESTS).toBe(false);
    expect(config.DISCORD_ENABLE_AUTO_APPROVE).toBe(false);
    expect(config.DISCORD_ENABLE_SESSION_DELETE).toBe(false);
    expect(config.SHOW_COST).toBe(false);
  });

  it("parses DISCORD_APPLICATION_ID when provided", async () => {
    process.env.DISCORD_APPLICATION_ID = "app-id";
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    expect(config.DISCORD_APPLICATION_ID).toBe("app-id");
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

  it("parses DISCORD_ENABLE_SESSION_DELETE as boolean", async () => {
    process.env.DISCORD_ENABLE_SESSION_DELETE = "true";
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    expect(config.DISCORD_ENABLE_SESSION_DELETE).toBe(true);
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
