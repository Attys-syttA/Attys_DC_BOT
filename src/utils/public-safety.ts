export function sanitizePublicText(value: unknown, maxLength = 240): string {
  const text = String(value ?? "");
  return text
    .replace(/([A-Z0-9_]*(?:TOKEN|SECRET|KEY|AUTH|PASSWORD)[A-Z0-9_]*=)\S+/gi, "$1<redacted>")
    .replace(/[A-Za-z]:[\\/][^\s`"']+/g, "<local-path>")
    .replace(/(?:^|\s)\/(?:Users|home|mnt|var|tmp)\/[^\s`"']+/g, " <local-path>")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "<ip>")
    .replace(/<#\d{5,30}>/g, "<#channel>")
    .replace(/\b\d{15,30}\b/g, "<id>")
    .replace(/\b[A-Za-z0-9_-]{48,}\b/g, "<redacted>")
    .trim()
    .slice(0, maxLength);
}

export function sanitizePublicFileLabel(value: unknown): string {
  const text = String(value ?? "unknown").trim();
  if (!text) return "unknown";
  const parts = text.split(/[\\/]/).filter(Boolean);
  const basename = parts.at(-1);
  if (!basename || basename === text) return sanitizePublicText(text, 160) || "unknown";
  return `<local-path>/${sanitizePublicText(basename, 120) || "unknown"}`;
}
