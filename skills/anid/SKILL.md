---
name: anid
description: Share a local file and get a public link via the ANID file-farm MCP server. Use when the user wants to upload, share, publish, or get a public/shareable link for a file on disk. An auto-fetched CLI handles the agent wallet(s), on-chain ANID identity, and the gasless x402 micropayment automatically.
---

# anid — share files via the ANID MCP server

When the user wants to upload/share a file or get a public link for a local file, run the
ANID CLI with `npx` (it auto-fetches and caches; requires Node.js 18+ and git).

## Choose which ANID agent (identity) to use — do this first
This machine can hold several ANID agents, each its own on-chain identity. List them before
uploading:
```sh
npx -y github:NienHQ/anid-mcp agents
```
- **0 agents** → just proceed; a `default` agent is created automatically.
- **exactly 1** → just proceed; it is used automatically.
- **2 or more** → **ask the user which agent to use**, then pass `--agent <name>` to the
  command. (Running `upload`/`setup` without `--agent` when several exist fails and lists them.)

Create a new named identity when the user wants one:
```sh
npx -y github:NienHQ/anid-mcp new <name>
```

## Upload a file
```sh
npx -y github:NienHQ/anid-mcp upload "/absolute/path/to/file" [--agent <name>]
```
The **public share link** is the only line printed to stdout (a small JSON detail blob goes
to stderr). The command automatically registers the chosen agent on-chain (gasless), funds
it and settles the tiny x402 fee with a signed permit (only if the server requires payment),
then uploads and returns the link. Override the MIME type with `--type <mime>` if needed.

## Other commands
```sh
npx -y github:NienHQ/anid-mcp agents                    # list local ANID agents (identities)
npx -y github:NienHQ/anid-mcp new <name>                # create a new agent (its own identity)
npx -y github:NienHQ/anid-mcp setup [--agent <name>]    # register on-chain + fund with test tokens
npx -y github:NienHQ/anid-mcp address [--agent <name>]  # print an agent's wallet address
npx -y github:NienHQ/anid-mcp whoami                    # server identity + available tools
```

## Report back to the user
Give them the share link, and note it is **public** (anyone with the URL can fetch it) and
**ephemeral** (auto-expires, ~7 days).

## Configuration (optional env)
- `ANID_MCP_URL` — MCP endpoint (defaults to the hosted ANID server)
- `ANID_AGENT` — which agent to use (overridden by `--agent`)
- `ANID_HOME` — identity store dir (default `~/.anid`; keys live in `~/.anid/agents/`, keep private)
