import { describe, expect, it } from "vitest";
import {
  buildAttachmentPromptSuffix,
  safeAttachmentFileName,
} from "./attachments.js";

describe("attachment helpers", () => {
  it("keeps a simple filename", () => {
    expect(safeAttachmentFileName("notes.txt")).toBe("notes.txt");
  });

  it("strips path traversal and unsafe characters", () => {
    expect(safeAttachmentFileName("..\\..\\secret?.txt")).toBe("secret_.txt");
    expect(safeAttachmentFileName("../../secret?.txt")).toBe("secret_.txt");
  });

  it("uses a safe fallback for empty names", () => {
    expect(safeAttachmentFileName("...")).toBe("attachment");
    expect(safeAttachmentFileName(null)).toBe("attachment");
  });

  it("builds Codex-only local file references", () => {
    const suffix = buildAttachmentPromptSuffix([
      { filePath: "C:\\workspace\\app\\.codex-uploads\\image.png", isImage: true, safeName: "image.png" },
      { filePath: "C:\\workspace\\app\\.codex-uploads\\notes.txt", isImage: false, safeName: "notes.txt" },
    ]);

    expect(suffix).toContain("[Attached images - inspect these local files]");
    expect(suffix).toContain("[Attached files - inspect these local files]");
    expect(suffix).toContain("image.png");
    expect(suffix).toContain("notes.txt");
  });
});
