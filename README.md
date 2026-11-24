# কারেন্ট অ্যাফেয়ার্স — Monthly Magazine Site

A static site generated from each issue's Full Book Markdown. It is hosted on GitHub Pages.
Spec, plan and tasks are in [`specs/001-magazine-site/`](specs/001-magazine-site/spec.md).

| Page | What |
|------|------|
| `index.html` | Latest issue (landing page) |
| `archive.html` | All issues |
| `issues/<id>/` | One issue |
| `admin.html` | Admin login |

## Build

```bash
node tools/build.mjs
```

Node 18+ is needed. There are no npm dependencies. The generated HTML is committed, so Pages serves it as is.

## Add a new monthly issue

1. Put the issue folder in the repo, e.g. `January 2027/January 2027 - Full Book.md`. Follow the same Markdown conventions.
2. Add an entry at the top of `issues.config.json` (`id` like `2027-01`, `month`, `folder`, `source`, optional `pdfs`).
3. Run `node tools/build.mjs` and commit. The new issue becomes the landing page.

## Admin

Users are stored in `data/users.json` (salted PBKDF2 hashes).

```bash
node tools/user.mjs add <username>            # prints a random password
node tools/user.mjs passwd <username> <password>
node tools/user.mjs remove <username>
```

After logging in, every MCQ, Q&A, news item, paragraph and heading gets **✎ নির্দেশনা** (instruction for Claude) and **🗑 মুছুন** (delete). Every chapter gets a chapter-level instruction box.

### Local mode (recommended for editing)

```bash
node tools/server.mjs
```

Open http://127.0.0.1:8080/admin.html. Deletions are written to the Markdown and the site rebuilds at once.
Instructions are queued in `data/edits.json`. **🤖 এখনই Claude দিয়ে প্রয়োগ করুন** runs the Claude Code CLI (`claude -p`) to apply them.
You can also run `/apply-edits` yourself in Claude Code.

### GitHub Pages mode

Edits are kept in the browser. **⬆ GitHub-এ পাঠান** commits them to `data/edits.json` with a fine-grained token
(this repo only, *Contents: Read and write*). The workflow `.github/workflows/apply-edits.yml` then applies the deletes,
runs Claude for the instructions, rebuilds and commits. Add the repo secret `ANTHROPIC_API_KEY` to enable the Claude step.

> On Pages, the login only hides the admin UI (`users.json` is public). Real write access comes from the GitHub token. Use a strong password.

## Publish on GitHub Pages

Repository **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`**.
The site will be at `https://<owner>.github.io/CurrentAffairs/`.
