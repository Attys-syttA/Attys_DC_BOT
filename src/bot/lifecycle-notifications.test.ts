import { describe, expect, it } from "vitest";
import { buildLifecycleNotification } from "./lifecycle-notifications.js";

describe("lifecycle notifications", () => {
  it("builds a public-safe stop message", () => {
    const message = buildLifecycleNotification("windows-tray-stop");

    expect(message).toContain("Attys DC BOT lifecycle event.");
    expect(message).toContain("event: Windows tray stop");
  });

  it("does not echo unknown event values", () => {
    const message = buildLifecycleNotification("C:\\private\\stopper.cmd");

    expect(message).toContain("event: manual or external lifecycle event");
    expect(message).not.toContain("private");
    expect(message).not.toContain("stopper");
  });
});
