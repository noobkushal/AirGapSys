"""Loopback checks that never touch DNS (a DNS lookup would itself be egress)."""
import ipaddress


def is_loopback_host(host: str) -> bool:
    if not host:
        return False
    h = host.strip().strip("[]").lower()
    if h == "localhost":
        return True
    try:
        return ipaddress.ip_address(h.split("%")[0]).is_loopback
    except ValueError:
        return False  # any other hostname would require DNS: not permitted
