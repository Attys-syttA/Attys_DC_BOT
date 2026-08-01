export const AUDIT_CHECK_NAMES = [
  "plans",
  "lint",
  "typecheck",
  "tests",
  "build",
  "full",
] as const;

export type AuditCheckName = typeof AUDIT_CHECK_NAMES[number];
export type AuditCheckSupportStatus = "supported" | "unsupported";

export interface AuditCheckDefinition {
  name: Exclude<AuditCheckName, "full">;
  executable: "npm" | "npm.cmd";
  args: string[];
  timeoutMs: number;
  requiredPackageScript: string;
}

export interface AuditCheckSupport {
  name: Exclude<AuditCheckName, "full">;
  status: AuditCheckSupportStatus;
  reason: string | null;
}

const AUDIT_CHECK_DEFINITIONS: Readonly<Record<Exclude<AuditCheckName, "full">, Omit<AuditCheckDefinition, "executable">>> = {
  plans: {
    name: "plans",
    args: ["run", "plans:check"],
    timeoutMs: 60_000,
    requiredPackageScript: "plans:check",
  },
  lint: {
    name: "lint",
    args: ["run", "lint"],
    timeoutMs: 120_000,
    requiredPackageScript: "lint",
  },
  typecheck: {
    name: "typecheck",
    args: ["run", "typecheck"],
    timeoutMs: 180_000,
    requiredPackageScript: "typecheck",
  },
  tests: {
    name: "tests",
    args: ["test"],
    timeoutMs: 300_000,
    requiredPackageScript: "test",
  },
  build: {
    name: "build",
    args: ["run", "build"],
    timeoutMs: 300_000,
    requiredPackageScript: "build",
  },
};

const FULL_PIPELINE: readonly Exclude<AuditCheckName, "full">[] = [
  "plans",
  "lint",
  "typecheck",
  "tests",
  "build",
];

export function isAuditCheckName(value: string): value is AuditCheckName {
  return AUDIT_CHECK_NAMES.includes(value as AuditCheckName);
}

export function auditNpmCommand(platform = process.platform): "npm" | "npm.cmd" {
  return platform === "win32" ? "npm.cmd" : "npm";
}

export function buildAuditCheckPipeline(
  checkName: AuditCheckName,
  platform = process.platform,
): AuditCheckDefinition[] {
  const names = checkName === "full" ? FULL_PIPELINE : [checkName];
  return names.map((name) => ({
    ...AUDIT_CHECK_DEFINITIONS[name],
    executable: auditNpmCommand(platform),
  }));
}

export function checkAuditScriptSupport(
  definition: AuditCheckDefinition,
  packageScripts: Record<string, string> | undefined,
): AuditCheckSupport {
  if (!packageScripts || !Object.hasOwn(packageScripts, definition.requiredPackageScript)) {
    return {
      name: definition.name,
      status: "unsupported",
      reason: `missing package script: ${definition.requiredPackageScript}`,
    };
  }

  return {
    name: definition.name,
    status: "supported",
    reason: null,
  };
}

export function checkAuditPipelineSupport(
  checkName: AuditCheckName,
  packageScripts: Record<string, string> | undefined,
  platform = process.platform,
): AuditCheckSupport[] {
  return buildAuditCheckPipeline(checkName, platform)
    .map((definition) => checkAuditScriptSupport(definition, packageScripts));
}
