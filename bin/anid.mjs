#!/usr/bin/env node
// anid — CLI for the ANID file-farm MCP server (used by the skill, or directly).
import { basename, extname } from "node:path";
import {
  connect, whoami, register, airdrop, uploadFile,
  listAgents, createAgent, resolveAccount, config,
} from "../lib/anid-client.mjs";

const MIME = {
  ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".txt": "text/plain",
  ".md": "text/markdown", ".html": "text/html", ".json": "application/json", ".csv": "text/csv",
  ".zip": "application/zip", ".epub": "application/epub+zip", ".mp4": "video/mp4", ".mp3": "audio/mpeg",
};
const guessType = (p) => MIME[extname(p).toLowerCase()] ?? "application/octet-stream";

function usage() {
  console.error(`anid — share files via the ANID MCP server

Usage:
  anid agents                              list local ANID agents (identities)
  anid new <name>                          create a new ANID agent (its own wallet/identity)
  anid setup [amount] [--agent <name>]     register on-chain + fund with test tokens
  anid upload <file> [--type <mime>] [--agent <name>]   upload a file; prints the public link
  anid address [--agent <name>]            print an agent's wallet address
  anid whoami                              server identity + available tools

Agent selection: pass --agent <name> (or set ANID_AGENT). With one local agent it's used
automatically; with none, a "default" agent is created; with several, you must choose one.

Env:
  ANID_MCP_URL   MCP endpoint   (default ${config.MCP_URL})
  ANID_AGENT     agent to use   (overridden by --agent)
  ANID_HOME      identity store (default ${config.HOME})`);
}

// --- arg parsing ---
const argv = process.argv.slice(2);
const cmd = argv[0];
const rest = argv.slice(1);
const VALUE_FLAGS = new Set(["--agent", "--type"]);
const flag = (name) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};
const positionals = [];
for (let i = 0; i < rest.length; i++) {
  if (VALUE_FLAGS.has(rest[i])) { i++; continue; }
  if (rest[i].startsWith("--")) continue;
  positionals.push(rest[i]);
}
const agentName = flag("--agent");

async function main() {
  if (cmd === "agents") {
    const list = listAgents();
    if (!list.length) return void console.log("(no local ANID agents yet — one is created on first use)");
    for (const a of list) console.log(`${a.name}\t${a.anid}${a.legacy ? "  (legacy)" : ""}`);
    return;
  }

  if (cmd === "new") {
    const name = positionals[0];
    if (!name) { console.error("usage: anid new <name>"); process.exit(1); }
    const a = createAgent(name);
    return void console.log(JSON.stringify({ created: a.name, address: a.address, anid: a.anid }, null, 2));
  }

  if (cmd === "whoami") {
    const c = await connect();
    console.log(JSON.stringify(await whoami(c), null, 2));
    return void (await c.close());
  }

  if (cmd === "address") {
    const { account, name } = resolveAccount({ agent: agentName });
    return void console.log(`${account.address}  (${name})`);
  }

  if (cmd === "setup") {
    const { account, name } = resolveAccount({ agent: agentName });
    const c = await connect();
    const reg = await register(c, account);
    const fund = await airdrop(c, account, Number(positionals[0] ?? 1));
    console.log(JSON.stringify(
      { agent: name, address: account.address, anid: reg.anid, registered: Boolean(reg.registered), already_registered: Boolean(reg.already_registered), balance: fund.balance },
      null, 2,
    ));
    return void (await c.close());
  }

  if (cmd === "upload") {
    const path = positionals[0];
    if (!path) { usage(); process.exit(1); }
    const { account, name } = resolveAccount({ agent: agentName });
    const c = await connect();
    await register(c, account); // idempotent
    const out = await uploadFile(c, account, { path, filename: basename(path), contentType: flag("--type") ?? guessType(path) });
    await c.close();
    console.log(out.share_url); // primary output
    console.error(JSON.stringify({ agent: name, slug: out.slug, expires_at: out.expires_at ?? null }, null, 2));
    return;
  }

  usage();
  process.exit(cmd ? 1 : 0);
}

main().catch((e) => {
  if (e?.code === "AMBIGUOUS_AGENT") {
    console.error(e.message);
    process.exit(2);
  }
  console.error("error:", e?.message ?? e);
  process.exit(1);
});
