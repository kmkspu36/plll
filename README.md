# PanelLab

Korean PLC engineering workspace using the existing Copilot Studio integrated agent.
No replacement AI, automatic PLC deployment, or local PLC correctness engine is provided.

## Deployment and authentication

The repository's currently observed deployment is **GitHub Pages**. Pages can
serve this frontend but cannot execute `/api/chatToken` or store server secrets.
Pushing code alone cannot make agent authentication work there. Deploy the site
with its server API (for example on Azure) before claiming live connectivity.
Do not restore the old browser-side SEALED value to bypass this requirement.

The browser uses Web Chat 4.18.0 and requests a short-lived token from
`POST /api/chatToken`. It never sends a broker credential. Serve the static site
and `api` through the same Azure Static Web Apps origin, with its integrated,
authenticated API proxy. Install API dependencies with `npm ci` in `api`.
Set these **server-only** application settings:

- `PANEL_BROKER_URL`: the existing HTTPS Direct Line broker endpoint.
- `PANEL_BROKER_SEALED`: a newly issued broker credential, never a public value.
- `PANEL_ALLOWED_ORIGIN`: the exact deployed site origin, without a trailing slash.

The endpoint fails closed without configuration or an authenticated Azure Static
Web Apps principal. Sign in through the hosting provider's configured login route
before connecting. This repository does not choose or configure an identity provider.
Do not expose a standalone Functions endpoint that accepts caller-supplied
`x-ms-client-principal` headers; restrict ingress to the trusted authenticated proxy.
CORS is not authentication. Configure hosting access controls, request quotas and
monitoring before public rollout. Hosting, Azure and existing Copilot Studio usage
may incur charges; review your existing plan before deployment.

`api/local.settings.example.json` contains names/placeholders only. If used locally,
copy it to ignored `api/local.settings.json` and enter credentials privately.
Never put credentials in the frontend, query parameters, logs, or browser storage.
GitHub Pages alone cannot run this endpoint. Deployment and live connection require
access to the existing Azure/Broker environment.

## Real local server

Node.js 22+ is required. From the repository root:

```powershell
npm ci --prefix .\api
npm run dev --prefix .\api
```

This serves the frontend on `http://127.0.0.1:4173` and executes the **same token
handler** as Azure; it does not simulate tokens, responses or a connected agent.
Absent settings return `SERVER_CONFIG_MISSING` with missing variable names only.
No actual broker credential is provided by this repository.

To connect locally, privately copy `api\local.settings.example.json` to
`api\local.settings.json`, supply a verified/reissued credential and the existing
Broker URL, and set `PANEL_LOCAL_DEVELOPMENT` to `"1"`. This is an explicit
loopback-only developer authentication opt-in, not an Azure login. The server
binds only `127.0.0.1`, requires its exact Host and Origin, and ignores incoming
principal headers. Do not publish, forward, or tunnel this developer server.
Restart after changing settings. For deployment, use real hosting authentication;
the Azure endpoint does not read or honor this local-development flag.

Diagnostic codes distinguish missing/invalid server configuration, login,
Origin rejection, Broker HTTP rejection, invalid JSON, missing token, timeout
and network failure. Broker error bodies and authentication values are never
sent to the browser. Broker HTTP status alone does not establish whether the
SEALED value is invalid: inspect its server configuration and logs privately.

## Previously published credential

A broker `SEALED` value was previously committed to this public repository.
Removing it from the current files does not revoke it or remove Git history.
The broker owner must determine its scope, invalidate/reissue it, review access
logs, and rotate related secrets if necessary. History rewriting requires separate
coordination; it is not performed by this change.

## Agent and output contract

Keep the existing broker and Copilot Studio agent. Do not change agent instructions.
Current result recognizers are provisional until checked against real agent
activities: fenced PLC code, labelled before/after blocks, labelled error fields,
typed JSON and attachments. Unknown responses remain available as original text.
Parser examples are test inputs, not agent responses or proof of PLC validity.
GX Works compilation and equipment validation are separate, mandatory engineering
steps. CPU defaults to unspecified.

## Local checks

With Node.js 22+ installed, run `node test/analyzer.test.js` and the additional
`node --test test/*.test.js` checks. API checks use `npm test` inside `api`.
No live broker credential is needed for unit tests.

## Workspace behavior

- The dark, Korean chat workspace keeps results closed until requested or detected.
  At mobile widths, chat, menu and results each use the full screen.
- Quick actions send ordinary requests to the same agent, including the selected
  GX Works version and CPU (unspecified by default). They are disabled offline.
- New conversations and reconnects start a new Direct Line session. Recent
  conversations are read-only local archives, **not server conversation resume**.
  A project switch starts a new conversation; delayed replies remain associated
  with their original project and conversation.
- Incoming message activities, including text and attachment metadata, are
  preserved locally. Results offer original-response inspection and file export.
  Old results created before raw-activity preservation are explicitly labelled.
  A project export includes conversations, results and the approved working copy.
- Correction proposals preserve both versions. Approval updates only a browser
  working copy, available in project settings; it never writes to a PLC.
- Only complete serial LD/LDI/AND/ANI rungs with one OUT/SET/RST are visualized.
  OR, branching, unknown instructions, incomplete rungs and extra operands fall
  back to their unchanged source. This is not a Mitsubishi compiler or validator.
- Upload controls are intentionally disabled until the existing broker/agent
  upload path and supported file types have been verified end to end.
- Browser storage is not encrypted or synchronized. Quota errors are reported
  without silently trimming results. Export important work; malformed storage is
  not automatically overwritten. Clear site data only after backing it up.

## Verification scope

Unit tests use isolated fixtures, not a live agent or production credentials.
They cover response parsing, raw archives, project ownership, approval, bounded
diffs, safe ladder fallback, connection transitions and token-server failures.
Local responsive checks cover 1440px, 1024px and 390px layouts with an explicitly
unconfigured token server. Real token issuance, agent responses, expiration/
reconnection on the service, file handling and GX Works compatibility still
require an authenticated deployment and the existing broker owner's verification.
