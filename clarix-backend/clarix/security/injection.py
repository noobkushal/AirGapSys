"""Heuristic prompt-injection / jailbreak detector.

HONEST LIMITS: this is pattern matching over normalised text. It catches common, known phrasings and
obvious obfuscation (unicode tricks, spaced-out letters, base64). A determined attacker can evade it,
and benign text can trigger it. It is ONE layer. The load-bearing protections are the capability gates
(tool permissions, policy engine, taint/sink rules, human approval, air-gap), which hold even if this
detector is fooled.
"""
from __future__ import annotations

import base64
import binascii
import re
import unicodedata
from dataclasses import dataclass, field

from ..classification import CLASSES, max_class

MAX_INPUT = 8000
BLOCK_AT, REVIEW_AT = 60, 35

_ZW = re.compile("[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff\u00ad]")
_CTRL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
_SPACED = re.compile(r"\b(?:[a-z]\s){4,}[a-z]\b")
_B64 = re.compile(r"[A-Za-z0-9+/]{24,}={0,2}")
_HOMOGLYPH = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s"})


@dataclass(frozen=True)
class Rule:
    name: str
    category: str
    weight: int
    reason: str
    pattern: re.Pattern


def _r(name: str, cat: str, w: int, reason: str, pat: str) -> Rule:
    return Rule(name, cat, w, reason, re.compile(pat, re.I | re.S))


