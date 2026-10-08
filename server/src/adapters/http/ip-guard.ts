/**
 * L03c — SSRF guard: classify an IP address the URL fetcher is about to connect
 * to. Pure, no I/O. Anything that is not a plain public unicast address is
 * refused, and anything we cannot parse is refused too (fail closed).
 */

export type BlockedRange =
  | 'loopback'
  | 'private'
  | 'link-local'
  | 'cgnat'
  | 'unspecified'
  | 'multicast'
  | 'reserved'
  | 'invalid';

/** [network, prefix length, label] — IPv4 ranges a server-side fetch must never reach. */
const V4_BLOCKED: ReadonlyArray<readonly [string, number, BlockedRange]> = [
  ['0.0.0.0', 8, 'unspecified'], // "this network"
  ['10.0.0.0', 8, 'private'],
  ['100.64.0.0', 10, 'cgnat'],
  ['127.0.0.0', 8, 'loopback'],
  ['169.254.0.0', 16, 'link-local'], // incl. 169.254.169.254 cloud metadata
  ['172.16.0.0', 12, 'private'],
  ['192.0.0.0', 24, 'reserved'], // IETF protocol assignments
  ['192.0.2.0', 24, 'reserved'], // TEST-NET-1
  ['192.168.0.0', 16, 'private'],
  ['198.18.0.0', 15, 'reserved'], // benchmarking
  ['198.51.100.0', 24, 'reserved'], // TEST-NET-2
  ['203.0.113.0', 24, 'reserved'], // TEST-NET-3
  ['224.0.0.0', 4, 'multicast'],
  ['240.0.0.0', 4, 'reserved'], // incl. 255.255.255.255 broadcast
];

/** The label of the blocked range `ip` falls in, or null for a public address. */
export function blockedRange(ip: string): BlockedRange | null {
  const bare = ip.trim().replace(/^\[|\]$/g, '').replace(/%.*$/, ''); // brackets, zone id
  const v4 = parseIPv4(bare);
  if (v4 !== null) return classifyV4(v4);
  const v6 = parseIPv6(bare);
  if (v6 !== null) return classifyV6(v6);
  return 'invalid';
}

export function isPublicIp(ip: string): boolean {
  return blockedRange(ip) === null;
}

// ---- IPv4 -----------------------------------------------------------------

function classifyV4(addr: number): BlockedRange | null {
  for (const [net, bits, label] of V4_BLOCKED) {
    if (inV4Subnet(addr, parseIPv4(net)!, bits)) return label;
  }
  return null;
}

function inV4Subnet(addr: number, net: number, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return ((addr & mask) >>> 0) === ((net & mask) >>> 0);
}

/** Strict dotted-quad (no octal / short forms) → uint32, else null. */
function parseIPv4(s: string): number | null {
  const parts = s.split('.');
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out = out * 256 + n;
  }
  return out;
}

// ---- IPv6 -----------------------------------------------------------------

function classifyV6(h: readonly number[]): BlockedRange | null {
  const first = h[0]!;
  const zeroPrefix = h.slice(0, 5).every((x) => x === 0);
  if (zeroPrefix && h[5] === 0 && h[6] === 0) {
    if (h[7] === 0) return 'unspecified'; // ::
    if (h[7] === 1) return 'loopback'; // ::1
  }
  // IPv4-mapped (::ffff:0:0/96), IPv4-compatible (::/96) and NAT64 (64:ff9b::/96)
  // carry an IPv4 address the OS may route to — judge the embedded IPv4.
  const mapped = zeroPrefix && (h[5] === 0xffff || h[5] === 0);
  const nat64 = first === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every((x) => x === 0);
  if (mapped || nat64) return classifyV4(((h[6]! << 16) >>> 0) + h[7]!);
  if ((first & 0xfe00) === 0xfc00) return 'private'; // fc00::/7 ULA
  if ((first & 0xffc0) === 0xfe80) return 'link-local'; // fe80::/10
  if ((first & 0xffc0) === 0xfec0) return 'private'; // fec0::/10 deprecated site-local
  if ((first & 0xff00) === 0xff00) return 'multicast'; // ff00::/8
  if (first === 0x2001 && h[1] === 0x0db8) return 'reserved'; // documentation
  return null;
}

/** Parse an IPv6 literal (with `::` and an optional dotted IPv4 tail) into 8 hextets. */
function parseIPv6(s: string): number[] | null {
  if (!s.includes(':')) return null;
  let text = s.toLowerCase();
  let tail: number[] = [];
  const lastColon = text.lastIndexOf(':');
  const maybeV4 = text.slice(lastColon + 1);
  if (maybeV4.includes('.')) {
    const v4 = parseIPv4(maybeV4);
    if (v4 === null) return null;
    tail = [v4 >>> 16, v4 & 0xffff];
    text = `${text.slice(0, lastColon + 1)}0:0`; // two placeholder hextets, replaced below
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = parseHextets(halves[0]!);
  const rest = halves.length === 2 ? parseHextets(halves[1]!) : [];
  if (!head || !rest) return null;
  let groups: number[];
  if (halves.length === 2) {
    const missing = 8 - head.length - rest.length;
    if (missing < 1) return null;
    groups = [...head, ...new Array<number>(missing).fill(0), ...rest];
  } else {
    groups = head;
  }
  if (tail.length > 0) groups = [...groups.slice(0, -2), ...tail];
  return groups.length === 8 ? groups : null;
}

function parseHextets(part: string): number[] | null {
  if (part === '') return [];
  const out: number[] = [];
  for (const g of part.split(':')) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out;
}
