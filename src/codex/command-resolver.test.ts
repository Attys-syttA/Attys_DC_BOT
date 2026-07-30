import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCodexCommand } from "./command-resolver.js";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

vi.mock("node:fs", () => {
  const fsMock = {
    readFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readdirSync: vi.fn(),
  };
  return {
    default: fsMock,
    ...fsMock,
  };
});

vi.mock("node:os", () => ({
  default: {
    homedir: () => "C:\\Users\\operator",
  },
  homedir: () => "C:\\Users\\operator",
}));

const originalPlatform = process.platform;
const originalPath = process.env.PATH;
const originalCodexBin = process.env.CODEX_BIN;

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true,
  });
}

describe("resolveCodexCommand", () => {
  beforeEach(() => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("cache missing");
    });
    vi.mocked(fs.readdirSync).mockReturnValue([
      {
        name: "openai.chatgpt-26.715.61943-win32-x64",
        isDirectory: () => true,
      },
    ] as never);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
    process.env.PATH = "C:\\Program Files\\nodejs";
    delete process.env.CODEX_BIN;
  });

  afterEach(() => {
    setPlatform(originalPlatform);
    process.env.PATH = originalPath;
    if (originalCodexBin === undefined) {
      delete process.env.CODEX_BIN;
    } else {
      process.env.CODEX_BIN = originalCodexBin;
    }
    vi.resetAllMocks();
  });

  it("finds the VS Code bundled Codex binary on Windows when bare commands are not on PATH", () => {
    setPlatform("win32");
    vi.mocked(spawnSync).mockImplementation((command) => ({
      status: String(command).includes(".vscode\\extensions\\openai.chatgpt-")
        && String(command).endsWith("\\bin\\windows-x86_64\\codex.exe")
        ? 0
        : 1,
    }) as ReturnType<typeof spawnSync>);

    expect(resolveCodexCommand()).toBe(
      "C:\\Users\\operator\\.vscode\\extensions\\openai.chatgpt-26.715.61943-win32-x64\\bin\\windows-x86_64\\codex.exe",
    );
  });

  it("honors CODEX_BIN first on Windows", () => {
    setPlatform("win32");
    process.env.CODEX_BIN = "D:\\Tools\\codex.exe";
    vi.mocked(spawnSync).mockImplementation((command) => ({
      status: command === process.env.CODEX_BIN ? 0 : 1,
    }) as ReturnType<typeof spawnSync>);

    expect(resolveCodexCommand()).toBe("D:\\Tools\\codex.exe");
  });
});
