# PanelLab

Korean PLC engineering workspace using the existing Copilot Studio integrated agent.
No replacement AI, automatic PLC deployment, or local PLC correctness engine is provided.

## Engineering dashboard

The navy sidebar, white workspace and blue controls follow the supplied design
reference without copying its example data, user portrait, invented progress
percentages or completed PLC results. The circuit motif is CSS, not an external
stock image. Dashboard statistics use actual locally stored projects/results.
Project status is explicitly user-assigned; old projects without a status remain
unclassified. A project marked complete is not a successful AI or PLC verification.

Navigation offers drawing analysis, ladder, code generation, error review,
correction, verification and reporting as ordinary requests to **AGENT 01 only**.
The owner's internal AGENT 02–08 connections are neither configured nor changed
by this website. The existing Direct Line/Broker/authentication flow is unchanged;
Web Chat's presentation options use the same light workspace palette.
The optional Netlify deployment below adds a login-verified token adapter; it
does not add another AI or change the upstream Broker.

## GitHub Pages with a separate Netlify token server

The public workspace stays at `https://kmkspu36.github.io/plll/`.
`js/token-client.js` opens a user-initiated login window at
`https://superb-fudge-1fb499.netlify.app/auth.html`. Netlify Identity handles
invitation acceptance and login using its official widget. The token function
verifies the bearer token against this site's fixed Identity `/user` endpoint
and requires a confirmed user before calling the existing Broker adapter.
The incoming Azure principal header is ignored; only a server-verified Identity
user is translated to the internal adapter's authenticated principal.

Keep Identity **invite only**, email confirmation required. All confirmed
invited users can request chat tokens; do not invite accounts that should not
have agent access. No open signup, anonymous token vending, arbitrary issuer,
wildcard CORS, or caller-supplied principal is used. Site-wide Netlify password
protection must not block the public login page or function.

The login window sends **only the short-lived Direct Line response**, never the
Identity JWT/password or SEALED, to its verified opener. The workspace checks
the exact sender origin, popup window and random per-request state. Tokens are
not placed in URLs or stored by the workspace. Identity session storage stays
on the Netlify origin; third-party cookies are not required. No cross-origin
API request is needed, so this design deliberately does not enable CORS.
Allow popups and press **다시 연결**, sign in, then **이 계정으로 채팅 연결**.
Login expires after three minutes; retries start a new agent conversation.
The initial automatic connection shows a login prompt rather than opening a
blocked popup. Existing loopback and Azure same-origin API behavior is retained.

Netlify reads `netlify.toml`: install API dependencies, build an explicit public
allowlist into `.netlify-public`, and bundle `netlify/functions/chat-token.js`.
Do not override publish directory to the repository root. API sources,
credentials and local settings must not be published as static assets.

In the Netlify project, set these **server Function environment variables**
for production, mark SEALED as secret, then trigger a new production deploy:

| Variable | Value |
|---|---|
| `PANEL_BROKER_URL` | Existing owner's HTTPS Direct Line Broker endpoint |
| `PANEL_BROKER_SEALED` | Owner's operational credential, entered privately in Netlify only |
| `PANEL_ALLOWED_ORIGIN` | `https://superb-fudge-1fb499.netlify.app` |
| `PANEL_BROKER_ORIGIN` | `https://kmkspu36.github.io` |

`PANEL_ALLOWED_ORIGIN` is the login window's actual request origin, not Pages.
`PANEL_BROKER_ORIGIN` preserves the previously verified upstream Origin.
Image upload remains disabled unless separately verified and explicitly configured.
Reissue credentials previously shared in chat before production use.
Never put SEALED in GitHub variables, HTML, browser JS or screenshots.

Invitation emails normally return to the Netlify root. The root detects known
Identity callback hashes and immediately redirects to `auth.html` to let the
official widget complete them. Invitation URLs and their fragments are secrets;
do not send them to support or paste them into the workspace chat.

Netlify Free/Identity availability does not guarantee unlimited usage. Review
current account credits and limits; no paid upgrade is configured by this code.
Public end-to-end chat is not verified until the owner sets the server variables,
accepts their invitation and completes an actual agent round trip on Pages.

