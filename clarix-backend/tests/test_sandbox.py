import os
import tempfile
import unittest
from pathlib import Path

from clarix.tools import sandbox as sb
from tests.helpers import Env


class CalcTests(unittest.TestCase):
    def test_values(self):
        for e, v in {"(450 * 1.15) / 12": "43.125", "2**10": "1024", "-3+4*2": "5", "10/4": "2.5", "7 % 3": "1", "2^3": "8"}.items():
            self.assertEqual(sb.calculate(e), v, e)

    def test_rejects_code_and_abuse(self):
        for e in ["__import__('os').system('id')", "().__class__", "abs(-3)", "2**99999", "9**9**9", "1/0", "x+1", "9" * 300, "", "1e999*1e999", "[1]", "'a'*9"]:
            with self.assertRaises(sb.ToolError, msg=e):
                sb.calculate(e)


class FileTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        self.ws = self.root / "ws"; self.ws.mkdir()
        (self.ws / "a.txt").write_text("hello world")
        (self.root / "secret.txt").write_text("TOP SECRET")
        try:
            os.symlink(self.root / "secret.txt", self.ws / "escape")
            os.symlink("/etc", self.ws / "etc")
            self.has_symlinks = True
        except OSError:
            self.has_symlinks = False

    def test_reads_inside(self):
        self.assertEqual(sb.read_file(self.ws, "a.txt"), "hello world")
        self.assertEqual(sb.read_file(self.ws, str(self.ws / "a.txt")), "hello world")

    def test_blocks_traversal_absolute_symlinks_and_nul(self):
        targets = ["../secret.txt", "a\x00.txt", ""]
        if self.has_symlinks:
            targets += ["../../etc/passwd", "/etc/passwd", "escape", "etc/passwd", "a.txt/../../secret.txt"]
        else:
            targets += ["../secret.txt"]
        for p in targets:
            with self.assertRaises(sb.ToolError, msg=p):
                sb.read_file(self.ws, p)

    def test_binary_and_size_limits(self):
        (self.ws / "b.bin").write_bytes(b"\x00\x01\x02" * 10)
        with self.assertRaises(sb.ToolError):
            sb.read_file(self.ws, "b.bin")
        (self.ws / "big.txt").write_bytes(b"x" * (sb.MAX_READ_BYTES + 1))
        with self.assertRaises(sb.ToolError):
            sb.read_file(self.ws, "big.txt")


class ShellTests(unittest.TestCase):
    def setUp(self):
        self.ws = Path(tempfile.mkdtemp())

    def test_allowlist(self):
        self.assertTrue(sb.run_command(self.ws, "uname -s"))
        (self.ws / "f.txt").write_text("x")
        self.assertIn("f.txt", sb.run_command(self.ws, "ls"))

    def test_rejections(self):
        for c in ["rm -rf /", "uname -a; id", "cat /etc/passwd", "ls ..", "ls /", "uname -a | sh", "echo $(id)", "df -h /", "python -c 1", "", "`id`", "ls ../../"]:
            with self.assertRaises(sb.ToolError, msg=c):
                sb.run_command(self.ws, c)


class SqlTests(Env):
    def q(self, sql): return sb.select_only(self.ctx.db.path, sql)

    def test_select_allowed_tables(self):
        self.assertIn("0", self.q("SELECT count(*) FROM rag_documents"))

    def test_rejections(self):
        for s in ["DROP TABLE rag_documents", "SELECT * FROM audit_events", "SELECT * FROM approvals", "SELECT * FROM policies", "SELECT 1; SELECT 2",
                  "SELECT embedding FROM rag_chunks", "SELECT * FROM rag_chunks", "UPDATE rag_documents SET name='x'", "SELECT 1 -- x",
                  "SELECT load_extension('x')", "ATTACH DATABASE 'x' AS y", "PRAGMA table_info(rag_documents)", "WITH x AS (SELECT 1) SELECT * FROM x", "",
                  "SELECT * FROM sqlite_master", "SELECT readfile('/etc/passwd')"]:
            with self.assertRaises(sb.ToolError, msg=s):
                self.q(s)
        self.assertTrue(self.ctx.audit.verify()["ok"])

    def test_cannot_write_even_via_select_trick(self):
        self.ctx.db.x("INSERT INTO rag_documents VALUES('d',1,1,'INDEXED','LOCAL_DOCUMENT','PUBLIC','t','m','s',0)")
        self.q("SELECT name FROM rag_documents")
        self.assertEqual(self.ctx.db.one("SELECT COUNT(*) n FROM rag_documents")["n"], 1)


if __name__ == "__main__":
    unittest.main()