RULES: tuple[Rule, ...] = (
    _r("override", "Instruction Override", 60, "Attempt to override system instructions.",
       r"\b(ignore|disregard|forget|override|bypass|skip)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|any|your|the|these)\b[^.\n]{0,30}\b(instructions?|rules?|constraints?|guidelines?|prompts?|directives?|polic(?:y|ies)|safety)\b"),
    _r("new-instructions", "Instruction Override", 25, "Presents replacement instructions.", r"\b(new|updated|revised) (system )?(instructions?|rules?)\s*:"),
    _r("prompt-leak", "System Prompt Leak", 50, "Attempt to extract the system prompt.",
       r"\b(reveal|show|print|repeat|output|display|leak|dump|tell me|disclose)\b[^.\n]{0,70}\b(system|hidden|initial|original|secret|internal)\s+(prompt|instructions?|message|rules)\b"),
    _r("repeat-above", "System Prompt Leak", 45, "Asks the model to repeat its preceding context.", r"\brepeat\b[^.\n]{0,20}\b(everything|all|the text|the words)\b[^.\n]{0,15}\b(above|before)\b"),
    _r("roleplay-jailbreak", "Jailbreak Pattern", 60, "Role-play override pattern.",
       r"\b(you are now|pretend (to be|you are)|act as|roleplay as|from now on,? you)\b[^.\n]{0,50}\b(dan|unrestricted|unfiltered|jailbroken|no (rules|restrictions|limits|filters)|developer mode|evil)\b"),
    _r("secret-request", "Credential Access", 35, "Requests a secret, token or password.",
       r"\b(print|reveal|show|give|output|display|send)\b[^.\n]{0,30}\b(admin|root|api|access|auth)?\s*(token|password|passwd|credentials?)\b"),
    _r("dan", "Jailbreak Pattern", 55, "Known jailbreak phrase.", r"\bdo anything now\b"),
    _r("mode-switch", "Jailbreak Pattern", 45, "Fake privileged-mode activation.", r"\b(developer|debug|god|admin|sudo) mode (enabled|on|activated|unlocked)\b"),
    _r("delimiter", "Delimiter Injection", 40, "Contains chat-template or role delimiters.",
       r"<\|?(im_start|im_end|system|endoftext)\|?>|\[/?inst\]|<</?sys>>|(^|\n)\s*(system|assistant)\s*:"),
    _r("net-exfil-cmd", "Data Exfiltration", 50, "References an outbound network command.",
       r"\b(curl|wget|nc|ncat|netcat|invoke-webrequest|iwr|scp|sftp|ftp|telnet)\b[^\n]{0,80}(https?://|\b\d{1,3}(\.\d{1,3}){3}\b|[a-z0-9-]+\.[a-z]{2,})"),
    _r("exfil-dest", "Data Exfiltration", 45, "Asks to transmit data to an external destination.",
       r"\b(send|email|e-mail|post|upload|transmit|forward|exfiltrate|leak)\b[^\n]{0,60}\b(to|at|via)\b[^\n]{0,30}(\b[\w.+-]+@[\w-]+\.[\w.]+|https?://\S+|\b[a-z0-9-]+\.(com|org|net|io|ru|cn|xyz|evil)\b)"),
    _r("cred-files", "Credential Access", 35, "Targets credential or system files.", r"(/etc/(passwd|shadow|sudoers)|(^|[\s/\"'])\.env\b|id_rsa|\.ssh/|\.aws/credentials)"),
    _r("classified-out", "Data Exfiltration", 30, "Classified material combined with an outbound transfer request.",
       r"(confidential|secret|restricted|financial|proprietary)[^\n]{0,80}\b(send|post|upload|email|transmit|forward)\b|\b(send|post|upload|email|transmit|forward)\b[^\n]{0,80}(confidential|secret|restricted|proprietary)"),
    _r("shell-inject", "Command Injection", 40, "Shell metacharacter / command injection pattern.",
       r"(\$\(|`[^`]+`|;\s*(rm|cat|curl|wget|chmod|sh|bash|nc)\b|\|\s*(sh|bash)\b|&&\s*(rm|curl|wget)\b|\brm\s+-rf\b)"),
    _r("conceal", "Indirect Injection", 35, "Instructs concealment from the user/operator.",
       r"\b(do not|don't|never)\b[^.\n]{0,20}\b(tell|inform|alert|notify|mention|reveal)\b[^.\n]{0,25}\b(user|operator|human|anyone)\b"),
    _r("addresses-ai", "Indirect Injection", 40, "Text addresses the AI directly (typical of injected documents).",
       r"\b(when|if|once) (the |an )?(ai|assistant|model|llm|agent|chatbot)\b[^.\n]{0,40}\b(reads?|sees?|processes?|summari[sz]es?|encounters?)\b|\battention[, ]+(ai|assistant|llm|model)\b"),
    _r("hidden-comment", "Indirect Injection", 40, "Instruction hidden in a comment.", r"<!--[^>]{0,300}(ignore|instruction|assistant|system)[^>]*-->"),
    _r("disable-controls", "Policy Evasion", 45, "Asks to disable safety, filtering or logging.",
       r"\b(disable|turn off|deactivate|remove|bypass)\b[^.\n]{0,30}\b(safety|filters?|guardrails?|polic(y|ies)|monitoring|logging|audit)\b"),
    _r("tool-abuse", "Tool Abuse", 45, "Explicitly requests a forbidden sink tool.", r"\b(call|invoke|use|run|execute)\b[^.\n]{0,20}\b(http_post|send_email|network_request|database_export)\b"),
)


@dataclass
class Verdict:
    category: str
    risk: int
    decision: str
    risk_label: str
    reason: str
    matched: list[str] = field(default_factory=list)
    trust: str = "USER"
    classification: str = "INTERNAL"
    obfuscated: bool = False

    def to_dict(self) -> dict:
        return {"category": self.category, "risk": self.risk, "decision": self.decision, "riskLabel": self.risk_label,
                "reason": self.reason, "matched": self.matched, "trust": self.trust, "classification": self.classification}


def normalise(text: str) -> tuple[str, bool]:
    """NFKC fold, strip zero-width/control chars, collapse whitespace; join 's p a c e d' letters."""
    changed = False
    t = unicodedata.normalize("NFKC", text)
    t2 = _CTRL.sub(" ", _ZW.sub("", t))
    changed |= t2 != t
    low = t2.lower()
    spaced = bool(_SPACED.search(re.sub(r" {2,}", "  ", low)))
    if spaced:
        # 'i g n o r e  a l l': 2+ spaces mark word gaps; single spaces between letters are removed
        low = re.sub(r" {2,}", "\x00", low)
        low = _SPACED.sub(lambda m: m.group(0).replace(" ", ""), low)
        low = low.replace("\x00", " ")
        changed = True
    low = re.sub(r"[ \t\r\f\v]+", " ", low)
    return low, changed


