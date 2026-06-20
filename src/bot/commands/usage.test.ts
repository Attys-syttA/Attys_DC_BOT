import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchCodexUsage: vi.fn(),
  loadCodexUsageCache: vi.fn(),
}));

vi.mock("../../codex/usage.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../codex/usage.js")>();
  return {
    ...actual,
    fetchCodexUsage: mocks.fetchCodexUsage,
    loadCodexUsageCache: mocks.loadCodexUsageCache,
  };
});

import { execute } from "./usage.js";

function makeInteraction() {
  return {
    editReply: vi.fn(),
  };
}

describe("/usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadCodexUsageCache.mockReturnValue(null);
  });

  it("shows fetched Codex usage without exposing credentials", async () => {
    mocks.fetchCodexUsage.mockResolvedValue({
      planType: "pro",
      buckets: [
        {
          title: "Codex",
          primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 1_800_000_000 },
        },
      ],
    });
    const interaction = makeInteraction();

    await execute(interaction as never);

    const payload = interaction.editReply.mock.calls[0][0];
    expect(payload.embeds[0].data.title).toBe("📊 Codex Usage");
    expect(payload.embeds[0].data.description).toContain("**Plan**: `pro`");
    expect(payload.embeds[0].data.description).toContain("75% left");
    expect(payload.embeds[0].data.footer.text).toContain("chatgpt.com/codex/settings/usage");
  });

  it("falls back to cached usage when live fetch fails", async () => {
    mocks.fetchCodexUsage.mockRejectedValue(new Error("offline"));
    mocks.loadCodexUsageCache.mockReturnValue({
      fetchedAt: Date.now(),
      usage: {
        buckets: [
          {
            title: null,
            primary: { usedPercent: 60, windowDurationMins: 10080 },
          },
        ],
      },
    });
    const interaction = makeInteraction();

    await execute(interaction as never);

    const payload = interaction.editReply.mock.calls[0][0];
    expect(payload.embeds[0].data.description).toContain("40% left");
  });

  it("reports a login-oriented hint when usage is unavailable", async () => {
    mocks.fetchCodexUsage.mockResolvedValue(null);
    const interaction = makeInteraction();

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Codex usage unavailable: app-server did not return usable data and the local cache is missing or unreadable. Check `codex login status`, then try Refresh Usage again.",
    });
  });
});
