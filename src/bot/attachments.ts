import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { L } from "../utils/i18n.js";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".com", ".msi", ".scr", ".pif",
  ".dll", ".sys", ".drv",
  ".vbs", ".vbe", ".wsf", ".wsh",
]);
const MAX_FILE_SIZE = 25 * 1024 * 1024;

export interface AttachmentLike {
  name: string | null;
  size: number;
  url: string;
}

export interface DownloadedAttachment {
  filePath: string;
  isImage: boolean;
  safeName: string;
}

export function safeAttachmentFileName(name: string | null | undefined): string {
  const baseName = (name ?? "attachment").split(/[\\/]+/).pop() ?? "attachment";
  const cleaned = baseName
    .replace(/[\x00-\x1f<>:"/\\|?*]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120);
  return cleaned || "attachment";
}

export async function downloadAttachment(
  attachment: AttachmentLike,
  projectPath: string,
): Promise<DownloadedAttachment | { skipped: string }> {
  const safeName = safeAttachmentFileName(attachment.name);
  const ext = path.extname(safeName).toLowerCase();

  if (BLOCKED_EXTENSIONS.has(ext)) {
    return { skipped: L(`Blocked: \`${safeName}\` (dangerous file type)`, `차단됨: \`${safeName}\` (위험한 파일 형식)`) };
  }

  if (attachment.size > MAX_FILE_SIZE) {
    const sizeMB = (attachment.size / 1024 / 1024).toFixed(1);
    return { skipped: L(`Skipped: \`${safeName}\` (${sizeMB}MB exceeds 25MB limit)`, `건너뜀: \`${safeName}\` (${sizeMB}MB, 25MB 제한 초과)`) };
  }

  const uploadDir = path.join(projectPath, ".codex-uploads");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const fileName = `${Date.now()}-${safeName}`;
  const filePath = path.join(uploadDir, fileName);

  try {
    const response = await fetch(attachment.url);
    if (!response.ok || !response.body) {
      return { skipped: L(`Failed to download: \`${safeName}\``, `다운로드 실패: \`${safeName}\``) };
    }

    const fileStream = fs.createWriteStream(filePath);
    await pipeline(Readable.fromWeb(response.body as never), fileStream);
  } catch (error) {
    console.warn(`[download] Failed to download attachment ${safeName}:`, error instanceof Error ? error.message : error);
    return { skipped: L(`Failed to download: \`${safeName}\``, `다운로드 실패: \`${safeName}\``) };
  }

  return { filePath, isImage: IMAGE_EXTENSIONS.has(ext), safeName };
}

export function buildAttachmentPromptSuffix(downloaded: DownloadedAttachment[]): string {
  const imagePaths = downloaded.filter((item) => item.isImage).map((item) => item.filePath);
  const filePaths = downloaded.filter((item) => !item.isImage).map((item) => item.filePath);
  const parts: string[] = [];

  if (imagePaths.length > 0) {
    parts.push(`[Attached images - inspect these local files]\n${imagePaths.join("\n")}`);
  }
  if (filePaths.length > 0) {
    parts.push(`[Attached files - inspect these local files]\n${filePaths.join("\n")}`);
  }

  return parts.length > 0 ? `\n\n${parts.join("\n\n")}` : "";
}
