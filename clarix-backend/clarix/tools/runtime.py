"""Invocation pipeline for every tool call: permission -> policy -> (approval) -> sandbox -> audit."""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path

from ..classification import max_class, max_risk
from ..security.policy import ActionContext
from ..security.taint import SINKS, TaintContext
from . import sandbox
from .registry import TOOLS, ToolSpec


@dataclass
class ToolResult:
    ok: bool
    output: str
    decision: str = "ALLOW"
    approval_id: str | None = None
    policies: list[str] = field(default_factory=list)
    ms: int = 0
    risk: str = "LOW"
    classification: str = "PUBLIC"


class ToolRuntime:
    def __init__(self, ctx):
        self.ctx = ctx  # late-bound container (settings, db, audit, metrics, policy, tools, approvals, rag)

    # -- helpers
    def _resource_class(self, spec: ToolSpec, resource: str) -> str:
        if spec.id == "fs":
            row = self.ctx.db.one("SELECT classification FROM rag_documents WHERE name=?", (Path(resource).name,))
            return row["classification"] if row else "INTERNAL"
        return "PUBLIC"

    def _audit(self, actor, spec, action, decision, risk, cls, payload):
        self.ctx.audit.append(user=actor, action=action, component=spec.name if spec.id != "calc" else "Local Tools", risk=risk,
                              decision=decision, classification=cls, payload=payload)

    # -- main entry
    def invoke(self, tool_id: str, arg: str, *, actor: str = "operator", taint: TaintContext | None = None,
               approved: bool = False, sink: str | None = None) -> ToolResult:
        spec = TOOLS.get(tool_id)
        if spec is None:
            return ToolResult(False, f"Unknown tool '{tool_id}'", "BLOCK")
        taint = taint or TaintContext()
        arg = (arg or "")[:2000]
        start = time.perf_counter()
        sink_kind = SINKS[sink][1] if sink in SINKS else None
        a = ActionContext(kind="tool_call", tool_id=tool_id, verb=("WRITE" if sink_kind == "file_write" else spec.verb), resource=arg,
                          resource_class=self._resource_class(spec, arg), sink=sink, sink_kind=sink_kind, user=actor, taint=taint,
                          extra={"risk": spec.risk})
        pol = self.ctx.policy.evaluate(a)
        cls = max_class(a.resource_class, taint.classification)
        risk = max_risk(spec.risk, pol.risk)
        self.ctx.metrics.inc("component.policy.evaluations")
        label = sink or tool_id

        if spec.air_gap_locked and pol.decision != "BLOCK":
            # Hard invariant: network-class tools can never run, whatever policy toggles say.
            pol.decision = "BLOCK"
            pol.matched.insert(0, "POL-001")
            pol.reasons.insert(0, "POL-001: Network tools are hard-locked by the air-gapped deployment and cannot be enabled by policy toggles.")

        if pol.decision == "BLOCK":
            self._audit(actor, spec, f"Blocked {label}: {pol.reasons[0] if pol.reasons else 'policy'}", "BLOCK", risk, cls, f"tool:{label}:blocked:{','.join(pol.matched)}")
            return ToolResult(False, f"Denied by {pol.primary}: {pol.reasons[0].split(': ', 1)[-1]}", "BLOCK", None, pol.matched, 0, risk, cls)

        if pol.decision == "REQUIRE_APPROVAL" and not approved:
            ap = self.ctx.approvals.create(action=f"{spec.name}: {arg[:160] or '(no argument)'}", tool=spec.name, resource=arg or "-", risk=risk,
                                           classification=cls, requester=f"Agent Reasoning Core ({actor})",
                                           pending={"kind": "tool", "tool": tool_id, "input": arg, "actor": actor, "taint_class": taint.classification})
            return ToolResult(False, f"Suspended: operator approval {ap['id']} required ({pol.reasons[0].split(': ', 1)[-1]})", "REQUIRE_APPROVAL",
                              ap["id"], pol.matched, 0, risk, cls)

        try:
            out = self._execute(spec, arg, taint, actor)
        except sandbox.ToolError as e:
            self._audit(actor, spec, f"Rejected {label}: {e}", "BLOCK", risk, cls, f"tool:{label}:rejected")
            return ToolResult(False, f"Rejected: {e}", "BLOCK", None, pol.matched, 0, risk, cls)
        ms = max(1, int((time.perf_counter() - start) * 1000))
        self.ctx.tools.record_run(tool_id)
        self.ctx.metrics.inc("tool.calls")
        self.ctx.metrics.inc(f"component.{tool_id}.requests")
        self._audit(actor, spec, f"Executed {spec.name}", "ALLOW", risk, cls, f"tool:{tool_id}:ok")
        # tool output inherits the trust of its source
        taint.absorb("TOOL_OUTPUT", f"tool:{tool_id}", a.resource_class)
        return ToolResult(True, out, "ALLOW", None, pol.matched, ms, risk, cls)

    def resume(self, tool_id: str, arg: str, actor: str, taint_class: str = "PUBLIC") -> ToolResult:
        t = TaintContext()
        if taint_class != "PUBLIC":
            t.absorb("RETRIEVED_DATA", "resumed-approval", taint_class)
        return self.invoke(tool_id, arg, actor=actor, taint=t, approved=True)

    def _execute(self, spec: ToolSpec, arg: str, taint: TaintContext, actor: str) -> str:
        ws = self.ctx.settings.workspace
        ws.mkdir(parents=True, exist_ok=True)
        if spec.id == "calc":
            return sandbox.calculate(arg)
        if spec.id == "fs":
            return sandbox.read_file(ws, arg)
        if spec.id == "db":
            return sandbox.select_only(self.ctx.db.path, arg)
        if spec.id == "sysinfo":
            return sandbox.system_info()
        if spec.id == "shell":
            return sandbox.run_command(ws, arg)
        if spec.id == "rag":
            return self.ctx.rag_gate.search_for_tool(arg, taint, actor)
        raise sandbox.ToolError(f"{spec.name} has no executor: it is permanently unavailable in an air-gapped deployment")
