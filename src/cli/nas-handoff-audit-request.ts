import path from "node:path";
import { createAuditRequestHandoff } from "../nas/audit-handoff.js";
import { writeHandoffEnvelope } from "../nas/handoff-store.js";

function optionValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

const checkName = optionValue("check") ?? "plans";
const projectLabel = optionValue("project") ?? "Attys_DC_BOT";
const requestId = optionValue("id");
const handoffRoot = process.env.ATTYS_NAS_HANDOFF_ROOT
  ? path.resolve(process.env.ATTYS_NAS_HANDOFF_ROOT)
  : path.resolve("data", "handoff");

const envelope = createAuditRequestHandoff({
  requestId,
  projectLabel,
  checkName,
});
writeHandoffEnvelope(handoffRoot, "inbox", envelope);

console.log(JSON.stringify({
  wrote: true,
  box: "inbox",
  id: envelope.id,
  type: envelope.type,
  status: envelope.status,
}, null, 2));
