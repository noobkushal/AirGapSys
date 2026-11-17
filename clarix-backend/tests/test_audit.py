import hashlib
import sqlite3
import threading
import unittest

from clarix.audit import GENESIS, canonical_of
from tests.helpers import Env


class AuditTests(Env):
    def add(self, n=1, **kw):
        d = dict(user="u", action="act", component="C", risk="LOW", decision="ALLOW", classification="PUBLIC", payload="p")
        d.update(kw)
        return [self.ctx.audit.append(**d) for _ in range(n)]

    def test_chain_links_and_independent_hash(self):
        a, b = self.add(2)
        self.assertEqual(a["prevHash"], GENESIS)
        self.assertEqual(b["prevHash"], a["hash"])
        rec = {k: b[k] for k in ("id", "timestamp", "user", "action", "component", "risk", "decision", "classification", "payload")}
        self.assertEqual(b["hash"], hashlib.sha256((b["prevHash"] + canonical_of(rec)).encode()).hexdigest())
        self.assertTrue(self.ctx.audit.verify()["ok"])

    def test_append_only_triggers(self):
        self.add(2)
        for sql in ("UPDATE audit_events SET action='x'", "DELETE FROM audit_events"):
            with self.assertRaises(sqlite3.DatabaseError):
                self.ctx.db.x(sql)
        self.assertEqual(self.ctx.audit.count(), 2)

    def _tamper(self, sql):
        c = self.ctx.db.conn()
        c.execute("DROP TRIGGER audit_no_update"); c.execute("DROP TRIGGER audit_no_delete")  # attacker with DB write access
        c.execute(sql)

    def test_detects_edited_field_even_when_canonical_and_hash_untouched(self):
        self.add(4)
        self._tamper("UPDATE audit_events SET decision='ALLOW', action='harmless' WHERE seq=2")
        r = self.ctx.audit.verify()
        self.assertFalse(r["ok"]); self.assertEqual(r["problems"][0]["id"], "EVT-000002")

    def test_detects_recomputed_single_row_hash(self):
        self.add(3)
        row = self.ctx.db.one("SELECT * FROM audit_events WHERE seq=2")
        rec = {k: row[k] for k in ("id", "timestamp", "user", "action", "component", "risk", "decision", "classification", "payload")}
        rec["action"] = "forged"
        canon = canonical_of(rec)
        h = hashlib.sha256((row["prev_hash"] + canon).encode()).hexdigest()
        self._tamper(f"UPDATE audit_events SET action='forged', canonical='{canon.replace(chr(39), chr(39) * 2)}', hash='{h}' WHERE seq=2")
        r = self.ctx.audit.verify()
        self.assertFalse(r["ok"])  # block 3's prev_hash no longer matches

    def test_detects_deleted_event(self):
        self.add(4)
        self._tamper("DELETE FROM audit_events WHERE seq=2")
        self.assertFalse(self.ctx.audit.verify()["ok"])

    def test_rejects_invalid_enums_and_strips_control_chars(self):
        with self.assertRaises(ValueError):
            self.add(risk="EXTREME")
        e = self.add(action="a\x00b\x1bc")[0]
        self.assertEqual(e["action"], "abc")

    def test_concurrent_appends_keep_a_single_valid_chain(self):
        ts = [threading.Thread(target=lambda: self.add(15)) for _ in range(6)]
        [t.start() for t in ts]; [t.join() for t in ts]
        r = self.ctx.audit.verify()
        self.assertTrue(r["ok"], r["problems"][:2]); self.assertEqual(r["count"], 90)


if __name__ == "__main__":
    unittest.main()
