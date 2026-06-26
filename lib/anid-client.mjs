// ANID MCP client — wallet, per-request EIP-712 auth, x402 EIP-2612 permit, and the
// MCP tool calls. Everything an agent needs to drive the ANID file-farm server.
import { privateKeyToAccount } from "viem/accounts";
import { keccak256, toHex, getAddress, createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";
import { randomBytes } from "node:crypto";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { homedir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export const config = {
  MCP_URL: process.env.ANID_MCP_URL ?? "http://5.223.48.16:8080/mcp",
  RPC_URL: process.env.ANID_RPC_URL ?? "https://bsc-testnet.publicnode.com",
  CHAIN_ID: Number(process.env.ANID_CHAIN_ID ?? 97),
  KEYFILE: process.env.ANID_KEYFILE ?? `${homedir()}/.anid/agent.key`,
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

/** Load the agent wallet, creating + persisting a fresh key on first use. */
export function loadAccount() {
  let pk;
  if (existsSync(config.KEYFILE)) {
    pk = readFileSync(config.KEYFILE, "utf8").trim();
  } else {
    pk = "0x" + Buffer.from(randomBytes(32)).toString("hex");
    mkdirSync(dirname(config.KEYFILE), { recursive: true });
    writeFileSync(config.KEYFILE, pk, { mode: 0o600 });
  }
  return privateKeyToAccount(pk);
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
