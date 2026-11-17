import time
import unittest

from clarix.security.policy import ActionContext
from clarix.security.taint import TaintContext
from tests.helpers import Env


class PolicyAndTools(Env):
    def run_tool(self, tid, arg, **kw): return self.ctx.runtime.invoke(tid, arg, actor="tester", **kw)

    def test_air_gap_tools_always_blocked_and_unconfigurable(self):
        for tid, arg in (("http", "http://example.com"), ("sock", "1.2.3.4:80"), ("mail", "a@b.c")):
            r = self.run_tool(tid, arg)
            self.assertEqual((r.ok, r.decision), (False, "BLOCK"), tid)
            self.assertIn("POL-001", r.output)
        with self.assertRaises(PermissionError):
            self.ctx.tools.set_level("http", "EXECUTE")
        self.ctx.tools.set_level("http", "DISABLED")  # tightening is fine

    def test_network_tools_stay_blocked_with_every_policy_disabled(self):
        for pid in ("POL-001", "POL-002", "POL-003", "POL-004", "POL-005"):
            self.ctx.policy.set_enabled(pid, False)
        for tid in ("http", "sock", "mail"):
            r = self.run_tool(tid, "http://example.com")
            self.assertEqual((r.ok, r.decision, r.approval_id), (False, "BLOCK", None), tid)
            self.assertIn("hard-locked", r.output, "the invariant itself (not just the missing executor) must refuse")
        self.assertEqual(self.ctx.approvals.pending_count(), 0)
        sink = self.ctx.runtime.invoke("http", "http://x.y", actor="agent", sink="http_post")
        self.assertEqual(sink.decision, "BLOCK")

    def test_calculator_allowed_and_audited(self):
        r = self.run_tool("calc", "(450*1.15)/12")
        self.assertEqual((r.ok, r.output), (True, "43.125"))
        self.assertIn("Executed Calculator", self.audit_actions()[-1] if False else " ".join(self.audit_actions()))
        self.assertEqual(self.ctx.db.one("SELECT executions FROM tools WHERE id='calc'")["executions"], 1)

    def test_level_enforcement(self):
        self.ctx.tools.set_level("calc", "READ")           # calc needs EXECUTE
        self.assertEqual(self.run_tool("calc", "1+1").decision, "BLOCK")
        self.ctx.tools.set_level("calc", "DISABLED")
        self.assertEqual(self.run_tool("calc", "1+1").decision, "BLOCK")

    def test_sensitive_paths_blocked(self):
        for p in ("/etc/passwd", ".env", "../.ssh/id_rsa", "/root/x", "config/credentials"):
            r = self.run_tool("fs", p)
            self.assertEqual(r.decision, "BLOCK", p)
            self.assertIn("POL-002", r.output)

    def test_traversal_blocked_by_sandbox_even_if_policies_disabled(self):
        for pid in ("POL-001", "POL-002", "POL-003", "POL-004", "POL-005"):
            self.ctx.policy.set_enabled(pid, False)
        r = self.run_tool("fs", "../../etc/hostname")
        self.assertFalse(r.ok); self.assertIn("outside the sandbox", r.output)

    def test_taint_blocks_network_sink_with_confidential_context(self):
        t = TaintContext(); t.absorb("RETRIEVED_DATA", "financial_report.pdf", "CONFIDENTIAL")
        r = self.ctx.runtime.invoke("http", "http://example.com", actor="agent", taint=t, sink="http_post")
        self.assertEqual(r.decision, "BLOCK"); self.assertIn("POL-005", r.policies)
        self.assertTrue(t.tainted)

    def test_rag_read_of_classified_doc_requires_approval_then_grant(self):
        a = ActionContext(kind="rag_read", verb="READ", resource="fin.pdf", resource_class="CONFIDENTIAL")
        self.assertEqual(self.ctx.policy.evaluate(a).decision, "REQUIRE_APPROVAL")
        ap = self.ctx.approvals.create(action="read", tool="Local RAG", resource="fin.pdf", risk="HIGH", classification="CONFIDENTIAL", requester="agent", pending={"kind": "rag_read", "doc": "fin.pdf"})
        self.ctx.approvals.resolve(ap["id"], "APPROVED", "alice")
        self.assertEqual(self.ctx.policy.evaluate(a).decision, "ALLOW")

    def test_enforcement_counters_and_disabled_policy_is_skipped(self):
        self.run_tool("http", "http://x.y")
        n = self.ctx.db.one("SELECT enforcements FROM policies WHERE id='POL-001'")["enforcements"]
        self.assertGreaterEqual(n, 1)
        self.ctx.policy.set_enabled("POL-001", False)
        self.assertNotIn("POL-001", self.ctx.policy.evaluate(ActionContext(kind="tool_call", tool_id="http", verb="EXECUTE")).matched)

    def test_policy_view_shape(self):
        p = self.ctx.policy.view()[0]
        self.assertEqual(set(p), {"id", "priority", "name", "category", "description", "rules", "enabled", "enforcements", "lastModified"})


