# anid-mcp

Client + **Claude Code plugin/skill** for the
[ANID file-farm MCP server](https://github.com/NienHQ/anid-impl) — share files through a
server that gates uploads behind an **on-chain agent identity** and a **gasless x402
micropayment**.

One wallet is your ANID identity, your payer, and your file owner. A bundled CLI handles
the cryptography (per-request EIP-712 auth + EIP-2612 permit) so an LLM agent — or you —
can drive it with a single command. The plugin ships a **pre-bundled, zero-install** CLI.

## Install

### Option A — `skills` CLI (any agent: Claude Code, Cursor, Cline, …)

```sh
npx skills add NienHQ/anid-mcp
```

Installs the `anid` skill into your agent. Then just ask it to "share this file" or
"upload X and give me a link."

### Option B — Claude Code plugin

```text
/plugin marketplace add NienHQ/anid-mcp
/plugin install anid@anid-mcp
```

### Option C — run the CLI directly (no agent)

```sh
npx -y github:NienHQ/anid-mcp upload ./whitepaper.pdf   # prints the public share link
npx -y github:NienHQ/anid-mcp whoami                    # server identity + tools
npx -y github:NienHQ/anid-mcp setup                     # register on-chain + fund the wallet
npx -y github:NienHQ/anid-mcp address                   # print the agent wallet address
```

`upload` prints the link on stdout and a small JSON detail blob on stderr, so it composes
in scripts:

```sh
LINK=$(npx -y github:NienHQ/anid-mcp upload ./report.pdf)
echo "shared at: $LINK"
```

Requires Node.js 18+ (and git for the `github:` form).

## How it works

1. **Identity** — a local wallet (`~/.anid/agent.key`) is registered on-chain in the ANID
   IdentityRegistry. Registration is gasless (the server relays it).
2. **Auth** — every gated call carries an EIP-712 envelope signed by the wallet, binding the
   tool name, a hash of the arguments, a nonce, and a timestamp. The server recovers the
   signer, checks freshness/replay, and confirms the identity.
3. **Payment (x402)** — if the server requires payment, it returns a `payment_required`
   envelope with a permit context. The CLI funds the wallet from a faucet (testnet), signs
   an EIP-2612 permit, and the server settles `permit` + `transferFrom` and pays the gas —
   gasless for the agent.
4. **Upload** — the server returns a single-use presigned URL; the CLI PUTs the bytes and
   you get a public, expiring share link.

## Configuration (env)

| Env | Default | Purpose |
|---|---|---|
| `ANID_MCP_URL` | hosted ANID server | MCP endpoint |
| `ANID_KEYFILE` | `~/.anid/agent.key` | agent wallet key (keep private) |
| `ANID_RPC_URL` | a public BNB-testnet RPC | balance reads |
| `ANID_CHAIN_ID` | `97` | BNB testnet |

## Repo layout

```
skills/anid/SKILL.md                # the skill (discovered by the `skills` CLI / any agent)
.claude-plugin/marketplace.json     # Claude Code plugin marketplace catalog
plugins/anid/                       # the Claude Code plugin
  ├── .claude-plugin/plugin.json
  ├── skills/anid/SKILL.md          # skill (native plugin copy; runs the bundled CLI)
  └── cli/anid.mjs                  # pre-bundled, zero-install CLI for the plugin
bin/ , lib/                         # CLI source — what `npx github:NienHQ/anid-mcp` runs
```

## Notes

- **Testnet.** Uses BNB Smart Chain testnet and worthless test tokens (faucet-minted).
- **Public + ephemeral links.** Anyone with a share URL can fetch the file; links auto-expire.
- **Keep `~/.anid/agent.key` private** — it controls your ANID identity. It is gitignored.

MIT
