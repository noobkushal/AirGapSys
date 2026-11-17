import errno
import socket
import threading
import unittest
import urllib.request

from clarix.airgap import guard, monitor
from clarix.netutil import is_loopback_host
from tests.helpers import Env


class Guard(Env):
    def test_loopback_helper_never_resolves_dns(self):
        for h in ("127.0.0.1", "::1", "[::1]", "localhost", "127.5.5.5"):
            self.assertTrue(is_loopback_host(h), h)
        for h in ("example.com", "8.8.8.8", "10.0.0.1", "0.0.0.0", "", "localhost.evil.com", "127.0.0.1.evil.com"):
            self.assertFalse(is_loopback_host(h), h)

    def test_blocks_ip_and_name_before_any_packet_and_logs(self):
        for target in (("8.8.8.8", 53), ("example.com", 443), ("1.1.1.1", 80), ("2606:4700:4700::1111", 443)):
            with self.assertRaises(guard.AirGapViolation) as cm:
                socket.create_connection(target, timeout=1)
            self.assertEqual(cm.exception.errno, errno.ENETUNREACH)
        rows = self.ctx.db.q("SELECT host, rule FROM blocked_connections")
        self.assertEqual(len(rows), 4); self.assertTrue(all(r["rule"].startswith("POL-001") for r in rows))
        self.assertIn("Blocked outbound", " ".join(self.audit_actions()))

    def test_dns_resolution_is_refused(self):
        for fn in (lambda: socket.getaddrinfo("api.openai.com", 443), lambda: socket.gethostbyname("google.com")):
            with self.assertRaises(guard.AirGapViolation):
                fn()

    def test_udp_sendto_blocked(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            with self.assertRaises(guard.AirGapViolation):
                s.sendto(b"x", ("8.8.8.8", 53))
        finally:
            s.close()

    def test_library_http_client_is_blocked_too(self):
        with self.assertRaises(Exception) as cm:
            urllib.request.urlopen("http://example.com/", timeout=2)
        self.assertIn("Air-gap", str(cm.exception))

    def test_loopback_still_works(self):
        srv = socket.socket(); srv.bind(("127.0.0.1", 0)); srv.listen(1)
        t = threading.Thread(target=lambda: srv.accept()[0].close(), daemon=True); t.start()
        socket.create_connection(("127.0.0.1", srv.getsockname()[1]), timeout=2).close(); t.join(2); srv.close()
        with urllib.request.urlopen(self.fake.url + "/api/version", timeout=2) as r:
            self.assertEqual(r.status, 200)

    def test_probe_logs_and_rejects_loopback(self):
        r = guard.probe("api.openai.com", 443)
        self.assertIn("denied", r["message"])
        self.assertEqual(self.ctx.db.one("SELECT subsystem FROM blocked_connections ORDER BY id DESC LIMIT 1")["subsystem"], "Operator Probe")
        with self.assertRaises(ValueError):
            guard.probe("127.0.0.1")

    def test_enforcement_can_be_switched_off_only_by_config_not_api(self):
        guard.install(enforce=False)
        try:
            self.assertFalse(guard.status()["enforcing"])
        finally:
            guard.install(enforce=True)
        self.assertTrue(guard.status()["enforcing"])


class Monitor(Env):
    def test_posture_reports_measurements_not_assumptions(self):
        p = monitor.posture(guard.status())
        self.assertIn(p["status"], ("ISOLATED", "NOT_ISOLATED", "UNKNOWN"))
        self.assertIn("reasons", p); self.assertIn("note", p)
        if p["defaultRoute"]:
            self.assertEqual(p["status"], "NOT_ISOLATED")

    def test_egress_series_shape(self):
        self.ctx.telemetry.sample()
        s = self.ctx.telemetry.egress_series()
        self.assertTrue(s and set(s[0]) == {"t", "egress", "blocked"})


if __name__ == "__main__":
    unittest.main()
