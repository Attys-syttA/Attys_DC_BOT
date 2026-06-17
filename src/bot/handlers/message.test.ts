import { describe, expect, it } from "vitest";
import { safeAttachmentFileName } from "./message.js";

describe("safeAttachmentFileName", () => {
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
});
