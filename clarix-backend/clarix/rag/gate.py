"""Policy-gated retrieval used by both the agent and the rag_search tool."""
from __future__ import annotations

from ..security import injection
from ..security.policy import ActionContext
from ..security.taint import TaintContext


class RagGate:
    def __init__(self, ctx):
        self.ctx = ctx

    def retrieve(self, query: str, taint: TaintContext, actor: str, k: int = 4) -> dict:
        ctx = self.ctx
        allowed, withheld, approval_ids, quarantined = [], {}, [], 0
        cands = ctx.rag.search(query, k=k * 3)
        best = cands[0]["score"] if cands else 0.0  # best candidate overall, including ones that get withheld below
        for ch in cands:
            if len(allowed) >= k:
                break
            a = ActionContext(kind="rag_read", verb="READ", resource=ch["doc"], resource_class=ch["classification"], user=actor, taint=taint,
                              extra={"risk": "MEDIUM" if ch["classification"] in ("CONFIDENTIAL", "RESTRICTED") else "LOW"})
            pol = ctx.policy.evaluate(a)
            if pol.decision != "ALLOW":
                if ch["doc"] not in withheld:
                    pending = ctx.db.one("SELECT id FROM approvals WHERE status='PENDING' AND tool='Local RAG' AND resource=?", (ch["doc"],))
                    ap_id = pending["id"] if pending else None
                    if pol.decision == "REQUIRE_APPROVAL" and not ap_id:
                        ap_id = ctx.approvals.create(action=f"Read {ch['classification']} document {ch['doc']} for retrieval", tool="Local RAG", resource=ch["doc"],
                                                     risk="HIGH", classification=ch["classification"], requester=f"Agent Reasoning Core ({actor})",
                                                     pending={"kind": "rag_read", "doc": ch["doc"]})["id"]
                    withheld[ch["doc"]] = ap_id
                    if ap_id:
                        approval_ids.append(ap_id)
                continue
            if injection.scan(ch["text"], "RETRIEVED_DATA").decision == "BLOCK":
                quarantined += 1
                continue
            taint.absorb("RETRIEVED_DATA", f"{ch['doc']} p.{ch['page']}", ch["classification"])
            allowed.append(ch)
        return {"chunks": allowed, "withheld": withheld, "approvals": approval_ids, "quarantined": quarantined, "best": best}

    def search_for_tool(self, query: str, taint: TaintContext, actor: str) -> str:
        r = self.retrieve(query, taint, actor, k=3)
        lines = [f"[{c['doc']} p.{c['page']} | {c['classification']} | score {c['score']:.2f}] {c['text'][:400]}" for c in r["chunks"]]
        if r["withheld"]:
            lines.append("Withheld (operator approval required): " + ", ".join(f"{d} ({a or 'blocked'})" for d, a in r["withheld"].items()))
        return "\n".join(lines) or "No matching chunks."
