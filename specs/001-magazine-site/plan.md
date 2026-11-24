# Plan 001 — Technical design

## Stack

- **Node ≥ 18, no npm dependencies.** The build, server and tools are plain `.mjs` scripts.
- Output is static HTML/CSS/JS committed to the repo root, so GitHub Pages serves it straight from
  `main` / root (`.nojekyll` turns off Jekyll).

## Layout

```
issues.config.json            # hand-maintained list of issues (id, folder, source md, pdfs)
index.html                    # GENERATED – latest issue
archive.html                  # GENERATED – all issues
admin.html                    # login page (static, hand-written)
issues/<id>/index.html        # GENERATED – one page per issue
assets/site.css               # shared styles (derived from the original Website.html design)
assets/site.js                # reader features: theme, font, TOC drawer, scroll-spy, search
assets/admin.js               # admin layer: auth, toolbars, edit queue, sync
data/issues.json              # GENERATED – manifest used by archive/admin
data/users.json               # admin users {username, salt, hash, iterations}
data/edits.json               # edit queue (instructions + deletions)
tools/lib/markdown.mjs        # md → chapters → items → html
tools/build.mjs               # builds everything
tools/apply-edits.mjs         # applies pending deletes; lists pending instructions
tools/user.mjs                # add / change / remove admin users
tools/server.mjs              # local dev + admin API (127.0.0.1:8080)
.claude/commands/apply-edits.md   # prompt Claude follows to apply instructions
.github/workflows/apply-edits.yml # CI: apply queue with Claude, rebuild, commit
```

## Build pipeline

1. Read `issues.config.json`. Sort by `id` descending. Latest = first.
2. For each issue, parse its source md:
   - Title = first `# ` line. Meta table = first pipe table (chapter → section, printed page, PDF page).
   - Chapters = each later `# ` heading. Items are grouped per spec §5.
   - Render HTML with `data-bid`, `data-kind`, `data-ch` attributes on item wrappers (`<div class="it">`).
3. Write `issues/<id>/index.html`. Write `index.html` (the latest issue, with relative asset paths
   and links pointing into `issues/<id>/` for PDFs). Write `archive.html` and `data/issues.json`.

The page skeleton is shared: a top bar, the sidebar TOC, a hero with section cards, then the chapters.
Admin toolbars are **not** in the HTML. `admin.js` injects them only when a session exists,
so readers download no admin UI markup.

## Admin runtime

- `admin.js` loads on every page (deferred, small). Without a session it only adds a footer "অ্যাডমিন" link.
- Mode detection: `GET /api/health`. If it answers → **server mode**, otherwise → **static mode**.
- Auth:
  - server mode → `POST /api/login` → bearer token (in-memory on the server, 8h TTL).
  - static mode → fetch `data/users.json`, then PBKDF2 through WebCrypto and compare.
- Queue:
  - server mode → `GET/POST/DELETE /api/edits`.
  - static mode → `localStorage["ca_edits"]` merged with `data/edits.json`.
- Sync (static): GitHub Contents API `PUT /repos/{owner}/{repo}/contents/data/edits.json`.
  Owner/repo are taken from the `*.github.io/<repo>` URL, or entered by hand.

## Applying edits

- `tools/apply-edits.mjs`: for each pending `delete`, remove the first exact occurrence of
  `text` from the issue's source md (plus the blank line after it) → mark `applied`
  (or `failed: not found`). Then rebuild.
- Instructions: Claude reads `data/edits.json`. For each pending instruction it finds `text` in the
  source md and rewrites only that passage, following the instruction and the
  magazine's style rules (Bengali, factual, `[যাচাই প্রয়োজন]` when unsure). It then sets
  `status:"applied"` with a short `result` note. Finally it runs `node tools/build.mjs`.
- Server mode "এখনই প্রয়োগ করুন" → runs apply-edits, then
  `claude -p <prompt> --permission-mode acceptEdits --allowedTools Read,Edit,Write,Bash(node tools/*)`.
  The run is async and the UI polls `/api/status`.

## Risks

- OCR text may contain duplicate items. Text-match deletion removes the first match only.
  Duplicate IDs carry an index suffix, and the edit stores `occurrence` to pick the right one.
- Bengali-numeral MCQ detection could misfire on numbered prose. In that case the item still renders
  correctly and just carries kind `mcq`.
