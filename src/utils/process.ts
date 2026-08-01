export function windowsCmdInvocation(
  command: string,
  args: string[],
): { command: string; args: string[] } {
  if (process.platform !== "win32" || !/\.(cmd|bat)$/i.test(command)) {
    return { command, args };
  }

  return {
    command: "cmd.exe",
    args: ["/d", "/c", command, ...args],
  };
}
