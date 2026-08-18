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
    summary: "local/shared and NAS-specific BotOps runtime responsibilities are consolidated in this repo",
  },
  {
    id: "unified-nas-plan",
    label: "unified NAS/BotOps plan",
    status: "ok",
    summary: "Attys_DC_BOT is the source-of-truth; Attys_DC_BOT_NAS is reference-only and must not run a parallel BotOps runtime",
  },
  {
    id: "remote-boundary-approval",
    label: "remote boundary approval",
    status: "ok",
    summary: "operator approved NAS update and persistent worker direction; future writes/restarts/deploys remain command-gated",
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
      ? "NAS handoff may proceed under command-by-command approval gates"
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
    "approval-gated actions: NAS source/share writes, remote execution changes, deploy, rebuild, restart",
  ];
  return lines.join("\n");
}
