#!/usr/bin/env node
import { readFile } from "node:fs/promises";

function parseArgv(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const match = /^--([a-z-]+)$/.exec(argv[i]);
    if (match) {
      out[match[1]] = argv[++i];
      continue;
    }
    const eq = /^--([a-z-]+)=(.*)$/.exec(argv[i]);
    if (eq) out[eq[1]] = eq[2];
  }
  if (!out.input) throw new Error("Missing --input=<npm audit json path>");
  if (!out.allowlist) throw new Error("Missing --allowlist=<allowlist json path>");
  return out;
}

function canonicalId(pkg, item) {
  const ghsa = /GHSA-[0-9a-z-]+/i.exec(item?.url ?? "")?.[0];
  return ghsa ?? pkg;
}

const opts = parseArgv(process.argv.slice(2));
const [audit, allowlist] = await Promise.all([
  readFile(opts.input, "utf8").then((s) => JSON.parse(s)),
  readFile(opts.allowlist, "utf8").then((s) => JSON.parse(s).advisories ?? {}),
]);

if (audit?.error) {
  console.error(`::error title=Dependency audit::npm audit failed (${audit.error.code ?? "unknown"}): ${audit.error.summary ?? "no summary"}`);
  process.exit(1);
}

const findings = [];
for (const [pkg, vuln] of Object.entries(audit.vulnerabilities ?? {})) {
  const severity = vuln.severity;
  if (severity !== "high" && severity !== "critical") continue;

  const via = Array.isArray(vuln.via) ? vuln.via : [];
  const items = via.filter((i) => typeof i === "object" && i !== null);
  if (items.length === 0) {
    findings.push({
      pkg,
      id: canonicalId(pkg, {}),
      severity,
      title: vuln.title ?? pkg,
      range: vuln.range ?? "",
      fixAvailable: vuln.fixAvailable,
    });
    continue;
  }
  for (const item of items) {
    const itemSeverity = item.severity ?? severity;
    if (itemSeverity !== "high" && itemSeverity !== "critical") continue;
    findings.push({
      pkg,
      id: canonicalId(pkg, item),
      severity: itemSeverity,
      title: item.title ?? vuln.title ?? pkg,
      range: item.range ?? "",
      fixAvailable: vuln.fixAvailable,
    });
  }
}

const seen = new Set();
const unique = findings.filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)));
const blocked = unique.filter((f) => !(f.id in allowlist));
const accepted = unique.filter((f) => f.id in allowlist);

for (const f of accepted) {
  console.log(`::notice title=Dependency audit::advisory ${f.id} (${f.pkg}, ${f.severity}) covered by allowlist: ${allowlist[f.id]}`);
}

if (blocked.length > 0) {
  console.error(`::error title=Dependency audit::${blocked.length} high/critical finding(s) are not allowlisted`);
  for (const f of blocked) {
    const fix = f.fixAvailable ? ` (fix available: ${JSON.stringify(f.fixAvailable)})` : " (no fix available)";
    console.error(`${f.id} ${f.severity} ${f.pkg} ${f.range} - ${f.title}${fix}`);
  }
  process.exit(1);
}

console.log(`dependency audit ok: ${accepted.length} allowlisted, 0 unblocked high/critical`);