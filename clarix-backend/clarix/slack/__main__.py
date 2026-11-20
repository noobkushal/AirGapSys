"""Entry point for `python -m clarix.slack`"""
from __future__ import annotations

import sys
from .relay import run_relay_cli

if __name__ == "__main__":
    sys.exit(run_relay_cli())
