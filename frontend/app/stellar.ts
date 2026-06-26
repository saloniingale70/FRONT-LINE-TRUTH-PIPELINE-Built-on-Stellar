import { rpc, Networks } from "@stellar/stellar-sdk";

export const server = new rpc.Server("https://soroban-testnet.stellar.org");
export const NETWORK_PASSPHRASE = Networks.TESTNET;

export function hexToBytes32(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "").padStart(64, "0").slice(-64);
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

export function textToBytes32(text: string): Uint8Array {
  const bytes = new Uint8Array(32);
  const encoded = new TextEncoder().encode(text).slice(0, 32);
  bytes.set(encoded);
  return bytes;
}