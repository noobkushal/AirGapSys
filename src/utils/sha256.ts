/**
 * SHA-256 via the browser's Web Crypto API (real hashing, computed locally).
 * Note: crypto.subtle is only available in secure contexts (https or localhost).
 */
export function isCryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle;
}

export async function sha256Hex(text: string): Promise<string> {
  if (!isCryptoAvailable()) {
    throw new Error('Web Crypto is unavailable. Serve this app from localhost or https.');
  }
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const GENESIS_HASH = '0'.repeat(64);

export interface ChainLink {
  id: string;
  payload: string;
  prevHash: string;
  hash: string;
}

/** hash = SHA-256(prevHash + payload), the linkage rule shown in the UI. */
export async function buildChain(items: { id: string; payload: string }[]): Promise<ChainLink[]> {
  const out: ChainLink[] = [];
  let prev = GENESIS_HASH;
  for (const it of items) {
    const hash = await sha256Hex(prev + it.payload);
    out.push({ id: it.id, payload: it.payload, prevHash: prev, hash });
    prev = hash;
  }
  return out;
}

export interface VerifyResult {
  id: string;
  ok: boolean;
  reason?: string;
}

/** Recomputes every hash from the (possibly edited) payloads and compares to stored values. */
export async function verifyChain(links: ChainLink[]): Promise<VerifyResult[]> {
  const res: VerifyResult[] = [];
  let prev = GENESIS_HASH;
  for (const l of links) {
    const expected = await sha256Hex(prev + l.payload);
    if (l.prevHash !== prev) res.push({ id: l.id, ok: false, reason: 'Parent hash does not match previous block' });
    else if (l.hash !== expected) res.push({ id: l.id, ok: false, reason: 'Payload no longer matches stored hash' });
    else res.push({ id: l.id, ok: true });
    prev = l.hash; // continue from the stored hash so one break is reported once
  }
  return res;
}
