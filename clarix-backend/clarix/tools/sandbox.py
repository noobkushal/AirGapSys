"""Sandboxed tool executors. Each enforces its own invariants regardless of policy toggles."""
from __future__ import annotations

import ast
import math
import operator
import os
import platform
import re
import shlex
import sqlite3
import subprocess
from pathlib import Path

import psutil


class ToolError(Exception):
    """Input rejected by the sandbox (not a server fault)."""


# ---------------------------------------------------------------- calculator (AST, no eval)
_BIN = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
        ast.Mod: operator.mod, ast.FloorDiv: operator.floordiv, ast.Pow: operator.pow}
_UN = {ast.USub: operator.neg, ast.UAdd: operator.pos}
MAX_EXPR, MAX_ABS = 200, 1e308


def calculate(expr: str) -> str:
    expr = (expr or "").strip()
    if not expr:
        raise ToolError("Empty expression")
    if len(expr) > MAX_EXPR:
        raise ToolError(f"Expression longer than {MAX_EXPR} characters")
    if not re.fullmatch(r"[0-9+\-*/%().\s^eE]*", expr):
        raise ToolError("Only numbers and + - * / % ** ( ) are allowed")
    try:
        tree = ast.parse(expr.replace("^", "**"), mode="eval")
    except SyntaxError as e:
        raise ToolError(f"Syntax error: {e.msg}") from None

    def ev(n):
        if isinstance(n, ast.Expression):
            return ev(n.body)
        if isinstance(n, ast.Constant) and type(n.value) in (int, float):
            return n.value
        if isinstance(n, ast.BinOp) and type(n.op) in _BIN:
            a, b = ev(n.left), ev(n.right)
            if isinstance(n.op, ast.Pow) and (abs(b) > 1000 or abs(a) > 1e6 and b > 20):
                raise ToolError("Exponent too large")
            if isinstance(n.op, (ast.Div, ast.Mod, ast.FloorDiv)) and b == 0:
                raise ToolError("Division by zero")
            r = _BIN[type(n.op)](a, b)
            if isinstance(r, complex) or (isinstance(r, float) and not math.isfinite(r)) or abs(r) > MAX_ABS:
                raise ToolError("Result out of range")
            return r
        if isinstance(n, ast.UnaryOp) and type(n.op) in _UN:
            return _UN[type(n.op)](ev(n.operand))
        raise ToolError("Unsupported syntax (only arithmetic is permitted)")

    r = ev(tree)
    return str(int(r)) if isinstance(r, float) and r.is_integer() and abs(r) < 1e15 else repr(round(r, 12)) if isinstance(r, float) else str(r)


# ---------------------------------------------------------------- file reader (workspace-contained)
MAX_READ_BYTES, MAX_RETURN_CHARS = 1_000_000, 4000


def resolve_in_workspace(workspace: Path, user_path: str) -> Path:
    """Resolve symlinks and '..' FIRST, then require the result to stay inside the workspace."""
    if not user_path or "\x00" in user_path:
        raise ToolError("Invalid path")
    root = workspace.resolve()
    p = Path(user_path)
    full = (p if p.is_absolute() else root / p).resolve()
    try:
        full.relative_to(root)
    except ValueError:
        raise ToolError("Path is outside the sandbox workspace") from None
    return full


def read_file(workspace: Path, user_path: str) -> str:
    full = resolve_in_workspace(workspace, user_path)
    if not full.is_file():
        raise ToolError("File not found in the sandbox workspace")
    if full.stat().st_size > MAX_READ_BYTES:
        raise ToolError("File larger than the 1 MB read limit")
    data = full.read_bytes()
    if b"\x00" in data[:4096]:
        raise ToolError("Binary files cannot be read by this tool")
    text = data.decode("utf-8", "replace")
    return text[:MAX_RETURN_CHARS] + (f"\n[truncated: {len(text) - MAX_RETURN_CHARS} more characters]" if len(text) > MAX_RETURN_CHARS else "")


# ---------------------------------------------------------------- read-only SQL
ALLOWED_TABLES = {"rag_documents", "rag_chunks", "counters"}
HIDDEN_COLUMNS = {("rag_chunks", "embedding")}
MAX_ROWS = 50


