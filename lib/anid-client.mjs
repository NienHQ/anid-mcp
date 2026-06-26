// ANID MCP client — wallet, per-request EIP-712 auth, x402 EIP-2612 permit, and the
// MCP tool calls. Everything an agent needs to drive the ANID file-farm server.
import { privateKeyToAccount } from "viem/accounts";
import { keccak256, toHex, getAddress, createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";
import { randomBytes } from "node:crypto";
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname } from "node:path";
import { homedir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const ANID_HOME = process.env.ANID_HOME ?? `${homedir()}/.anid`;
export const config = {
  MCP_URL: process.env.ANID_MCP_URL ?? "https://mcp.nien.ai/mcp",
  RPC_URL: process.env.ANID_RPC_URL ?? "https://bsc-testnet.publicnode.com",
  CHAIN_ID: Number(process.env.ANID_CHAIN_ID ?? 97),
  HOME: ANID_HOME,
  AGENTS_DIR: `${ANID_HOME}/agents`,
  // Legacy single-key location (pre-multi-agent installs); treated as agent "default".
  KEYFILE: process.env.ANID_KEYFILE ?? `${ANID_HOME}/agent.key`,
};

// EIP-712 request descriptor — must match the server's auth scheme exactly.
const EIP712_DOMAIN = { name: "anid-mcp", version: "1", chainId: config.CHAIN_ID };
const REQUEST_TYPES = {
  Request: [
    { name: "tool", type: "string" },
    { name: "argsHash", type: "bytes32" },
    { name: "address", type: "address" },
    { name: "nonce", type: "string" },
    { name: "issuedAt", type: "uint256" },
  ],
};

// Deterministic JSON (recursively key-sorted) so client + server hash identically.
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.keys(v)
      .sort()
      .reduce((a, k) => ((a[k] = sortKeys(v[k])), a), {});
  }
  return v;
}
const argsHash = (args) => keccak256(toHex(JSON.stringify(sortKeys(args))));

// --- Multi-identity store ------------------------------------------------------
// Each ANID agent is its own key at ~/.anid/agents/<name>.key, so one machine can
// hold many on-chain identities. A pre-existing ~/.anid/agent.key is honored as
// the agent named "default" (back-compat).

/** anid: id for an address (no chain read; lowercased per spec). */
export const toAnid = (address) => `anid:bnb:${address.toLowerCase()}`;

function accountFromFile(keyfile) {
  return privateKeyToAccount(readFileSync(keyfile, "utf8").trim());
}

function writeKey(keyfile) {
  mkdirSync(dirname(keyfile), { recursive: true });
  const pk = "0x" + Buffer.from(randomBytes(32)).toString("hex");
  writeFileSync(keyfile, pk, { mode: 0o600 });
  return privateKeyToAccount(pk);
}

/** List local ANID agents: [{ name, address, anid, keyfile, legacy? }]. */
export function listAgents() {
  const agents = [];
  if (existsSync(config.AGENTS_DIR)) {
    for (const f of readdirSync(config.AGENTS_DIR).sort()) {
      if (!f.endsWith(".key")) continue;
      const keyfile = `${config.AGENTS_DIR}/${f}`;
      const { address } = accountFromFile(keyfile);
      agents.push({ name: f.slice(0, -4), address, anid: toAnid(address), keyfile });
    }
  }
  if (existsSync(config.KEYFILE) && !agents.some((a) => a.name === "default")) {
    const { address } = accountFromFile(config.KEYFILE);
    agents.push({ name: "default", address, anid: toAnid(address), keyfile: config.KEYFILE, legacy: true });
  }
  return agents;
}

/** Create a new named agent (fresh key). Throws if the name already exists. */
export function createAgent(name) {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error(`invalid agent name '${name}' (use letters, digits, . _ -)`);
  const keyfile = `${config.AGENTS_DIR}/${name}.key`;
  if (existsSync(keyfile)) throw new Error(`agent '${name}' already exists`);
  const account = writeKey(keyfile);
  return { account, name, address: account.address, anid: toAnid(account.address), keyfile };
}

/**
 * Resolve which agent to act as:
 *  - explicit name (`{agent}` / ANID_AGENT): use it, creating it if it doesn't exist;
 *  - else exactly one local agent: use it;
 *  - else none: create "default";
 *  - else multiple: throw (code AMBIGUOUS_AGENT) so the caller can ask the user.
 */
