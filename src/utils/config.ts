import { z } from "zod";

const envSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1, "DISCORD_BOT_TOKEN is required"),
  DISCORD_APPLICATION_ID: z.string().default(""),
  DISCORD_GUILD_ID: z.string().min(1, "DISCORD_GUILD_ID is required"),
  DISCORD_NOTIFICATION_CHANNEL_ID: z.string().default(""),
  ALLOWED_USER_IDS: z
    .string()
    .min(1, "ALLOWED_USER_IDS is required")
    .transform((v) => v.split(",").map((id) => id.trim()).filter(Boolean)),
  ALLOWED_ROLE_IDS: z
    .string()
    .default("")
    .transform((v) => v.split(",").map((id) => id.trim()).filter(Boolean)),
  BASE_PROJECT_DIR: z.string().min(1, "BASE_PROJECT_DIR is required"),
  DISCORD_DATABASE_PATH: z.string().default(".discord-bot-state/bridge.sqlite"),
  DISCORD_SESSION_STORE_PATH: z.string().default(".discord-bot-state/sessions.json"),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
  DISCORD_QUEUE_MAX_ITEMS: z.coerce.number().int().positive().default(10),
  DISCORD_ENABLE_MESSAGE_PROMPTS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  DISCORD_ENABLE_ATTACHMENT_MESSAGES: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  DISCORD_EPHEMERAL_RESPONSES: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  DISCORD_REGISTER_COMMANDS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  DISCORD_ENABLE_RUN_TESTS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  DISCORD_ENABLE_AUDIT: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  DISCORD_ENABLE_AUDIT_REPAIR: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  DISCORD_ENABLE_NAS_STATUS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  DISCORD_ENABLE_NAS_HANDOFF: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  DISCORD_ENABLE_NAS_BRIDGE_LIFECYCLE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  DISCORD_ENABLE_NAS_BRIDGE_SMOKE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  DISCORD_ENABLE_NAS_SYNC_STATUS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  DISCORD_ENABLE_NAS_RESULT_NOTIFICATIONS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  DISCORD_NAS_RESULT_POLL_INTERVAL_MS: z.coerce.number().int().min(10_000).max(3_600_000).default(60_000),
  DISCORD_NAS_REQUEST_STALE_AFTER_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(900_000),
  DISCORD_ENABLE_AUTO_APPROVE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  DISCORD_ENABLE_SESSION_DELETE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  DISCORD_ENABLE_BOT_LIFECYCLE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  SHOW_COST: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type Config = z.infer<typeof envSchema>;

let _config: Config | null = null;

function withLegacyEnvAliases(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...env,
    DISCORD_BOT_TOKEN: env.DISCORD_BOT_TOKEN || env.DISCORD_TOKEN,
    ALLOWED_USER_IDS: env.ALLOWED_USER_IDS || env.DISCORD_ALLOWED_USER_IDS,
    ALLOWED_ROLE_IDS: env.ALLOWED_ROLE_IDS || env.DISCORD_ALLOWED_ROLE_IDS,
  };
}

export function loadConfig(): Config {
  if (_config) return _config;

  const result = envSchema.safeParse(withLegacyEnvAliases(process.env));
  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    console.error(`Configuration error:\n${errors}`);
    process.exit(1);
  }

  _config = result.data;
  return _config;
}

export function getConfig(): Config {
  if (!_config) return loadConfig();
  return _config;
}
