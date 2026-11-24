# Tasks 001

- [x] T1 Analyse the issue folders and Markdown conventions (spec §1)
- [x] T2 Write spec / plan / tasks
- [x] T3 `tools/lib/markdown.mjs`: parser, item grouping, stable IDs, HTML renderer
- [x] T4 `tools/build.mjs`: issue pages, landing page, archive, manifest, `.nojekyll`
- [x] T5 `assets/site.css`, `assets/site.js`: reader UI (TOC, search, theme, font, mobile)
- [x] T6 `data/users.json` + `tools/user.mjs` (PBKDF2 user store)
- [x] T7 `admin.html` + `assets/admin.js`: login, toolbars, instruction box, delete, queue panel, sync
- [x] T8 `tools/apply-edits.mjs` (deletes) + `.claude/commands/apply-edits.md` (instructions)
- [x] T9 `tools/server.mjs`: local admin API + "apply with Claude"
- [x] T10 `.github/workflows/apply-edits.yml`
- [x] T11 Verify: build, browse landing/archive/issue, log in (right and wrong password), queue and cancel an instruction,
      delete MCQ/Q&A/news (tested on a scratch copy of the Markdown), PBKDF2 parity between Node and WebCrypto, mobile width
- [ ] T11b Not yet exercised: a live `claude -p` run from the server, the GitHub Contents API push, the CI workflow
- [ ] T12 (user) Enable GitHub Pages: Settings → Pages → Deploy from branch `main` / root
- [ ] T13 (user) Add the `ANTHROPIC_API_KEY` repo secret to apply edits automatically in CI
