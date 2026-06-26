---
name: anid-mcp
description: Share a local file and get a public link via the ANID file-farm MCP server. Use when the user wants to upload, share, or get a shareable/public link for a file on disk. Handles the agent wallet, on-chain ANID identity, and the tiny gasless x402 payment automatically via a bundled CLI.
---

# anid-mcp — share files via the ANID MCP server

The ANID MCP server gates file uploads behind an on-chain agent identity and a tiny
x402 micropayment. Signing (EIP-712 auth + EIP-2612 permit) can't be done by hand, so
this skill bundles a CLI that handles the wallet, identity, payment, and upload. You just
run it.

## When to use
- The user asks to **upload / share / publish a file** or get a **public link** for a
  local file.

## Setup (first run only)
From the skill directory:
```sh
npm install
```
This installs the two dependencies (`viem`, `@modelcontextprotocol/sdk`). A wallet is
created automatically on first use and saved to `~/.anid/agent.key` (configurable with
`ANID_KEYFILE`).

## Upload a file
```sh
node bin/anid.mjs upload "/path/to/file.pdf"
```
This prints the **public share link** to stdout (the only stdout line). It:
1. ensures the agent is registered on-chain (idempotent),
2. funds the wallet from the testnet faucet and settles the x402 fee with a signed permit
   (only if the server requires payment),
3. uploads the bytes and returns the link.

Override the MIME type with `--type` if needed:
```sh
node bin/anid.mjs upload ./report.bin --type application/pdf
```

## Other commands
```sh
node bin/anid.mjs whoami     # server identity + available tools
node bin/anid.mjs setup      # register + fund, print this agent's ANID
node bin/anid.mjs address    # print the agent wallet address
```

## Report back to the user
Give them the share link, and mention it is **public** (anyone with the URL can fetch it),
**ephemeral** (auto-expires, ~7 days), and currently served over plain HTTP.

## Configuration (env)
- `ANID_MCP_URL` — the MCP endpoint (defaults to the hosted ANID server).
- `ANID_KEYFILE` — where the agent wallet key is stored.
- `ANID_RPC_URL`, `ANID_CHAIN_ID` — BNB testnet read RPC + chain id.