export function resolveAccount({ agent } = {}) {
  const sel = agent ?? process.env.ANID_AGENT;
  if (sel) {
    const keyfile = `${config.AGENTS_DIR}/${sel}.key`;
    if (existsSync(keyfile)) return { account: accountFromFile(keyfile), name: sel };
    if (sel === "default" && existsSync(config.KEYFILE)) return { account: accountFromFile(config.KEYFILE), name: "default" };
    const created = createAgent(sel);
    return { account: created.account, name: sel, created: true };
  }
  const agents = listAgents();
  if (agents.length === 1) return { account: accountFromFile(agents[0].keyfile), name: agents[0].name };
  if (agents.length === 0) {
    const created = createAgent("default");
    return { account: created.account, name: "default", created: true };
  }
  const e = new Error(
    "multiple local ANID agents — choose one with --agent <name>:\n" +
      agents.map((a) => `  ${a.name}  ${a.anid}`).join("\n"),
  );
  e.code = "AMBIGUOUS_AGENT";
  throw e;
}

export async function connect() {
  const c = new Client({ name: "anid-mcp-skill", version: "0.1.0" });
  await c.connect(new StreamableHTTPClientTransport(new URL(config.MCP_URL)));
  return c;
}

const parse = (r) => {
  const t = r?.content?.[0]?.text ?? "";
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
};

async function makeAuth(account, tool, args) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const nonce = "0x" + Buffer.from(randomBytes(16)).toString("hex");
  const signature = await account.signTypedData({
    domain: EIP712_DOMAIN,
    types: REQUEST_TYPES,
    primaryType: "Request",
    message: { tool, argsHash: argsHash(args), address: getAddress(account.address), nonce, issuedAt: BigInt(issuedAt) },
  });
  return { address: account.address, nonce, issuedAt, signature };
}

async function callFree(c, tool, args = {}) {
  return parse(await c.callTool({ name: tool, arguments: args }, undefined, { timeout: 30000 }));
}

async function callAuthed(c, account, tool, args) {
  const auth = await makeAuth(account, tool, args);
  const res = await c.callTool({ name: tool, arguments: { ...args, auth } }, undefined, { timeout: 120000 });
  return { data: parse(res), isError: res.isError === true };
}

export const whoami = (c) => callFree(c, "whoami");

export async function register(c, account) {
  const r = await callAuthed(c, account, "register", {});
  if (r.isError) throw new Error("register failed: " + JSON.stringify(r.data));
  return r.data; // { registered | already_registered, anid, agent_id, ... }
}

export async function airdrop(c, account, amount = 1) {
  const r = await callAuthed(c, account, "airdrop_test_tokens", { amount });
  if (r.isError) throw new Error("airdrop failed: " + JSON.stringify(r.data));
  return r.data; // { balance, symbol, ... }
}

async function balanceOf(token, owner) {
  const pub = createPublicClient({ chain: bscTestnet, transport: http(config.RPC_URL) });
  return pub.readContract({
    address: getAddress(token),
    abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] }],
    functionName: "balanceOf",
    args: [getAddress(owner)],
  });
}

async function signPermit(account, ex) {
  return account.signTypedData({
    domain: { name: ex.name, version: ex.version, chainId: ex.chainId, verifyingContract: getAddress(ex.verifyingContract) },
    types: {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Permit",
    message: {
      owner: getAddress(account.address),
      spender: getAddress(ex.spender),
      value: BigInt(ex.value),
      nonce: BigInt(ex.nonce),
      deadline: BigInt(ex.deadline),
    },
  });
}

/**
 * Upload a file and return the share ticket ({ share_url, upload_url, slug, ... }).
 * Handles the x402 flow: if the server asks for payment, sign an EIP-2612 permit
 * (funding the wallet from the faucet first if needed) and retry.
 */
export async function uploadFile(c, account, { path, filename, contentType }) {
  const bytes = readFileSync(path);
  const meta = { filename, content_type: contentType, size: bytes.length };

  let r = await callAuthed(c, account, "request_upload", meta);
  if (r.data?.status === "payment_required") {
    const ex = r.data.accepts?.[0]?.extra;
    if (!ex) throw new Error("payment required but server sent no permit context (extra)");
    let needFunds = true;
    try {
      needFunds = (await balanceOf(ex.verifyingContract, account.address)) < BigInt(ex.value);
    } catch {
      /* RPC read failed — just top up */
    }
    if (needFunds) await airdrop(c, account, 1);
    const signature = await signPermit(account, ex);
    const payment = Buffer.from(JSON.stringify({ owner: account.address, value: ex.value, deadline: ex.deadline, signature })).toString("base64");
    r = await callAuthed(c, account, "request_upload", { ...meta, payment });
  }

  if (r.isError || !r.data?.upload_url) throw new Error("request_upload failed: " + JSON.stringify(r.data));

  const put = await fetch(r.data.upload_url, { method: "PUT", headers: { "content-type": contentType }, body: bytes });
  if (put.status !== 201 && put.status !== 200) throw new Error(`upload PUT ${put.status}: ${await put.text()}`);
  return r.data;
}