SQUASHED = {
    "ignoreallpreviousinstructions": 60, "ignorepreviousinstructions": 60, "ignoreallinstructions": 60,
    "disregardpreviousinstructions": 60, "ignoretheaboveinstructions": 60, "revealthesystemprompt": 50,
    "revealyoursystemprompt": 50, "youarenowdan": 60, "doanythingnow": 55,
}


def _decoded_b64(text: str) -> list[str]:
    out = []
    for m in _B64.findall(text)[:5]:
        try:
            raw = base64.b64decode(m + "=" * (-len(m) % 4), validate=True)
            s = raw.decode("utf-8")
        except (binascii.Error, UnicodeDecodeError, ValueError):
            continue
        if s and sum(ch.isprintable() or ch in "\n\t" for ch in s) / len(s) > 0.95 and len(s) >= 12:
            out.append(s)
    return out


def _guess_classification(text: str) -> str:
    low = text.lower()
    if re.search(r"\b(restricted|top secret|classified)\b", low):
        return "RESTRICTED"
    if re.search(r"\b(confidential|financial|secret|payroll|salary|credential|password)\b", low):
        return "CONFIDENTIAL"
    return "INTERNAL"


def _label(score: int) -> str:
    return "CRITICAL" if score >= 85 else "HIGH" if score >= BLOCK_AT else "MEDIUM" if score >= REVIEW_AT else "LOW"


def scan(text: str, trust: str = "USER") -> Verdict:
    """Score `text`. Untrusted sources (documents, tool output) use the same rules."""
    if text is None:
        text = ""
    text = text[:MAX_INPUT]
    norm, obf = normalise(text)
    variants = [norm, norm.translate(_HOMOGLYPH)]
    decoded = _decoded_b64(text)
    hits: dict[str, Rule] = {}
    for v in variants + [d.lower() for d in decoded]:
        for rule in RULES:
            if rule.name not in hits and rule.pattern.search(v):
                hits[rule.name] = rule
    if obf:  # letters were spaced/zero-width obfuscated: also test the fully squashed text
        squashed = re.sub(r"[^a-z0-9]", "", norm)
        for phrase, w in SQUASHED.items():
            if phrase in squashed and "squashed" not in hits:
                hits["squashed"] = Rule("squashed", "Instruction Override" if "ignore" in phrase or "disregard" in phrase else "Jailbreak Pattern", w, "Obfuscated (spaced-out) injection phrase.", re.compile("x"))
    enc_hit = bool(decoded) and any(rule.pattern.search(d.lower()) for d in decoded for rule in RULES)
    weights = sorted((r.weight for r in hits.values()), reverse=True)
    score = 4
    if weights:
        score += weights[0] + int(0.4 * sum(weights[1:]))
    if enc_hit:
        score += 20
    if obf and hits:
        score += 10
    score = min(99, score)
    top = max(hits.values(), key=lambda r: r.weight) if hits else None
    category = "Obfuscated Payload" if enc_hit else (top.category if top else "Benign request")
    reason = ("Hidden base64 payload contains injection patterns." if enc_hit
              else top.reason if top else "No suspicious patterns matched by the heuristic detector.")
    decision = "BLOCK" if score >= BLOCK_AT else "REQUIRE_APPROVAL" if score >= REVIEW_AT else "ALLOW"
    return Verdict(category=category, risk=score, decision=decision, risk_label=_label(score), reason=reason,
                   matched=sorted(hits), trust=trust, classification=_guess_classification(text), obfuscated=obf)


__all__ = ["scan", "Verdict", "BLOCK_AT", "REVIEW_AT", "MAX_INPUT", "CLASSES", "max_class"]