def select_only(db_path: str, sql: str) -> str:
    sql = (sql or "").strip().rstrip(";").strip()
    if not sql or len(sql) > 1000:
        raise ToolError("Provide one SELECT statement (max 1000 characters)")
    if ";" in sql or "--" in sql or "/*" in sql:
        raise ToolError("Only a single statement without comments is permitted")
    if not re.match(r"(?is)^select\b", sql):
        raise ToolError("Only a read-only SELECT is permitted")
    uri = f"file:{db_path}?mode=ro" if db_path != ":memory:" else "file:clarix_mem?mode=memory&cache=shared"
    con = sqlite3.connect(uri, uri=True, timeout=5)

    def auth(action, a1, a2, dbname, src):
        if action == sqlite3.SQLITE_SELECT:
            return sqlite3.SQLITE_OK
        if action == sqlite3.SQLITE_READ:
            if a1 not in ALLOWED_TABLES or (a1, a2) in HIDDEN_COLUMNS:
                return sqlite3.SQLITE_DENY
            return sqlite3.SQLITE_OK
        if action == sqlite3.SQLITE_FUNCTION and a2 in {"count", "sum", "avg", "min", "max", "lower", "upper", "length", "substr", "round", "abs", "coalesce"}:
            return sqlite3.SQLITE_OK
        return sqlite3.SQLITE_DENY

    try:
        con.execute("PRAGMA query_only=ON")
        con.set_authorizer(auth)
        cur = con.execute(sql)
        cols = [d[0] for d in cur.description or []]
        rows = cur.fetchmany(MAX_ROWS)
    except sqlite3.Error as e:
        raise ToolError(f"Query rejected: {e}") from None
    finally:
        con.close()
    lines = [" | ".join(cols)] + [" | ".join(str(v)[:120] for v in r) for r in rows]
    return "\n".join(lines) + (f"\n[showing first {MAX_ROWS} rows]" if len(rows) == MAX_ROWS else f"\n[{len(rows)} row(s)]")


# ---------------------------------------------------------------- system info
def system_info() -> str:
    vm = psutil.virtual_memory()
    return (f"OS: {platform.system()} {platform.release()} | arch: {platform.machine()} | python: {platform.python_version()} | "
            f"cpus: {os.cpu_count()} | memory: {vm.total / 2**30:.1f} GB total, {vm.available / 2**30:.1f} GB available")


# ---------------------------------------------------------------- restricted shell (allowlist, no shell)
ALLOWED_COMMANDS = {"uname": {"-a", "-s", "-r", "-m"}, "date": {"-u"}, "uptime": set(), "hostname": set(), "whoami": set(), "df": {"-h"}}


def run_command(workspace: Path, command_line: str) -> str:
    if re.search(r"[|&;<>`$(){}\\\n]", command_line or ""):
        raise ToolError("Shell metacharacters are not permitted")
    try:
        argv = shlex.split(command_line)
    except ValueError:
        raise ToolError("Could not parse command") from None
    if not argv:
        raise ToolError("Empty command")
    cmd, args = argv[0], argv[1:]
    if cmd == "ls" and len(args) <= 1:
        target = resolve_in_workspace(workspace, args[0] if args else ".")
        if not target.is_dir():
            raise ToolError("Not a directory in the workspace")
        return "\n".join(sorted(x.name + ("/" if x.is_dir() else "") for x in target.iterdir())[:200]) or "(empty)"
    if cmd not in ALLOWED_COMMANDS or any(a not in ALLOWED_COMMANDS[cmd] for a in args):
        raise ToolError(f"Command not in the inspection allowlist: {', '.join(sorted(ALLOWED_COMMANDS)) + ', ls'}")
    r = subprocess.run([cmd, *args], capture_output=True, text=True, timeout=5, shell=False, env={"PATH": "/usr/bin:/bin", "LC_ALL": "C"}, cwd=str(workspace.resolve()))
    return (r.stdout or r.stderr).strip()[:MAX_RETURN_CHARS] or "(no output)"
