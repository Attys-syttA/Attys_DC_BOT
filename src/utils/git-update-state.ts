export type GitUpdateState = {
  dirty: boolean;
  ahead: number;
  behind: number;
};

export type SafeUpdateDecision = {
  canSafeUpdate: boolean;
  status: "clean" | "dirty" | "behind" | "ahead" | "diverged";
  detail: string;
};

export function parseAheadBehind(value: string): { ahead: number; behind: number } | null {
  const parts = value.trim().split(/\s+/);
  if (parts.length !== 2) return null;

  const ahead = Number.parseInt(parts[0] ?? "", 10);
  const behind = Number.parseInt(parts[1] ?? "", 10);
  if (!Number.isInteger(ahead) || !Number.isInteger(behind) || ahead < 0 || behind < 0) {
    return null;
  }

  return { ahead, behind };
}

export function decideSafeUpdate(state: GitUpdateState): SafeUpdateDecision {
  if (state.dirty) {
    return {
      canSafeUpdate: false,
      status: "dirty",
      detail: "local changes present; safe update is disabled",
    };
  }

  if (state.ahead > 0 && state.behind > 0) {
    return {
      canSafeUpdate: false,
      status: "diverged",
      detail: `ahead ${state.ahead} / behind ${state.behind}; manual review required`,
    };
  }

  if (state.ahead > 0) {
    return {
      canSafeUpdate: false,
      status: "ahead",
      detail: `ahead ${state.ahead}; push or review before updating`,
    };
  }

  if (state.behind > 0) {
    return {
      canSafeUpdate: true,
      status: "behind",
      detail: `behind ${state.behind}; fast-forward safe update is allowed`,
    };
  }

  return {
    canSafeUpdate: false,
    status: "clean",
    detail: "clean and synced; no update available",
  };
}
