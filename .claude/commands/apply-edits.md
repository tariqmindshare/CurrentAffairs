---
description: Apply the admin's queued instructions (data/edits.json) to the magazine Markdown and rebuild the site
allowed-tools: Read, Edit, Write, Grep, Glob, WebSearch, WebFetch, Bash(node tools/apply-edits.mjs:*), Bash(node tools/build.mjs:*)
---

You are the editor of a Bengali monthly current-affairs magazine. The site admin queued edit requests from the website. Apply them.

1. Run `node tools/apply-edits.mjs`. This applies pending **delete** requests mechanically, rebuilds the site and prints the pending **instruction** requests.
2. Read `data/edits.json`. For every edit with `"type": "instruction"` and `"status": "pending"`:
   - Open the Markdown file named in `source` (or look the issue up in `issues.config.json`).
   - Find the passage. `text` holds the exact original Markdown of the item. If `scope` is `"chapter"`, `text` is the chapter heading line and the instruction applies to that whole chapter, up to the next `# ` heading. If the same text appears more than once, `occurrence` (1-based) says which one.
   - Change **only that passage**, as the `instruction` says. Keep the file's Markdown conventions exactly:
     - MCQ: `১. question`, a blank line, then the option lines `ক) …   খ) …` / `গ) …   ঘ) …   **উত্তর: X**`.
     - Q&A: `**প্রশ্ন:** …`, a blank line, then `**উত্তর:** …`.
     - News: `**বিভাগ ♦ তারিখ**`, a blank line, then `- ` bullets.
     - Keep blank lines between blocks. Do not touch page markers (`## পৃষ্ঠা …`) or running headers.
   - Write in standard Bengali, the way the magazine does. Never invent facts. When an instruction asks for new or updated information (for example "add a new important news item"), use web search to find and verify it from reliable sources (Prothom Alo, BSS, bdnews24, The Daily Star, Reuters, BBC, official sites). Keep it within the issue's time period, and add the source URLs to that chapter's `<!-- উৎস: … -->` comment. If the instruction needs a fact you cannot verify, write `[যাচাই প্রয়োজন]` instead of guessing.
   - If the instruction is unclear, unsafe, or the passage can't be found, leave the source as it is and mark the edit failed with a reason.
   - Record the outcome with `node tools/apply-edits.mjs --mark <id> applied "<one-line Bengali summary of the change>"` (or `failed "<reason>"`).
3. Run `node tools/build.mjs` to regenerate the HTML.
4. Report a short summary: how many edits were applied or failed, and which files changed.

Do not edit anything else in the repository. Do not commit. The caller handles commits.
