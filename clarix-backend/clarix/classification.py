CLASSES = ("PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED")
RISKS = ("LOW", "MEDIUM", "HIGH", "CRITICAL")
CLASS_RANK = {c: i for i, c in enumerate(CLASSES)}
RISK_RANK = {r: i for i, r in enumerate(RISKS)}
TRUST_LABELS = ("SYSTEM", "LOCAL_DOCUMENT", "RETRIEVED_DATA", "USER", "TOOL_OUTPUT", "UNTRUSTED")


def norm_class(c: str) -> str:
    c = (c or "").upper()
    if c not in CLASS_RANK:
        raise ValueError(f"classification must be one of {', '.join(CLASSES)}")
    return c


def max_class(*cs: str) -> str:
    return max(cs, key=lambda c: CLASS_RANK[c]) if cs else "PUBLIC"


def class_at_least(c: str, threshold: str) -> bool:
    return CLASS_RANK[c] >= CLASS_RANK[threshold]


def max_risk(*rs: str) -> str:
    return max(rs, key=lambda r: RISK_RANK[r]) if rs else "LOW"


def risk_at_least(r: str, threshold: str) -> bool:
    return RISK_RANK[r] >= RISK_RANK[threshold]
