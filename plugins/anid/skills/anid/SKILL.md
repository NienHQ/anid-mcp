---
name: anid
description: Share a local file and get a public link via the ANID file-farm MCP server. Use when the user wants to upload, share, publish, or get a public/shareable link for a file on disk. A bundled CLI handles the agent wallet, on-chain ANID identity, and the gasless x402 micropayment automatically.
---

# anid — share files via the ANID MCP server

When the user wants to upload/share a file or get a public link for a local file, run the
bundled CLI. **No install needed** — dependencies are pre-bundled. Requires Node.js 18+.

## Upload a file
```sh
node "$CLAUDE_PLUGIN_ROOT/cli/anid.mjs" upload "/absolute/path/to/file"
```
The **public share link** is the only line printed to stdout; a small JSON detail blob
(slug, expiry) goes to stderr. The command automatically:
1. creates/loads an agent wallet (`~/.anid/agent.key`),
2. registers it on-chain in ANID (idempotent, gasless),
3. funds it from the testnet faucet and settles the tiny x402 fee with a signed permit
   (only if the server requires payment),
4. uploads the bytes and returns the link.

Override the MIME type when the extension is ambiguous:
```sh
node "$CLAUDE_PLUGIN_ROOT/cli/anid.mjs" upload ./report.bin --type application/pdf
```

## Other commands
```sh
node "$CLAUDE_PLUGIN_ROOT/cli/anid.mjs" whoami     # server identity + available tools
node "$CLAUDE_PLUGIN_ROOT/cli/anid.mjs" setup      # register + fund, print this agent's ANID
node "$CLAUDE_PLUGIN_ROOT/cli/anid.mjs" address    # print the agent wallet address
```

## Report back to the user
Give them the share link, and note it is **public** (anyone with the URL can fetch it) and
**ephemeral** (auto-expires, ~7 days).

## Configuration (optional env)
- `ANID_MCP_URL` — MCP endpoint (defaults to the hosted ANID server)
- `ANID_KEYFILE` — agent wallet key path (default `~/.anid/agent.key`; keep it private)
- `ANID_RPC_URL`, `ANID_CHAIN_ID` — BNB testnet read RPC + chain id
