# 03 — Frontend Developer Guide

## 1. Frontend Technology Stack

The Clarix AI frontend is built to deliver a high-assurance cybersecurity operations center (SOC) user experience in strictly air-gapped environments:

* **Framework**: React 18.3.1 with TypeScript 5.6.3
* **Build System**: Vite 5.4.11
* **Routing**: React Router DOM 6.28.0
* **Iconography**: Lucide React 0.460.0
* **Data Visualization**: Recharts 2.13.3
* **Self-Hosted Offline Fonts**: `@fontsource/jetbrains-mono` and `@fontsource/sofia-sans` (no external Google Fonts or CDN requests)
* **Styling Architecture**: Global Design Tokens (`tokens.css`) + Design System primitives (`ds.css`) + CSS Modules (`*.module.css`) + Page Layouts (`pages.css`)

---

## 2. Directory Structure

```
src/
├── components/
│   ├── common/           # Generic UI components: Button, Card, Modal, Pill, ToastHost, etc.
│   ├── dashboard/        # SOC Dashboard widgets: EventStream, ZeroTrust, ScenarioModal
│   ├── layout/           # AppShell, TopBar, ConsoleBackdrop
│   └── navigation/       # ClarixNavigation drawer & navigation definitions
├── hooks/
│   ├── useAsync.ts       # Async operation lifecycle handler
│   ├── useHoverDrawer.ts # Advanced state machine for interactive logo drawer
│   ├── useInterval.ts    # Safe polling timer hook
│   └── useLocalStorage.ts# Type-safe local storage hook
├── landing/              # Standalone marketing & intro landing page
├── pages/                # The 17 Console SOC Pages + NotFound
├── services/             # API communication layer (client.ts & service modules)
│   └── mock/             # db.ts (mock database) and ragCommandsMock.ts
├── state/                # ConsoleContext: global badge counts, toasts, settings
├── styles/               # ds.css, global.css, landing.css, pages.css, tokens.css
├── types/                # Core TypeScript interfaces for all system entities
└── utils/                # sha256.ts (Web Crypto), safeMath.ts, format.ts, tones.ts
```

---

## 3. The 17 Console Modules

The console provides 17 dedicated operational security views under `/overview` … `/settings`:

| Path | Module Page | Functionality & Capabilities |
|---|---|---|
| `/` | `Landing.tsx` | High-impact product overview and entry point into the SOC console. |
| `/overview` | `Overview.tsx` | Executive SOC dashboard: live posture, active threat counters, system health, and quick action stream. |
| `/agent` | `AgentPage.tsx` | Air-gapped AI chat interface with `/rag` command integration, citations, and tool approval triggers. |
| `/security-monitor`| `SecurityMonitor.tsx`| Real-time hourly decision metrics, security event stream, and real-time defense posture. |
| `/air-gap` | `AirGap.tsx` | Egress network monitoring, blocked socket connection telemetry, and interactive live egress probe testing. |
| `/policies` | `Policies.tsx` | Interactive policy management for POL-001 through POL-005, showing rules, triggers, and enforcement counters. |
| `/tools` | `LocalTools.tsx` | Tool catalog, risk classifications, execution history, and capability details. |
| `/tool-permissions`| `ToolPermissions.tsx`| Permission level management (`READ`, `WRITE`, `EXECUTE`, `RESTRICTED`, `BLOCKED`) with air-gap hard-lock indicators. |
| `/approvals` | `Approvals.tsx` | Pending human-in-the-loop authorization queue with countdown timers (300s TTL) and resolution modals. |
| `/rag` | `Rag.tsx` | Document ingestion manager, semantic query tool, classification viewer, and quarantined injection chunk alerts. |
| `/prompt-injection`| `PromptInjection.tsx`| Threat log of caught prompt injection attempts and interactive prompt analyzer. |
| `/taint` | `Taint.tsx` | Dynamic data taint flow visualizer, showing source-to-sink tracking and blocked exfiltration scenarios. |
| `/integrity` | `Integrity.tsx` | Visual cryptographic audit ledger, showing hash links, JSON canonical payloads, and chain verification. |
| `/audit` | `Audit.tsx` | Comprehensive audit log viewer with filtering by component, user, decision, and risk level. |
| `/ollama` | `Ollama.tsx` | Local Ollama engine status, installed models list, latency benchmark tool, and temperature controls. |
| `/health` | `Health.tsx` | Subsystem health diagnostics, CPU/RAM telemetry, database size, and uptime statistics. |
| `/architecture` | `Architecture.tsx` | Visual architectural diagram and security perimeter documentation. |
| `/settings` | `Settings.tsx` | System configurations, API endpoint testing, token authentication management, and UI theme toggles. |

---

## 4. Logo Drawer Navigation (`hooks/useHoverDrawer.ts`)

The Clarix logo drawer uses a precision state machine designed for effortless access without frustrating mis-clicks:

1. **Hover to Open**: Moving the cursor over the logo opens the drawer.
2. **Grace Period (280ms)**: Allows the cursor to cross the gap between the logo and drawer without closing.
3. **Click to Pin**: Clicking the logo pins the drawer open permanently until clicked again or dismissed.
4. **Keyboard Accessibility**: Supports `Escape` to close (and return focus to the logo), `Enter`, and `Tab` navigation.
5. **Scroll Locking**: The document body scroll lock activates only while the drawer is pinned, preventing awkward layout jumps.

---

## 5. Client-Side Cryptographic Verification (`utils/sha256.ts`)

Clarix AI does not require the user to blindly trust the server's audit status. The frontend implements client-side SHA-256 chain re-verification using the native browser **Web Crypto API**:

```typescript
// Computes canonical JSON hash for audit records directly in browser memory
export async function sha256Hex(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyAuditChainClientSide(records: AuditRecord[]): Promise<boolean> {
  let prevHash = "0".repeat(64); // Genesis
  for (const record of records) {
    const canonical = canonicalizeRecord(record);
    const expectedHash = await sha256Hex(prevHash + canonical);
    if (record.hash !== expectedHash) {
      return false; // Chain broken!
    }
    prevHash = record.hash;
  }
  return true;
}
```

---

## 6. Development Workflow

```bash
# Install dependencies
npm install

# Start Vite development server
npm run dev

# Run TypeScript compilation check
npm run typecheck

# Build optimized production bundle
npm run build

# Preview production build locally
npm run preview
```