Project descriptions, user status, creation/last-activity dates and stage request
records are additive to existing storage. Work history is rebuilt from preserved
outgoing activities and results, so it remains visible after reload. The dashboard
shows requested tasks as requests, not completed operations. Users may explicitly
link a real result or retained original response to a stage; this is labelled user
classification and requires review. Verification/report tabs display those actual
linked responses without manufacturing a new response schema. No automatic stage
completion, job progress percentage, GX Works compilation or equipment test is
claimed. Reports need the existing agent's actual responses and context.

The overview now spans the workspace above the project/chat/result columns.
`전문 데이터` opens project-isolated I/O, global labels, errors, drawing evidence,
code versions, stage confirmations and report export. These are local user records,
not new AI capabilities. Address diagnostics flag exact normalized I/O duplicates
as candidates; missing-label hints compare registered drawing references to
registered labels, not arbitrary PLC code or a compiler symbol table.

Corrections preserve old field values. Code versions preserve exact source text;
restoring a version appends a new local version, without overwriting prior versions
or sending anything to GX Works/PLC. Unapproved corrections cannot be promoted
through the version picker. Correction rejection records a reason without deleting
the proposal; additional revision requests go to AGENT 01 only when connected.

Stage completion requires a real result assigned to that stage and an explicit
user reason. Later requests or removing/reclassifying the supporting result
invalidate the displayed completion while preserving its historical record.
The overview displays confirmed stages out of seven, never estimated agent progress.
The Markdown report gathers actual original responses, source IDs, user states and
unconfirmed items. It does not manufacture an AI report or hardware verification.

Native Web Chat code blocks receive a copy toolbar without replacing Web Chat,
altering stored Activities, or forcing transcript scroll positions.

The dashboard and workspace switch without unmounting Web Chat. Results remain
conditional; mobile has separate Home, Chat, Results and Menu controls. The native
Web Chat composer/transcript and image-preparation gate are retained. User/account
identity is not fabricated: the header identifies a local workspace, not a signed-in
person. PDF upload, server conversation resume, automatic stage correlation and
cloud synchronization still require verified service support.

| Storage | Current use | Limits |
|---|---|---|
| localStorage | Projects, conversation Activities, results, engineering records and task references | Small browser quota; no cross-device sync or encryption |
| IndexedDB | Explicit original-image storage and legacy backups | Browser eviction possible; per-browser access |
| File export | Legacy JSON export, original images, Markdown report, full project backup | Full backup includes image bytes; maximum 50MB image data, 75MB input JSON |
| Cloud storage | Not configured | Needs authentication, deployment, access policy and cost review |

Settings offers a separate full-project backup and additive restore. Restore validates
the format, project ownership and image signatures, generates new project/record IDs,
remaps source links, and keeps existing projects. It checks for changes during file
restoration and rolls back written keys on failure. Close other editing tabs first;
browser storage is not a cross-tab transactional database. Reload after restore is
required, and it does not resume a server conversation. Keep external backup files:
browser crash/eviction and interruptions between IndexedDB and localStorage cannot
be made fully atomic. The legacy export remains available but is not the new
restorable package format.

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
- `PANEL_BROKER_ORIGIN` (optional): the exact original site origin accepted by
  the existing Broker/credential. Defaults to `PANEL_ALLOWED_ORIGIN`. This is a
  server-controlled upstream header, never copied from an arbitrary caller.
  When testing locally or moving hosts, keep it at the origin verified with the
  Broker until its owner issues credentials for the new deployment. This does
  not relax the incoming Origin or hosting authentication checks.

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

### Azure Portal preparation (no credential in chat or source)

