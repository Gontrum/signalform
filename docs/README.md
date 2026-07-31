# Signalform Documentation

Start here. Every document below has exactly one job — if two ever say the
same thing, the more specific one is wrong and should be deleted.

## Using Signalform

| Document                           | What it answers                             |
| ---------------------------------- | ------------------------------------------- |
| [`../README.md`](../README.md)     | What Signalform is, install, run, configure |
| [`../SECURITY.md`](../SECURITY.md) | How to report a vulnerability               |

## Contributing

Read in this order:

| Document                                                             | What it answers                                   |
| -------------------------------------------------------------------- | ------------------------------------------------- |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md)                           | Fork, install, first PR — the 5-minute onboarding |
| [`contributing/development.md`](contributing/development.md)         | Daily commands, hot reload, debugging, env config |
| [`architecture.md`](architecture.md)                                 | **Canonical**: FCIS zones, import rules, diagrams |
| [`contributing/testing.md`](contributing/testing.md)                 | Test types, placement, coverage targets           |
| [`contributing/test-templates.md`](contributing/test-templates.md)   | Copy-paste templates per test type                |
| [`contributing/feature-example.md`](contributing/feature-example.md) | A feature built across all layers, end to end     |
| [`contributing/troubleshooting.md`](contributing/troubleshooting.md) | "It broke" — the recurring local failures         |

## Maintainers

| Document                             | What it answers                         |
| ------------------------------------ | --------------------------------------- |
| [`releasing.md`](releasing.md)       | Version bump, tag, what CI does for you |
| [`../CHANGELOG.md`](../CHANGELOG.md) | What shipped when                       |

## Rules for this directory

- **`architecture.md` is canonical.** `AGENTS.md` holds the short operative
  summary for day-to-day work; on disagreement, `architecture.md` wins.
- **No status, no plans, no audit reports here.** Documents in `docs/` describe
  how the project works _today_. Anything dated — review findings, migration
  plans, backlogs — belongs in `.scratch/` (untracked) and is deleted once
  executed. Old audits live in git history, not in the tree; they rot into
  misinformation the moment the code moves on.
- **Diagrams live next to the prose they explain**, as mermaid in the `.md`
  file. No separate diagram directory.
- **Filenames are lowercase-kebab.md.** Only root-level GitHub conventions
  (`README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE`) stay uppercase.
