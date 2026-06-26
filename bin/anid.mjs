#!/usr/bin/env node
// anid — CLI for the ANID file-farm MCP server (used by the skill, or directly).
import { basename, extname } from "node:path";
import { loadAccount, connect, whoami, register, airdrop, uploadFile, config } from "../lib/anid-client.mjs";

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
  anid address                          print this agent's wallet address
  anid whoami                           server identity + available tools
  anid setup [amount]                   register on-chain + fund with test tokens (default 1)
  anid upload <file> [--type <mime>]    upload a file; prints the public share link

Env:
  ANID_MCP_URL   MCP endpoint   (default ${config.MCP_URL})
  ANID_KEYFILE   wallet key     (default ${config.KEYFILE})
  ANID_RPC_URL   read RPC       (default ${config.RPC_URL})`);
}

const [cmd, ...rest] = process.argv.slice(2);

async function main() {
  const account = loadAccount();

  if (cmd === "address") return void console.log(account.address);

  if (cmd === "whoami") {
    const c = await connect();
    console.log(JSON.stringify(await whoami(c), null, 2));
    return void (await c.close());
  }

  if (cmd === "setup") {
    const c = await connect();
    const reg = await register(c, account);
    const fund = await airdrop(c, account, Number(rest[0] ?? 1));
    console.log(JSON.stringify(
      { address: account.address, anid: reg.anid, registered: Boolean(reg.registered), already_registered: Boolean(reg.already_registered), balance: fund.balance, symbol: fund.symbol },
      null, 2,
    ));
    return void (await c.close());
  }

  if (cmd === "upload") {
    const ti = rest.indexOf("--type");
    const type = ti >= 0 ? rest[ti + 1] : undefined;
    const path = rest.find((a, i) => !a.startsWith("--") && (ti < 0 || i !== ti + 1));
    if (!path) { usage(); process.exit(1); }
    const c = await connect();
    await register(c, account); // idempotent — no-op if already registered
    const out = await uploadFile(c, account, { path, filename: basename(path), contentType: type ?? guessType(path) });
    await c.close();
    // The share link is the primary output (stdout); details go to stderr.
    console.log(out.share_url);
    console.error(JSON.stringify({ slug: out.slug, size: out.size ?? null, expires_at: out.expires_at ?? null }, null, 2));
    return;
  }

  usage();
  process.exit(cmd ? 1 : 0);
}

main().catch((e) => {
  console.error("error:", e?.message ?? e);
  process.exit(1);
});
