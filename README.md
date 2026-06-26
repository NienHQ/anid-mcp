# @nienhq/anid-mcp

Client + **agent skill** for the [ANID file-farm MCP server](https://github.com/NienHQ/anid-impl) —
share files through a server that gates uploads behind an **on-chain agent identity** and a
**gasless x402 micropayment**.

One wallet is your ANID identity, your payer, and your file owner. The bundled CLI handles
the cryptography (per-request EIP-712 auth + EIP-2612 permit) so an LLM agent — or you —
can drive it with a single command.

## Install

```sh
git clone https://github.com/NienHQ/anid-mcp.git
cd anid-mcp
npm install
```

## Use

```sh
# upload a file -> prints the public share link
node bin/anid.mjs upload ./whitepaper.pdf

# inspect the server
node bin/anid.mjs whoami

# register on-chain + fund the wallet with test tokens
node bin/anid.mjs setup

# show the agent wallet address
node bin/anid.mjs address
```

`upload` prints the share link on stdout and a small JSON detail blob on stderr, so it
composes cleanly in scripts:

```sh
LINK=$(node bin/anid.mjs upload ./report.pdf)
echo "shared at: $LINK"
```

## As an agent skill

`SKILL.md` describes this for agent runtimes (e.g. Claude). Drop the repo into your skills
directory; the agent reads `SKILL.md` and runs the CLI when a user asks to share a file.

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

## Configuration

| Env | Default | Purpose |
|---|---|---|
| `ANID_MCP_URL` | hosted ANID server | MCP endpoint |
| `ANID_KEYFILE` | `~/.anid/agent.key` | agent wallet key (keep private) |
| `ANID_RPC_URL` | a public BNB-testnet RPC | balance reads |
| `ANID_CHAIN_ID` | `97` | BNB testnet |

## Notes

- **Testnet.** Uses BNB Smart Chain testnet and worthless test tokens (faucet-minted).
- **Public + ephemeral links.** Anyone with a share URL can fetch the file; links auto-expire.
- **Keep `~/.anid/agent.key` private** — it controls your ANID identity. It is gitignored.

MIT
