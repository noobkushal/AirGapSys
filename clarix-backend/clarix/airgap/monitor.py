"""Passive observation of the host's real network posture (read-only; no packets sent)."""
from __future__ import annotations

import os
import time

import psutil

from ..netutil import is_loopback_host


def outbound_connections() -> list[dict] | None:
    """Established / connecting sockets to non-loopback peers. None if the OS denies enumeration."""
    try:
        conns = psutil.net_connections(kind="inet")
    except (psutil.AccessDenied, PermissionError, OSError):
        return None
    out = []
    for c in conns:
        if not c.raddr or c.status not in ("ESTABLISHED", "SYN_SENT", "SYN_RECV", "CLOSE_WAIT", "NONE"):
            continue
        if is_loopback_host(c.raddr.ip):
            continue
        out.append({"remote": f"{c.raddr.ip}:{c.raddr.port}", "status": c.status, "pid": c.pid})
    return out


def default_route_present() -> bool | None:
    """True if the kernel has a default route (Linux). None where we cannot tell."""
    try:
        with open("/proc/net/route") as f:
            next(f, None)
            for line in f:
                parts = line.split()
                if len(parts) > 3 and parts[1] == "00000000" and int(parts[3], 16) & 0x2:
                    return True
        try:
            with open("/proc/net/ipv6_route") as f:
                for line in f:
                    p = line.split()
                    if len(p) > 9 and p[0] == "0" * 32 and p[1] == "00" and p[9] != "lo":
                        return True
        except OSError:
            pass
        return False
    except OSError:
        return None


def interfaces() -> list[dict]:
    out = []
    try:
        stats, addrs = psutil.net_if_stats(), psutil.net_if_addrs()
    except OSError:
        return out
    for name, st in stats.items():
        if name == "lo" or name.startswith("lo"):
            continue
        ips = [a.address for a in addrs.get(name, []) if a.family.name in ("AF_INET", "AF_INET6") and not is_loopback_host(a.address)]
        out.append({"name": name, "up": bool(st.isup), "addresses": ips})
    return out


def tx_bytes_nonloopback() -> int:
    try:
        return sum(c.bytes_sent for n, c in psutil.net_io_counters(pernic=True).items() if not n.startswith("lo"))
    except OSError:
        return 0


def posture(guard_status: dict) -> dict:
    conns = outbound_connections()
    route = default_route_present()
    ifs = interfaces()
    live_ifs = [i for i in ifs if i["up"] and i["addresses"]]
    reasons = []
    if route:
        reasons.append("A default route exists: this host can reach other networks.")
    if conns:
        reasons.append(f"{len(conns)} non-loopback connection(s) currently open.")
    if live_ifs and route is None:
        reasons.append("Routing table could not be read on this OS.")
    if conns is None:
        status = "UNKNOWN"
        reasons.append("Socket enumeration was denied by the OS (try running with the privileges needed).")
    elif route or conns:
        status = "NOT_ISOLATED"
    elif route is None and live_ifs:
        status = "UNKNOWN"
    else:
        status = "ISOLATED"
    return {"status": status, "outbound": len(conns) if conns is not None else None, "connections": conns or [],
            "defaultRoute": route, "interfaces": ifs, "guard": guard_status, "reasons": reasons, "checkedAt": time.time(),
            "note": "Observed from inside the host. This reports posture; the OS firewall and physical isolation enforce it."}
