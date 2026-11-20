// The LAN address phones scan in the QR code, on whatever machine Couchcade runs on.
//
// A laptop can have a dozen IPv4 addresses: Wi-Fi, Ethernet, Docker bridges, VirtualBox and
// Hyper-V adapters, WSL, Tailscale and other VPNs. Interface names differ per OS (en0, wlan0,
// "Wi-Fi", "Ethernet 2"), so a fixed list of names isn't enough. Instead:
//
//   1. HOST_IP, if set, always wins.
//   2. Ask the OS which address it would use for its default route (the one with internet
//      access), unless that is a VPN or virtual adapter. That's almost always the Wi-Fi or
//      Ethernet address the phones are on.
//   3. Otherwise rank every interface: private home ranges first, virtual adapters last.
//
// Every reasonable candidate is returned too, so the TV can offer "Wrong address? Switch".

import dgram from 'node:dgram';
import os from 'node:os';

// Never reachable from a phone: link-local (no DHCP answer) and Docker's own bridges.
// Case-sensitive on purpose: Linux names these in lower case, and /veth/i would also match
// Windows' "vEthernet (...)" adapters, which only get ranked down below.
const SKIP_NAME = /^(docker|br-|veth)/;
// Usually not the network the phones are on: VMs, WSL, VPNs and overlay networks.
const VIRTUAL_NAME = /vEthernet|Hyper-V|VirtualBox|VMware|WSL|tailscale|utun|^zt|^tun|^tap|^wg/i;
// Common names for the real Wi-Fi / Ethernet adapter, only used to break ties.
const USUAL_NAMES = ['en0', 'wlan0', 'Wi-Fi', 'en1', 'eth0', 'Ethernet'];

function ipv4(a) {
  return a.split('.').map(Number);
}

/** Lower is better: 0 private LAN, 1 other, 2 probably virtual or VPN, Infinity never. */
function rank(name, address) {
  const [a, b, c] = ipv4(address);
  if (a === 169 && b === 254) return Infinity; // link-local
  if (a === 172 && b === 17) return Infinity; // Docker's default bridge
  if (SKIP_NAME.test(name)) return Infinity;
  if (VIRTUAL_NAME.test(name)) return 2;
  if (a === 100 && b >= 64 && b <= 127) return 2; // CGNAT: Tailscale and some carrier networks
  if (a === 192 && b === 168 && c === 56) return 2; // VirtualBox host-only
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 0;
  return 1;
}

/** Usable IPv4 addresses, best first: [{ address, name, rank }]. */
function interfaceCandidates() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue; // family was a number in Node 18.0-18.3
      if (a.internal) continue;
      const r = rank(name, a.address);
      if (r !== Infinity) out.push({ address: a.address, name, rank: r });
    }
  }
  const usual = (n) => (USUAL_NAMES.includes(n) ? USUAL_NAMES.indexOf(n) : USUAL_NAMES.length);
  return out.sort((x, y) => x.rank - y.rank || usual(x.name) - usual(y.name));
}

/**
 * The source address the OS picks for its default route. connect() on a UDP socket only looks
 * up the route; no packet is sent, so this works offline-but-on-Wi-Fi and costs nothing.
 * Resolves to null if there's no route (no network) or anything goes wrong.
 */
function defaultRouteAddress() {
  return new Promise((resolve) => {
    let socket;
    const done = (address) => {
      clearTimeout(timer);
      try {
        socket?.close();
      } catch {}
      resolve(address);
    };
    const timer = setTimeout(() => done(null), 500);
    try {
      socket = dgram.createSocket('udp4');
      socket.on('error', () => done(null));
      socket.connect(53, '8.8.8.8', () => {
        try {
          done(socket.address().address);
        } catch {
          done(null);
        }
      });
    } catch {
      done(null);
    }
  });
}

/**
 * { primary, candidates: [{ address, name }] }. primary is what goes in the QR code; candidates
 * are the alternatives the TV can switch to. Cheap enough to call per request, which lets a
 * reload of the TV page pick up a network change (laptop moved to another Wi-Fi).
 */
export async function joinAddresses() {
  const list = interfaceCandidates();
  const routed = await defaultRouteAddress();
  const routedEntry = list.find((c) => c.address === routed);
  // The default route can point at a VPN (full-tunnel VPN, Tailscale exit node); only trust it
  // when it lands on a normal-looking interface.
  if (routedEntry && routedEntry.rank < 2) list.unshift(...list.splice(list.indexOf(routedEntry), 1));

  if (process.env.HOST_IP) {
    const forced = process.env.HOST_IP.trim();
    const rest = list.filter((c) => c.address !== forced);
    return { primary: forced, candidates: [{ address: forced, name: 'HOST_IP' }, ...rest.map(strip)] };
  }
  return { primary: list[0]?.address ?? 'localhost', candidates: list.map(strip) };
}

function strip({ address, name }) {
  return { address, name };
}
