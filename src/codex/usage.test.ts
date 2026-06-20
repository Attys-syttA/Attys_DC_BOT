import { describe, it, expect } from "vitest";
import {
  formatUsageCacheAge,
  getCodexUsageRows,
  getUsagePercentLeft,
  normalizeCodexUsage,
  normalizeCodexUsageCachePayload,
} from "./usage.js";

describe("codex usage helpers", () => {
  it("normalizes the codex rate limit snapshot", () => {
    const usage = normalizeCodexUsage({
      rateLimits: {
        planType: "pro",
        primary: { usedPercent: 35, windowDurationMins: 300, resetsAt: 1_700_000_000 },
        secondary: { usedPercent: 60, windowDurationMins: 10080, resetsAt: 1_700_100_000 },
      },
      rateLimitsByLimitId: {
        codex: {
          planType: "pro",
          primary: { usedPercent: 35, windowDurationMins: 300, resetsAt: 1_700_000_000 },
          secondary: { usedPercent: 60, windowDurationMins: 10080, resetsAt: 1_700_100_000 },
        },
      },
    });

    expect(usage).toEqual({
      planType: "pro",
      buckets: [
        {
          title: null,
          primary: { usedPercent: 35, windowDurationMins: 300, resetsAt: 1_700_000_000 },
          secondary: { usedPercent: 60, windowDurationMins: 10080, resetsAt: 1_700_100_000 },
        },
      ],
    });
  });

  it("returns null when there is no usable rate limit window", () => {
    expect(
      normalizeCodexUsage({
        rateLimits: {
          planType: "pro",
        },
      }),
    ).toBeNull();
  });

  it("flattens primary and secondary usage windows into rows", () => {
    const rows = getCodexUsageRows({
      planType: "pro",
      buckets: [
        {
          title: "Codex",
          primary: { usedPercent: 10, windowDurationMins: 300, resetsAt: 1 },
          secondary: { usedPercent: 70, windowDurationMins: 10080, resetsAt: 2 },
        },
      ],
    });

    expect(rows).toEqual([
      { bucketTitle: "Codex", window: { usedPercent: 10, windowDurationMins: 300, resetsAt: 1 } },
      { bucketTitle: null, window: { usedPercent: 70, windowDurationMins: 10080, resetsAt: 2 } },
    ]);
  });

  it("converts used percent into remaining percent", () => {
    expect(getUsagePercentLeft({ usedPercent: 35 })).toBe(65);
    expect(getUsagePercentLeft({ usedPercent: 140 })).toBe(0);
    expect(getUsagePercentLeft({ usedPercent: -20 })).toBe(100);
  });

  it("normalizes valid cache payloads and rejects broken cache payloads", () => {
    const payload = normalizeCodexUsageCachePayload({
      fetchedAt: 1_700_000_000,
      usage: {
        planType: "pro",
        buckets: [{ title: "Codex", primary: { usedPercent: 10 } }],
      },
    });

    expect(payload?.fetchedAt).toBe(1_700_000_000_000);
    expect(payload?.usage.buckets[0].primary?.usedPercent).toBe(10);
    expect(normalizeCodexUsageCachePayload({ fetchedAt: "bad", usage: {} })).toBeNull();
    expect(normalizeCodexUsageCachePayload({ fetchedAt: Date.now(), usage: { buckets: [] } })).toBeNull();
  });

  it("formats usage cache ages without exposing local paths", () => {
    const now = 1_700_000_000_000;
    expect(formatUsageCacheAge(null, now)).toBe("cache missing");
    expect(formatUsageCacheAge(now - 5_000, now)).toBe("just now");
    expect(formatUsageCacheAge(now - 10 * 60_000, now)).toBe("10m ago");
    expect(formatUsageCacheAge(now - 3 * 60 * 60_000, now)).toBe("3h ago");
    expect(formatUsageCacheAge(now - 3 * 24 * 60 * 60_000, now)).toBe("3d ago");
  });
});
