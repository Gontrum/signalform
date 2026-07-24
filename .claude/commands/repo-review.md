---
description: Audit one aspect of the repo (harness, architecture, tests, ...) and write findings to docs/review/NN-<topic>.md
argument-hint: <topic>
---

Audit $ARGUMENTS for this repo. Do not change any files. Read the relevant
config/code, evaluate strictly, and write the report to the next free
`docs/review/NN-<topic>.md` slot. Every recommendation must be a concrete
file diff in a code block, justified by the specific failure it prevents —
no unjustified suggestions, no prose-only recommendations.