class Approvals(Env):
    def shell(self): return self.ctx.runtime.invoke("shell", "uname -s", actor="agent")

    def test_suspend_then_approve_resumes_the_exact_action(self):
        r = self.shell()
        self.assertEqual(r.decision, "REQUIRE_APPROVAL"); self.assertIsNotNone(r.approval_id)
        self.assertEqual(self.ctx.db.one("SELECT executions FROM tools WHERE id='shell'")["executions"], 0)
        out = self.ctx.approvals.resolve(r.approval_id, "APPROVED", "alice", "ok")
        self.assertEqual(out["status"], "APPROVED"); self.assertEqual(out["resolvedBy"], "alice")
        self.assertTrue(out["result"].startswith("OK:"))
        self.assertEqual(self.ctx.db.one("SELECT executions FROM tools WHERE id='shell'")["executions"], 1)

    def test_deny_cancels_without_executing(self):
        r = self.shell()
        out = self.ctx.approvals.resolve(r.approval_id, "DENIED", "alice")
        self.assertEqual(out["status"], "DENIED"); self.assertNotIn("result", out)
        self.assertEqual(self.ctx.db.one("SELECT executions FROM tools WHERE id='shell'")["executions"], 0)

    def test_double_resolution_conflicts(self):
        r = self.shell()
        self.ctx.approvals.resolve(r.approval_id, "DENIED", "alice")
        with self.assertRaises(Exception) as cm:
            self.ctx.approvals.resolve(r.approval_id, "APPROVED", "bob")
        self.assertEqual(cm.exception.status, 409)

    def test_expiry_auto_terminates(self):
        r = self.shell()
        self.ctx.db.x("UPDATE approvals SET expires_at=? WHERE id=?", (time.time() - 1, r.approval_id))
        self.assertEqual(self.ctx.approvals.pending_count(), 0)
        a = self.ctx.approvals.get(r.approval_id)
        self.assertEqual((a["status"], a["resolvedBy"]), ("DENIED", "system"))
        with self.assertRaises(Exception) as cm:
            self.ctx.approvals.resolve(r.approval_id, "APPROVED", "alice")
        self.assertEqual(cm.exception.status, 409)

    def test_approving_cannot_bypass_a_block_that_appeared_meanwhile(self):
        r = self.shell()
        self.ctx.tools.set_level("shell", "DISABLED")
        out = self.ctx.approvals.resolve(r.approval_id, "APPROVED", "alice")
        self.assertTrue(out["result"].startswith("FAILED"))
        self.assertEqual(self.ctx.db.one("SELECT executions FROM tools WHERE id='shell'")["executions"], 0)

    def test_requires_operator_and_valid_decision(self):
        r = self.shell()
        for dec, op in (("MAYBE", "a"), ("APPROVED", "")):
            with self.assertRaises(Exception):
                self.ctx.approvals.resolve(r.approval_id, dec, op)

    def test_every_step_is_audited_and_chain_valid(self):
        r = self.shell(); self.ctx.approvals.resolve(r.approval_id, "APPROVED", "alice")
        acts = " | ".join(self.audit_actions())
        self.assertIn("Approval requested", acts); self.assertIn("Approved AP-0001", acts)
        self.assertTrue(self.ctx.audit.verify()["ok"])


if __name__ == "__main__":
    unittest.main()
