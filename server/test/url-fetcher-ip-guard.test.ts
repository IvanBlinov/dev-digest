import { describe, it, expect } from 'vitest';
import { blockedRange, isPublicIp } from '../src/adapters/http/ip-guard.js';

/** L03c — SSRF guard: which resolved addresses the URL fetcher may connect to. */
describe('ip-guard', () => {
  it.each([
    // IPv4 loopback 127/8
    ['127.0.0.1', 'loopback'],
    ['127.255.255.254', 'loopback'],
    // RFC 1918
    ['10.0.0.1', 'private'],
    ['10.255.255.255', 'private'],
    ['172.16.0.1', 'private'],
    ['172.31.255.255', 'private'],
    ['192.168.1.10', 'private'],
    // link-local incl. cloud metadata
    ['169.254.169.254', 'link-local'],
    ['169.254.0.1', 'link-local'],
    // CGNAT 100.64/10
    ['100.64.0.1', 'cgnat'],
    ['100.127.255.255', 'cgnat'],
    // unspecified / "this network"
    ['0.0.0.0', 'unspecified'],
    ['0.1.2.3', 'unspecified'],
    // multicast + broadcast + reserved
    ['224.0.0.1', 'multicast'],
    ['239.255.255.250', 'multicast'],
    ['255.255.255.255', 'reserved'],
    ['240.0.0.1', 'reserved'],
    ['192.0.0.8', 'reserved'],
    ['198.18.0.1', 'reserved'],
    // IPv6
    ['::1', 'loopback'],
    ['0:0:0:0:0:0:0:1', 'loopback'],
    ['::', 'unspecified'],
    ['fc00::1', 'private'],
    ['fd12:3456:789a::1', 'private'],
    ['fe80::1', 'link-local'],
    ['febf::1', 'link-local'],
    ['ff02::1', 'multicast'],
    ['FE80::ABCD', 'link-local'],
    ['fe80::1%en0', 'link-local'],
    // IPv4-mapped / -compatible / NAT64 IPv6 carrying a blocked IPv4
    ['::ffff:127.0.0.1', 'loopback'],
    ['::ffff:7f00:1', 'loopback'],
    ['::ffff:169.254.169.254', 'link-local'],
    ['::ffff:a9fe:a9fe', 'link-local'],
    ['::ffff:10.0.0.1', 'private'],
    ['0:0:0:0:0:ffff:192.168.0.1', 'private'],
    ['::127.0.0.1', 'loopback'],
    ['64:ff9b::169.254.169.254', 'link-local'],
  ])('%s is blocked (%s)', (ip, label) => {
    expect(blockedRange(ip)).toBe(label);
    expect(isPublicIp(ip)).toBe(false);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '185.199.108.133', // raw.githubusercontent.com
    '140.82.112.3',
    '172.15.255.255', // just below 172.16/12
    '172.32.0.1', // just above
    '100.63.255.255', // just below CGNAT
    '100.128.0.1', // just above
    '169.253.255.255',
    '11.0.0.1',
    '2606:4700:4700::1111',
    '2001:4860:4860::8888',
    '::ffff:8.8.8.8',
    '64:ff9b::8.8.8.8',
  ])('%s is public', (ip) => {
    expect(blockedRange(ip)).toBeNull();
    expect(isPublicIp(ip)).toBe(true);
  });

  it.each(['', 'not-an-ip', '999.1.1.1', '1.2.3', '1:2:3', 'gggg::1', '1::2::3', '::ffff:1.2.3.400'])(
    'fails closed on unparseable %j',
    (ip) => {
      expect(blockedRange(ip)).toBe('invalid');
      expect(isPublicIp(ip)).toBe(false);
    },
  );
});
