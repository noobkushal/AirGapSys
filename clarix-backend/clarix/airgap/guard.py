"""In-process outbound network guard (defence in depth, NOT a firewall).

Patches Python's socket layer so that, inside THIS process, any attempt to connect to or resolve a
non-loopback destination raises AirGapViolation and is logged. It stops the agent, its tools and any
Python library it uses (urllib, requests, ...). It does NOT stop native extensions that call the OS
directly, other processes, or a root user. Real isolation must come from the OS firewall / network
namespace / physical disconnection: see deploy/.
"""
from __future__ import annotations

import contextvars
import errno
import ipaddress
import socket
import threading
import time
from contextlib import contextmanager
from typing import Callable

from ..netutil import is_loopback_host

RULE = "POL-001 (Air-Gap Isolation)"
_subsystem: contextvars.ContextVar[str] = contextvars.ContextVar("clarix_subsystem", default="unknown")
_PORT_LABEL = {443: "HTTPS", 80: "HTTP", 53: "DNS", 25: "SMTP", 587: "SMTP", 22: "SSH", 21: "FTP"}


class AirGapViolation(OSError):
    pass


@contextmanager
def subsystem(name: str):
    tok = _subsystem.set(name)
    try:
        yield
    finally:
        _subsystem.reset(tok)


class _State:
    installed = False
    enforce = True
    sink: Callable[[dict], None] | None = None
    originals: dict = {}
    lock = threading.Lock()


def set_sink(fn: Callable[[dict], None] | None) -> None:
    _State.sink = fn


def protocol_label(port: int, sock_type: int | None) -> str:
    if port in _PORT_LABEL:
        return _PORT_LABEL[port]
    return "UDP" if sock_type == socket.SOCK_DGRAM else "TCP"


def _report(host: str, port: int, sock_type: int | None) -> None:
    rec = {"ts": time.time(), "host": str(host)[:253], "port": int(port or 0), "protocol": protocol_label(int(port or 0), sock_type),
           "subsystem": _subsystem.get(), "rule": RULE}
    if _State.sink:
        try:
            _State.sink(rec)
        except Exception:  # logging must never mask the denial
            pass


def _deny(host: str, port: int, sock_type: int | None):
    _report(host, port, sock_type)
    raise AirGapViolation(errno.ENETUNREACH, f"Air-gap: outbound connection to {host}:{port} is denied")


def _host_ok(host) -> bool:
    if host is None or host == "" or host == b"":
        return True
    if isinstance(host, bytes):
        host = host.decode("ascii", "ignore")
    if host in ("<broadcast>", "255.255.255.255"):
        return False
    return is_loopback_host(host)


def _addr_parts(address):
    if isinstance(address, tuple) and address:
        return address[0], (address[1] if len(address) > 1 and isinstance(address[1], int) else 0)
    return None, 0  # AF_UNIX / unknown: local IPC only


def install(enforce: bool = True) -> None:
    with _State.lock:
        _State.enforce = enforce
        if _State.installed:
            return
        o = _State.originals
        o["connect"], o["connect_ex"], o["sendto"] = socket.socket.connect, socket.socket.connect_ex, socket.socket.sendto
        o["getaddrinfo"], o["gethostbyname"], o["gethostbyname_ex"] = socket.getaddrinfo, socket.gethostbyname, socket.gethostbyname_ex

        def connect(self, address):
            host, port = _addr_parts(address)
            if _State.enforce and host is not None and not _host_ok(host):
                _deny(host, port, self.type)
            return o["connect"](self, address)

        def connect_ex(self, address):
            host, port = _addr_parts(address)
            if _State.enforce and host is not None and not _host_ok(host):
                _deny(host, port, self.type)
            return o["connect_ex"](self, address)

        def sendto(self, data, *args):
            host, port = _addr_parts(args[-1] if args else None)
            if _State.enforce and host is not None and not _host_ok(host):
                _deny(host, port, self.type)
            return o["sendto"](self, data, *args)

        def getaddrinfo(host, port, *a, **kw):
            if _State.enforce and not _host_ok(host):
                _deny(host, port if isinstance(port, int) else 0, None)  # refused BEFORE any DNS query leaves
            return o["getaddrinfo"](host, port, *a, **kw)

        def gethostbyname(host):
            if _State.enforce and not _host_ok(host):
                _deny(host, 0, None)
            return o["gethostbyname"](host)

        def gethostbyname_ex(host):
            if _State.enforce and not _host_ok(host):
                _deny(host, 0, None)
            return o["gethostbyname_ex"](host)

        socket.socket.connect, socket.socket.connect_ex, socket.socket.sendto = connect, connect_ex, sendto
        socket.getaddrinfo, socket.gethostbyname, socket.gethostbyname_ex = getaddrinfo, gethostbyname, gethostbyname_ex
        _State.installed = True


def uninstall() -> None:
    """For tests only."""
    with _State.lock:
        if not _State.installed:
            return
        o = _State.originals
        socket.socket.connect, socket.socket.connect_ex, socket.socket.sendto = o["connect"], o["connect_ex"], o["sendto"]
        socket.getaddrinfo, socket.gethostbyname, socket.gethostbyname_ex = o["getaddrinfo"], o["gethostbyname"], o["gethostbyname_ex"]
        _State.installed = False


def status() -> dict:
    return {"installed": _State.installed, "enforcing": _State.installed and _State.enforce}


def probe(host: str, port: int = 443) -> dict:
    """Attempt a connection THROUGH the guard. For non-loopback targets the guard refuses before any
    packet or DNS query is sent. Returns the blocked-connection record. Loopback targets are refused as
    a probe (they are permitted by policy, so there is nothing to block)."""
    if is_loopback_host(host):
        raise ValueError("Loopback destinations are permitted by policy; nothing to block.")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    with subsystem("Operator Probe"):
        try:
            socket.create_connection((host, port), timeout=1)
        except AirGapViolation as e:
            return {"host": host, "port": port, "message": str(e)}
    raise RuntimeError("Air-gap guard is not installed: the probe would have reached the network")
