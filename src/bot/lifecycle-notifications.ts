const eventLabels: Record<string, string> = {
  "windows-launcher-stop": "Windows launcher stop",
  "windows-launcher-restart": "Windows launcher restart",
  "windows-foreground-restart": "Windows foreground restart",
  "windows-tray-stop": "Windows tray stop",
  "windows-tray-restart": "Windows tray restart",
  "windows-safe-update-stop": "Windows safe update stop",
};

export function safeLifecycleEventLabel(value: string | undefined): string {
  if (!value) return "manual or external lifecycle event";
  return eventLabels[value.trim().toLowerCase()] ?? "manual or external lifecycle event";
}

export function buildLifecycleNotification(eventName: string | undefined): string {
  return [
    "Attys DC BOT lifecycle event.",
    `event: ${safeLifecycleEventLabel(eventName)}`,
  ].join("\n");
}
