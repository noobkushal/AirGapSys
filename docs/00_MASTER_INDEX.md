# Clarix AI — Master Documentation Index

Welcome to the complete official documentation for **Clarix AI**, an enterprise-grade, air-gapped, zero-trust AI agent console and security backend.

---

## 📚 Documentation Structure

This documentation suite contains exhaustive technical, architectural, operational, and security guides for Clarix AI. All files are included in this package:

| Document | Title | Purpose & Target Audience |
|---|---|---|
| **[01_EXECUTIVE_AND_SECURITY_SUMMARY.md](./01_EXECUTIVE_AND_SECURITY_SUMMARY.md)** | Executive & Security Summary | High-level overview, Zero-Trust philosophy, threat model, compliance matrix, and "What Enforces What" table. Ideal for CISOs, security reviewers, and project leads. |
| **[02_SYSTEM_ARCHITECTURE.md](./02_SYSTEM_ARCHITECTURE.md)** | System Architecture | Architectural blueprints, mock vs. live dual-engine design, network perimeter, trust boundaries, and data flow pipelines. |
| **[03_FRONTEND_DEVELOPER_GUIDE.md](./03_FRONTEND_DEVELOPER_GUIDE.md)** | Frontend Developer Guide | Deep dive into React 18, TypeScript, Vite, CSS Modules, the 17-module console, drawer interaction state machine, and browser-side Web Crypto verification. |
| **[04_BACKEND_AND_SECURITY_INTERNALS.md](./04_BACKEND_AND_SECURITY_INTERNALS.md)** | Backend & Security Internals | In-depth technical breakdown of the FastAPI + stdlib server, in-process egress socket guard, AST calculator, SQLite authorizer sandbox, shell allow-lists, and SHA-256 audit ledger. |
| **[05_AIRGAP_OS_DEPLOYMENT_GUIDE.md](./05_AIRGAP_OS_DEPLOYMENT_GUIDE.md)** | Air-Gap OS Deployment Guide | Host-level hardening: Linux `iptables`/`nftables`, macOS `pf`, systemd `IPAddressDeny=any`, offline Ollama model transfer, and verification scripts. |
| **[06_API_SPECIFICATION_REFERENCE.md](./06_API_SPECIFICATION_REFERENCE.md)** | API Specification Reference | Complete REST API endpoint reference: request/response bodies, HTTP methods, authorization tokens, rate limits, and error payloads. |
| **[07_RAG_AND_LOCAL_LLM_PIPELINE.md](./07_RAG_AND_LOCAL_LLM_PIPELINE.md)** | RAG & Local LLM Pipeline | Document ingestion, chunking, dual embedders (`nomic-embed-text` vs `hash-lexical-v1`), security gating, prompt injection quarantine, citation tracking, and `/rag` chat commands. |
| **[08_TESTING_AND_VERIFICATION_MANUAL.md](./08_TESTING_AND_VERIFICATION_MANUAL.md)** | Testing & Verification Manual | Complete testing guide: 136 unit and contract tests, mutation testing, invariant proofs, and host self-checks. |
| **[09_OPERATIONS_AND_ADMIN_GUIDE.md](./09_OPERATIONS_AND_ADMIN_GUIDE.md)** | Operations & Admin Guide | Quickstart, installation, environment variables table, operator token configuration, backup & restore, and troubleshooting FAQ. |
| **[DOCUMENTATION_INDEX.html](./DOCUMENTATION_INDEX.html)** | Standalone HTML Documentation Reader | An all-in-one styled HTML viewer that lets you browse and search all documentation offline in any browser with zero installation. |
| **[REFERENCE_FRONTEND_README.md](./REFERENCE_FRONTEND_README.md)** | Original Frontend README | Upstream frontend documentation from repository root. |
| **[REFERENCE_BACKEND_README.md](./REFERENCE_BACKEND_README.md)** | Original Backend README | Upstream backend documentation from `clarix-backend/`. |

---

## 🚀 Quick Reference: Key System Characteristics

* **Zero External Dependencies at Runtime**: Self-hosted fonts (`@fontsource`), local offline vector search, local inference via loopback Ollama (`127.0.0.1:11434`), and embedded SQLite storage.
* **Dual-Engine Architecture**: Operates in fully standalone **Mock Mode** for browser demonstrations and offline evaluations, or in **Live Mode** with the FastAPI/Python backend.
* **Deterministic Policy Engine**: POL-001 through POL-005 enforce least privilege, prevent data egress, protect sensitive system files, and require human-in-the-loop approvals.
* **Tamper-Evident Audit Ledger**: Every action, decision, prompt, and tool execution is recorded in a cryptographically chained SQLite database using SHA-256 (`hash = SHA-256(prev_hash + canonical_record)`).
* **Multi-Layer Defense in Depth**: Process-level socket monkey-patching combined with OS-level firewall rules ensures that AI models cannot exfiltrate classified data even in the presence of prompt injection.

---
*Generated for Clarix AI — Complete Documentation Suite*
