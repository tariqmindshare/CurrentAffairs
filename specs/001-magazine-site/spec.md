# Spec 001 — Current Affairs Magazine Website

Status: Implemented (v1) · Owner: site admin · Last updated: 2026-11-24

## 1. Background

The repository holds a monthly Bengali current-affairs magazine. One folder per issue
(`November 2026/`, `December 2026/`). Each issue has a **Full Book Markdown** file that
contains the full text of the issue:

- Line 1 `# <magazine title> • <month year>`. It is followed by a table of contents
  (`| # | অংশ | বিষয় | মুদ্রিত পৃষ্ঠা | PDF পৃষ্ঠা |`).
- Each chapter starts with `# <chapter title>`. Pages are marked with
  `## পৃষ্ঠা NN (PDF page N)` and followed by a running header line (contains `◀`/`▶`).
- Inside a chapter: `###`/`####` headings, paragraphs, `-` lists, pipe tables,
  `>` fact boxes, `[ছবি: …]` image placeholders and `<!-- উৎস: … -->` source comments.
- Repeating item formats that matter to the admin:
  - **MCQ**: `১. question` and then an options block (`ক) … খ) …` / `ⓐ … ⓑ …`) that ends
    with `**উত্তর: ঘ**` / `**Ans. b**`.
  - **Q&A**: `**প্রশ্ন:** …` + `**উত্তর:** …` (also `**Ques:**` + `**Ans:**`).
  - **News item** (তথ্যপ্রবাহ): `**আন্তর্জাতিক ♦ ২৫ সেপ্টেম্বর ২০২৬**` + one or more bullets.

The old per-issue `… - Website.html` files are standalone exports. They stay as they are
and the new site does not use them.

## 2. Goals

| ID | Requirement |
|----|-------------|
| G1 | A static site that GitHub Pages can host from the repository root (`/index.html`). |
| G2 | The landing page shows the **latest issue** in full. |
| G3 | An **archive** page lists every issue (newest first). Any issue can be opened. |
| G4 | An **admin** can log in. Credentials live in a file (`data/users.json`) as salted PBKDF2 hashes. No database. |
| G5 | When logged in, every content item and every chapter gets an **instruction box**. The instruction is queued so **Claude** can rewrite that exact item. |
| G6 | When logged in, every item gets a **Delete** action. This covers MCQ (question + options + answer), Q&A (question + answer) and news items (date header + bullets). Other paragraphs, lists and tables get it too. |
| G7 | The Markdown source stays the single source of truth. Changes are written back to the `.md` file and the HTML is regenerated. |
| G8 | Adding a new monthly issue means adding one entry to `issues.config.json` and running the build. |

## 3. Non-goals (v1)

- Real server-side security on GitHub Pages. Pages is static, so the login there only hides the admin UI.
  Writes are protected by the GitHub token or by running locally (see §6).
- Reader accounts, comments and full-text search across issues. Search covers the open issue only.
- WYSIWYG editing. All content edits go through Claude or a direct Markdown edit.

## 4. User stories & acceptance criteria

**US1 — Reader opens the site.**
- `/index.html` renders the newest issue (highest `id` in `issues.config.json`).
- The header has: brand, "সব সংখ্যা" (archive) link, search, font size, theme toggle.
- The sidebar TOC is grouped by section (অংশ), with scroll-spy. Mobile gets a drawer.

**US2 — Reader browses past issues.**
- `/archive.html` shows one card per issue: title, month, chapter count, page count and
  a "সর্বশেষ" badge on the latest one. Clicking a card opens `/issues/<id>/`.

**US3 — Admin logs in.**
- `/admin.html` takes username + password. It checks them against `data/users.json`
  (PBKDF2-SHA256, 100 000 iterations, per-user salt).
- On success the session is kept in `sessionStorage` for 8 hours. The admin bar appears on every issue page.
- A wrong password shows an error. There is no lockout in v1.

**US4 — Admin gives an instruction.**
- Each item (`[data-bid]`) shows a small toolbar: ✎ নির্দেশনা · 🗑 মুছুন. Each chapter header also has ✎.
- ✎ opens a textarea. Saving it creates an edit
  `{id, type:"instruction", issue, chapter, blockId, text(original markdown), instruction, status:"pending", createdAt, by}`.
- The item shows a "pending" badge until the edit is applied.

**US5 — Admin deletes an item.**
- 🗑 asks for confirmation. It then creates an edit `{type:"delete", …}`. The item is hidden at once
  in the admin's view. Once applied, the exact Markdown text is removed from the source and the issue is rebuilt.

**US6 — Edits reach Claude.**
- **Local mode** (`node tools/server.mjs`): edits are written straight to `data/edits.json`.
  "এখনই প্রয়োগ করুন" applies the deletes, then runs the Claude Code CLI headless with the
  instruction prompt (`.claude/commands/apply-edits.md`), then rebuilds.
- **GitHub Pages mode**: edits are kept in the browser. "GitHub-এ পাঠান" commits them to
  `data/edits.json` through the GitHub Contents API with a fine-grained token that the admin enters
  (repo contents: read/write; kept in `sessionStorage` only). The workflow
  `.github/workflows/apply-edits.yml` then applies the deletes, runs Claude for the instructions
  (needs the `ANTHROPIC_API_KEY` secret), rebuilds and commits.
- **Manual**: "JSON ডাউনলোড" exports the queue. The admin then runs `/apply-edits` in Claude Code locally.

**US7 — Publisher adds a new issue.**
- Add `{id:"2027-01", folder, source}` to `issues.config.json` → `node tools/build.mjs`.
  The new issue becomes the landing page and appears in the archive.

## 5. Block model (stable IDs)

A chapter's body is split into raw blocks at blank lines. These are grouped into **items**:

| kind | rule |
|------|------|
| `mcq` | Numbered question (`১.`/`1.`), plus the following blocks that start with `ক)`/`(ক)`/`ⓐ`/`a)`/`(a)`, plus the answer line |
| `qa` | `**প্রশ্ন…`/`**Ques…`/`**Q.` block + the next `**উত্তর…`/`**Ans…` block |
| `news` | Bold-only line containing `♦` + the list blocks that follow |
| `heading` | `###` / `####` (instruction only, no delete) |
| `content` | Any other paragraph, list, table, quote or image |
| (structural) | page markers, running headers, `---`, source comments: no admin tools |

`blockId = "b" + fnv1a32(normalized markdown of the item)`. Duplicates in one issue get `-2`, `-3`, …
IDs stay the same when other items are deleted. The exact Markdown is stored in each edit,
so the edit applies by text match even if line numbers have changed.

## 6. Security notes

- On GitHub Pages, `data/users.json` is public. Hashes use PBKDF2 with 100k iterations, so use a strong password.
  The client-side check only hides the admin UI. Nothing on Pages can change the repo without a GitHub
  token that has write access.
- In local mode the server checks the password itself and issues a random in-memory bearer token.
  The write APIs need that token. The server binds to `127.0.0.1` only.
- The GitHub token is never stored in the repo or in `localStorage`. It lives in `sessionStorage` only.

## 7. Open questions

- Should the old PDF parts be linked from the November issue page? (v1: yes, as downloads.)
- Should the multiple `chapters/*.md` drafts for December be kept in sync? (v1: no. The Full Book is canonical.)
