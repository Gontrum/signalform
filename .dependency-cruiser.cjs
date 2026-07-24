/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      // ponytail: this is the only rule here on purpose. FCIS layering
      // (core/ vs shell/) is already enforced by eslint-plugin-boundaries
      // in each package's eslint.config.js, unresolvable imports are
      // already caught by `pnpm type-check`, and unused files/exports are
      // already caught by knip. Import cycles are the one thing nothing
      // else in the toolchain checks — that's what dependency-cruiser is
      // for here. Add more rules only when a real duplicate-import-path or
      // layering gap shows up that the existing tools actually miss.
      name: "no-circular",
      severity: "error",
      comment: "Import cycles hide load-order bugs and break module isolation.",
      from: {},
      to: { circular: true },
    },
    {
      // ponytail: the FCIS layering itself (core -> shell) is already caught
      // by eslint-plugin-boundaries. The one thing boundaries can't see is a
      // Node builtin import — those need no relative path, so only
      // dependency-cruiser's dependencyTypes classification catches them.
      name: "core-no-node-builtins",
      severity: "error",
      comment: "Functional core must not perform I/O — a Node builtin import means I/O leaked in.",
      from: { path: "(^|/)core/" },
      to: { dependencyTypes: ["core"] },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
  },
};
