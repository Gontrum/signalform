---
description: Audit one aspect of the repo (harness, architecture, tests, ...) and write findings to .scratch/reviews/<date>-<topic>.md
argument-hint: <topic>
---

Audit $ARGUMENTS for this repo. Do not change any files. Read the relevant
config/code, evaluate strictly, and write the report to
`.scratch/reviews/YYYY-MM-DD-<topic>.md`. Every recommendation must be a
concrete file diff in a code block, justified by the specific failure it
prevents — no unjustified suggestions, no prose-only recommendations.

Reports are working notes, not documentation: `.scratch/` is untracked, and
the report is deleted once its findings are implemented or rejected. Never
write audit findings into `docs/` — that directory describes how the project
works today, and a dated snapshot there rots into misinformation. Durable
knowledge an audit uncovers (how a subsystem actually works, an invariant
nobody had written down) belongs in the matching `docs/` file as a normal
edit, in the present tense, without the audit framing.
