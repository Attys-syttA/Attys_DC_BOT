export type NasHandoffGateCriterionStatus = "ok" | "blocked";

export interface NasHandoffGateCriterion {
  id: string;
  label: string;
  status: NasHandoffGateCriterionStatus;
  summary: string;
}

export interface NasHandoffGateReport {
  status: "ready" | "blocked";
  criteria: NasHandoffGateCriterion[];
  nextAction: string;
}

export const DEFAULT_NAS_HANDOFF_GATE_CRITERIA: NasHandoffGateCriterion[] = [
  {
    id: "local-audit-foundation",
    label: "local read-only audit",
    status: "ok",
    summary: "fixed named checks, job/step store, stop, review, and bounded recheck are implemented",
  },
  {
    id: "repair-acceptance",
    label: "isolated repair acceptance",
    status: "ok",
    summary: "synthetic acceptance covers isolated repair execution, manual review marker, recheck, and cleanup retention",
  },
  {
    id: "job-step-contract",
    label: "job/step contract",
    status: "ok",
    summary: "audit-job-step-contract/v1 and audit-repair-contract/v2 are explicit",
  },
  {
    id: "source-publication",
    label: "source publication checkpoint",
    status: "ok",
    summary: "local audit handoff gate changes have a source publication checkpoint before NAS architecture work",
  },
  {
    id: "security-review",
    label: "security boundary review",
    status: "ok",
    summary: "auth, path, command, secret, and log boundaries are reviewed in docs/NAS_HANDOFF_SECURITY_BOUNDARY_REVIEW.md",
  },
  {
    id: "nas-scope-split",
    label: "shared vs NAS-specific split",
    status: "ok",
    summary: "local/shared responsibilities stay in this repo; NAS-specific implementation needs its own repo plan",
  },
  {
    id: "nas-repo-plan",
    label: "NAS repository plan",
    status: "ok",
    summary: "Attys_DC_BOT_NAS has its own AGENTS, STATE, active BotOps plan, and published control-plane baseline",
  },
  {
    id: "remote-boundary-approval",
    label: "remote boundary approval",
    status: "blocked",
    summary: "multi-machine execution boundary change requires explicit operator approval",
  },
];

export function evaluateNasHandoffGate(
  criteria: NasHandoffGateCriterion[] = DEFAULT_NAS_HANDOFF_GATE_CRITERIA,
): NasHandoffGateReport {
  const blocked = criteria.filter((criterion) => criterion.status !== "ok");
  return {
    status: blocked.length === 0 ? "ready" : "blocked",
    criteria: criteria.map((criterion) => ({ ...criterion })),
    nextAction: blocked.length === 0
      ? "NAS handoff may proceed to the dedicated architecture plan"
      : `resolve ${blocked[0].label}`,
  };
}

export function renderNasHandoffGateReport(report = evaluateNasHandoffGate()): string {
  const lines = [
    "NAS handoff gate",
    `status: ${report.status}`,
    `next: ${report.nextAction}`,
    "",
    "criteria:",
    ...report.criteria.map((criterion) =>
      `- ${criterion.status.toUpperCase()} ${criterion.label}: ${criterion.summary}`
    ),
    "",
    "blocked actions: NAS repo source writes, remote execution architecture changes, deploy",
  ];
  return lines.join("\n");
}