The manually triggered `Deploy PanelLab to Azure` GitHub Actions workflow stages
only `index.html`, `css`, `js` and `staticwebapp.config.json` as frontend files.
The existing `api` is deployed separately as a managed API, not as public static
content. Node.js 22 is selected according to Microsoft's
[managed API runtime reference](https://learn.microsoft.com/azure/static-web-apps/languages-runtimes).
The workflow does not create an Azure resource, select a paid plan, or deploy
automatically on push. Running it requires an existing Static Web App.

1. In Azure Portal, choose/create the Static Web App for this site. Review the
   Free plan's suitability and quotas; do not select a paid plan without approval.
   Keep the existing Direct Line Broker resource and agent configuration unchanged.
2. Privately store that Static Web App's deployment token as the repository
   Actions secret `AZURE_STATIC_WEB_APPS_API_TOKEN`. Do not send it in chat.
   If Portal generated another deployment workflow, choose a single workflow
   rather than deploying the same site twice.
3. In the Static Web App's application/environment settings, register the three
   `PANEL_` server values listed above. The allowed origin is the Static Web App's
   actual HTTPS origin, not the GitHub Pages URL. Use only a newly issued Broker
   credential. Keep image upload unverified until real channel tests pass.
4. The route configuration restricts `/api/*` to the custom `engineer` role.
   Use Portal role management to invite the intended GitHub user with that role,
   accept the invitation, and sign in at `/.auth/login/github`. Merely having a
   GitHub account or being signed in is not sufficient. See Microsoft's
   [authentication reference](https://learn.microsoft.com/azure/static-web-apps/authentication-authorization).
5. Run `Deploy PanelLab to Azure` on `main`. Review the deployment output and
   site URL. Verify authentication, the real `/api/chatToken` response and then
   Direct Line Online + an actual AGENT 01 reply. Do not copy tokens to logs.

These are deployment prerequisites, not evidence that Azure deployment or a live
agent conversation has already succeeded. Public GitHub Pages remains a frontend
preview and cannot execute the managed API. Browser-local project data is
origin-specific: export from Pages and restore at the new site when moving hosts.

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

## Images: preparation versus verified analysis

The attachment dialog prepares real PNG/JPEG files locally: extension, MIME,
signature, decode and resolution checks; preview, removal/replacement, optional
description and explicit original-file storage. The default preparation limit
is one file of 5 MiB. General documents are not enabled. Preparing or storing an
image does not upload it, and does not mean the agent analyzed it.

Only after the owner has verified the existing agent's File uploads setting,
published Direct Line channel, image-only and image+text behavior, set the
**server-only** `PANEL_IMAGE_UPLOAD_VERIFIED=1`. Keep it disabled until that real
verification. `PANEL_UPLOAD_MAX_FILES` (1–5, default 1) and
`PANEL_UPLOAD_MAX_BYTES` (up to 15 MiB, default 5 MiB) must reflect tested limits,
not inferred service capacity. This flag is an operator assertion, not automated
proof that Copilot Studio accepts images. It does not change agent instructions.

The app sends files and text in one `WEB_CHAT/SEND_MESSAGE` action with
`attachments: [{ blob: File }]`, matching Web Chat 4.18.0's send-message saga.
Web Chat owns the Direct Line upload and retry state. No file is sent through
the token Broker and no external AI or public file-hosting service is added.
Image-only requests include a transparent analysis-request prompt. No percentage
progress or analysis result is fabricated. Live uploads remain unverified here.

## Local original files and backups

Explicitly saved image Blobs use IndexedDB `panellab.workspace.v1`, scoped to
their project, and can be reopened, downloaded or individually deleted from
**보관한 이미지**. They are not encrypted, synced or guaranteed against browser
eviction. Deleting a local copy does not delete a previously uploaded server file.
Changing projects never implicitly sends an image.

Existing projects/conversations/results remain authoritative in localStorage.
The settings action creates a new transactional IndexedDB snapshot and downloads
its JSON without removing or overwriting old data. This is a non-destructive
backup step, not a completed primary-store migration or server synchronization.
JSON exports contain text/metadata, not original file bytes; download originals
separately. Do not treat expiring attachment URLs as permanent file backups.

## Local checks

With Node.js 22+ installed, run `node test/analyzer.test.js` and the additional
`node --test test/*.test.js` checks. API checks use `npm test` inside `api`.
No live broker credential is needed for unit tests.

## Workspace behavior

- The dark, Korean chat workspace keeps results closed until requested or detected.
  At mobile widths, chat, menu and results each use the full screen.
- Connection loading/error screens occupy the chat stage rather than leaving an
  empty Web Chat container. Only an actual token and Direct Line connection reveal
  the real conversation. The offline bottom bar is labelled as an unavailable
  input location, not a working chat composer. Web Chat owns the online composer.
- A compact welcome area remains through the agent greeting and closes after the
  first user message starts sending, including attachment-only messages. It stays
  closed through responses and send failures until a new conversation is started.
  The bounded Web Chat root and transcript take the remaining height; only the
  transcript scrolls, with Web Chat's own sticky-to-bottom behavior preserved.
  Its native input stays above the image toolbar. No per-message forced scroll
  overrides a user reading older messages. Tablet widths retain the sidebar above
  720px. On mobile, the visible viewport height/offset tracks keyboard resizing;
  pinch zoom is not overridden. Physical-device keyboard testing is still needed.
- Sending, acknowledgement, failure and typing indicators observe Web Chat 4.18.0
  action payloads. They do not simulate an agent response or completion time.
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
- Result cards can collapse and open in a full-window dialog without remounting
  Web Chat. Supported serial ladder previews can export SVG; unsupported ladder
  logic still falls back to unchanged source.
- A user can explicitly retain an incoming archived response as an original-text
  result, then prepare a ladder/code/review/correction/I/O/explanation follow-up.
  The current destination is shown before submission. This does not classify an
  image as analyzed, invent a report schema, restore the old server session, or
  reattach previous images automatically.
- Correction proposals preserve both versions. Approval updates only a browser
  working copy, available in project settings; it never writes to a PLC.
- Only complete serial LD/LDI/AND/ANI rungs with one OUT/SET/RST are visualized.
  OR, branching, unknown instructions, incomplete rungs and extra operands fall
  back to their unchanged source. This is not a Mitsubishi compiler or validator.
- Image preparation and local storage remain available offline; actual upload
  is disabled until the existing agent path is verified end to end. Native
  send-box attachment actions are subject to the same capability/limit gate.
- Browser storage is not encrypted or synchronized. Quota errors are reported
  without silently trimming results. Export important work; malformed storage is
  not automatically overwritten. Clear site data only after backing it up.

## Verification scope

Unit tests use isolated fixtures, not a live agent or production credentials.
They cover response parsing, raw archives, project ownership, approval, bounded
diffs, safe ladder fallback, connection transitions and token-server failures.
Local responsive checks cover 1672px, 1440px, 1280px, 1024px, 809px, 720px,
390px and 360px layouts. Engineering form submission, reload persistence,
source remapping and additive project restore were also exercised in isolated Chrome.
Automated tests cover candidate-address/label checks, source-bound user completion,
version restoration, rejection, quota failures, backup validation and rollback.

On November 3, 2026 a temporary loopback-only server used an owner-provided
credential in process environment only. The existing Broker returned HTTP 403
without Origin and with the loopback Origin, and HTTP 200 with a short-lived token
when the verified original Pages Origin was supplied. The proxy now forwards that
server-configured Broker Origin while still enforcing incoming Origin and hosting
authentication. No credential was added to source or a settings file.

The actual Web Chat connected through the existing Broker/Direct Line, received
the agent greeting, sent a support question and received the actual reply. A
second, explicitly educational minimal-logic request produced a real IL text block,
which appeared as a preserved PLC-code result and native code-copy cards.
These observations verify local text conversation and one real response shape,
not every agent workflow. Azure production deployment, service token-expiry
recovery, actual image/PDF analysis, GX Works compilation and equipment tests
remain unverified. The upload capability stays disabled.

The chat-layout check also used the actual Web Chat 4.18 renderer in an isolated
browser frame with a test-only, offline transport and temporary in-memory
metadata. With 35 labelled user entries, document height stayed within the
viewport, the native transcript scrolled, the composer stayed above attachments,
sticky scrolling followed the bottom and retained an older reading position.
Welcome transitions, 360–1440px layouts and simulated visual-viewport resizing
were checked without contacting an agent or creating AI responses. These are
renderer checks, not successful live conversations or physical keyboard tests.

The renewed dashboard was checked in isolated headless Chrome at widths 1440,
1024, 819, 720, 390 and 360px, including a 390x400 short viewport. Dashboard/chat/
results switching, attachment-dialog bounds and the offline send gate were checked.
Project creation, description/user status, real metric updates and reload
persistence were verified in a temporary browser profile, not the user's storage.

The reference-layout refinement places compact project cards, the existing
native Web Chat and an independent results/evidence column together on wide
desktop screens. The banner is compact rather than pushing all cards below the
fold. Tablet prioritizes summary/chat and opens results on request; mobile keeps
separate Home/Chat/Results views and moves the same workflow card onto Home.
No duplicate Web Chat or transcript is created during layout changes. The CSS
and changed presentation scripts use a release query suffix to avoid mixing old
cached styles with new HTML; retain and bump it for subsequent presentation releases.

The publicly reachable existing Broker returned HTTP 405 for GET, HTTP 204 for
OPTIONS, and HTTP 400 with an error object for an empty POST during diagnosis.
The browser could read that empty-request error response via CORS. These results
only establish route reachability and missing-credential handling, **not** valid
SEALED authentication, successful token generation or agent availability.
