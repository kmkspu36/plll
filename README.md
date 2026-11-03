# PanelLab

Korean PLC engineering workspace using the existing Copilot Studio integrated agent.
No replacement AI, automatic PLC deployment, or local PLC correctness engine is provided.

## Deployment and authentication

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
