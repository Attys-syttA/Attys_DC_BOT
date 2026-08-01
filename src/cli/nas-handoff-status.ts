import path from "node:path";
import { readPublicHandoffStore } from "../nas/handoff-store.js";

const handoffRoot = process.env.ATTYS_NAS_HANDOFF_ROOT
  ? path.resolve(process.env.ATTYS_NAS_HANDOFF_ROOT)
  : path.resolve("data", "handoff");

console.log(JSON.stringify(readPublicHandoffStore(handoffRoot), null, 2));
