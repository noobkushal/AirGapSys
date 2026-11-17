import os
import tempfile
import unittest
from pathlib import Path

from clarix.config import ConfigError, Settings, load_dotenv


class DotEnv(unittest.TestCase):
    def write(self, text):
        d = Path(tempfile.mkdtemp()); p = d / ".env"; p.write_text(text, encoding="utf-8"); return p

    def test_parses_quotes_comments_export_and_bom(self):
        p = self.write('\ufeff# comment\n\nCLARIX_PORT=8123\nexport CLARIX_DEFAULT_MODEL="qwen3:4b"\nCLARIX_EMBED_MODEL=nomic-embed-text # trailing\nBROKEN LINE\nCLARIX_HOST=\'127.0.0.1\'\n')
        env = {}
        keys = load_dotenv(p, env)
        self.assertEqual(env, {"CLARIX_PORT": "8123", "CLARIX_DEFAULT_MODEL": "qwen3:4b", "CLARIX_EMBED_MODEL": "nomic-embed-text", "CLARIX_HOST": "127.0.0.1"})
        self.assertEqual(len(keys), 4)

    def test_real_environment_wins_and_missing_file_is_fine(self):
        env = {"CLARIX_PORT": "9000"}
        load_dotenv(self.write("CLARIX_PORT=1\nCLARIX_X=2\n"), env)
        self.assertEqual(env, {"CLARIX_PORT": "9000", "CLARIX_X": "2"})
        self.assertEqual(load_dotenv(Path("/nonexistent/.env"), {}), [])

    def test_from_env_reads_dotenv_in_cwd_and_still_validates(self):
        d = Path(tempfile.mkdtemp()); (d / ".env").write_text("CLARIX_DEFAULT_MODEL=qwen3:4b\nCLARIX_PORT=8111\n")
        old = os.getcwd(); saved = {k: os.environ.pop(k) for k in ("CLARIX_DEFAULT_MODEL", "CLARIX_PORT") if k in os.environ}
        try:
            os.chdir(d)
            s = Settings.from_env()
            self.assertEqual((s.default_model, s.port), ("qwen3:4b", 8111))
            (d / ".env").write_text("CLARIX_HOST=0.0.0.0\n"); os.environ.pop("CLARIX_HOST", None)
            with self.assertRaises(ConfigError):
                Settings.from_env()
        finally:
            os.chdir(old)
            for k in ("CLARIX_DEFAULT_MODEL", "CLARIX_PORT", "CLARIX_HOST"):
                os.environ.pop(k, None)
            os.environ.update(saved)


if __name__ == "__main__":
    unittest.main()
