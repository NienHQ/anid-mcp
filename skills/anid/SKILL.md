---
name: anid
description: Share a local file and get a public link via the ANID file-farm MCP server. Use when the user wants to upload, share, publish, or get a public/shareable link for a file on disk. An auto-fetched CLI handles the agent wallet, on-chain ANID identity, and the gasless x402 micropayment automatically.
---

# anid — share files via the ANID MCP server

When the user wants to upload/share a file or get a public link for a local file, run the
ANID CLI with `npx` (it auto-fetches and caches; requires Node.js 18+ and git):

## Upload a file
```sh
npx -y github:NienHQ/anid-mcp upload "/absolute/path/to/file"
```
The **public share link** is the only line printed to stdout (a small JSON detail blob
goes to stderr). The command automatically:
1. creates/loads an agent wallet (`~/.anid/agent.key`),
2. registers it on-chain in ANID (idempotent, gasless),
3. funds it from the testnet faucet and settles the tiny x402 fee with a signed permit
   (only if the server requires payment),
4. uploads the bytes and returns the link.

Override the MIME type when the extension is ambiguous:
```sh
npx -y github:NienHQ/anid-mcp upload ./report.bin --type application/pdf
```

## Other commands
```sh
npx -y github:NienHQ/anid-mcp whoami     # server identity + available tools
npx -y github:NienHQ/anid-mcp setup      # register on-chain + fund, print this agent's ANID
npx -y github:NienHQ/anid-mcp address    # print the agent wallet address
```

## Report back to the user
Give them the share link, and note it is **public** (anyone with the URL can fetch it) and
**ephemeral** (auto-expires, ~7 days).

## Configuration (optional env)
- `ANID_MCP_URL` — MCP endpoint (defaults to the hosted ANID server)
- `ANID_KEYFILE` — agent wallet key path (default `~/.anid/agent.key`; keep it private)
- `ANID_RPC_URL`, `ANID_CHAIN_ID` — BNB testnet read RPC + chain id
