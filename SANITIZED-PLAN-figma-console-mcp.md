# SANITIZED-PLAN — figma-console-mcp

- **Project**: figma-console-mcp (fork of southleft/figma-console-mcp, v1.34.0)
- **Branch**: `sanitized`
- **Date**: 2026-07-04
- **Scope**: full-source security review + removal of unsolicited remote connectivity

---

## 1. Why you saw traffic to `figma-console-mcp.southleft.com`

The Figma Desktop Bridge plugin ships a **"Cloud Mode"** relay. It is not a
backdoor in the classic sense — it is an upstream product feature — but it
behaved in a way you never consented to:

1. `figma-desktop-bridge/manifest.json` allow-listed
   `wss://figma-console-mcp.southleft.com` and
   `https://figma-console-mcp.southleft.com` in the plugin's network access.
2. If a cloud pairing code was ever entered (or restored), `code.js` persisted
   it in `figma.clientStorage` (`cloudConfig`).
3. **On every subsequent plugin launch**, `code.js` read the stored code and
   `ui.html` **silently auto-dialed the remote relay**
   (`cloudDial(restoredCode, true)`) with bounded auto-retry — no prompt, no
   visible consent. While connected, the relay (a Cloudflare Durable Object
   operated by southleft) has full read/write bridge access to your open Figma
   document, so design data transits their infrastructure.

That is the traffic you observed.

## 2. Full audit — what was checked and found

| Area | Verdict | Detail |
|---|---|---|
| Cloud relay auto-connect | **REMOVED** | Silent re-dial to southleft relay on plugin launch (see §1). |
| Manifest network allowlist | **FIXED** | southleft domains removed from `allowedDomains` + `devAllowedDomains`; plugin is now hard-limited to `localhost:9223–9232` by Figma's sandbox. |
| Stored pairing credential | **PURGED** | `code.js` now deletes any leftover `cloudConfig` from `clientStorage` on launch and never stores a new one. |
| Install-time hooks | Clean | Only `prepublishOnly: npm run build`. No `preinstall`/`postinstall` — nothing runs on `npm install`. |
| Telemetry / analytics | Clean | No PostHog/Sentry/Segment/Mixpanel/etc.; no tracking beacons anywhere. |
| eval / dynamic code execution | Clean | No `eval`, no `new Function`, no dynamic `require` of remote code. |
| Obfuscated code | Clean | No encoded strings / `atob` / hex-blob payloads found. |
| Outbound network (local mode) | Clean | Only `api.figma.com` (your token, expected), Figma's image CDN (image exports), and `localhost` health checks. |
| Token schema URLs (`southleft.com/schemas/...`) | Inert — kept | Pure `$schema` string identifiers written into generated token JSON; verified **never fetched**. Cosmetic only. |
| `src/index.ts` (Cloudflare Worker) | Not executed locally | Contains hosted-service code (OAuth URLs, docs redirects, landing page pointing at southleft). Excluded from the local build (`tsconfig.local.json` excludes it and both `cloud-websocket-*` modules), so none of it lands in `dist/` or runs in NPX/local mode. |
| `src/core/port-discovery.ts` | Low risk — noted | Uses `execSync` with interpolated `pid`/`port` (`lsof`, `ps`). Inputs are numeric (lsof output → `Number()`, port from local config), so no practical injection; it can also kill stale sibling MCP processes it identifies as its own. Local hardening candidate, not malicious. |
| Prompt-injection vector | **REMOVED** | `src/local.ts` tool prompt told AI assistants to install another southleft MCP (`design-systems-mcp`) — removed. |

## 3. What was changed (branch `sanitized`, commit `497a762`)

| File | Change |
|---|---|
| `figma-desktop-bridge/manifest.json` | Removed both southleft domains from both allowlists. **Strongest guarantee**: Figma itself now blocks any connection to that host, even if some code path were missed. |
| `figma-desktop-bridge/ui.html` | `CLOUD_RELAY_HOST = ''` + hard guard in `cloudDial()` (never dials when host is empty); `CLOUD_CONFIG_RESTORED` handler no longer auto-dials; cloud pairing button hidden. |
| `figma-desktop-bridge/code.js` | `STORE_CLOUD_CONFIG` is a no-op; startup now **deletes** any previously persisted pairing code. |
| `src/local.ts` | Removed third-party MCP install suggestion from the tool prompt. |

**Verification**: `npm run build:local` compiles clean; full jest suite green
(45/45 suites, 1329 passed / 7 skipped).

## 4. What is left (deliberately not changed)

- **`src/index.ts` + `src/core/cloud-websocket-{relay,connector}.ts`** — the
  hosted/Cloudflare deployment. Dead code for local use (excluded from local
  build). Left in place to keep the diff against upstream small and future
  merges easy. Delete them if you want a hard fork.
- **`$schema` URL strings** in `src/core/tokens/*` — inert identifiers inside
  generated JSON; changing them would break schema-format compatibility.
- **Docs / README / CHANGELOG** southleft references — documentation only, no
  runtime effect.
- **`port-discovery.ts` hardening** (swap `execSync` string interpolation for
  `execFileSync` argv arrays) — optional defense-in-depth follow-up.

## 5. Action required on your machine

1. In Figma Desktop, **reload the Desktop Bridge plugin** (or re-import it via
   Plugins → Development) so the sanitized `manifest.json`/`code.js`/`ui.html`
   take effect. First launch will also wipe any stored pairing code.
2. If you ever used the *hosted* server (`figma-console-mcp.southleft.com` as
   your MCP URL) rather than local/NPX mode, consider **revoking/rotating your
   Figma personal access token** — in hosted mode it transited their OAuth
   flow. In pure local mode your PAT never left your machine.
3. Run from this branch (`npm run build:local`, point MCP config at
   `dist/local.js`), or `npm pack` it — do **not** `npx figma-console-mcp`,
   which would fetch the unsanitized upstream from npm.

## 6. Should you still use this tool?

**Yes — on this `sanitized` branch, for local mode.** The codebase is
otherwise clean: no install hooks, no telemetry, no obfuscation, no dynamic
code execution, and all remaining traffic goes to `api.figma.com` and
`localhost` only. The cloud relay was an opt-in-once-then-silent product
feature with poor consent UX, not an exfiltration implant — but the
auto-reconnect-with-stored-credential behavior was a legitimate reason for
your alarm, and it is now removed at three independent layers (manifest,
dialer, storage).

Caveats:
- Never use the hosted endpoint; stay on local mode.
- Re-run a sanitization pass after pulling upstream updates (the toolkit
  below automates this).
- Pin your MCP config to your local build, not the npm package.
