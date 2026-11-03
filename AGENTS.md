# Agent instructions (autonomous engineer)

Cursor agents (IDE and cloud) should behave like an end-to-end engineer: take each task from understanding through verification and shipping. Do not stop at plans, partial diffs, or “next steps” unless blocked (see below).

## Workflow

1. **Understand** — Read the request, relevant code, and this file. Skim README and configs before editing.
2. **Plan briefly** — A short internal plan is enough; then implement. Do not deliver plan-only responses for implementation tasks.
3. **Implement** — Minimal, focused changes; match existing style and conventions. No debug leftovers or commented-out code.
4. **Verify for real** — Run the commands in [Project facts](#project-facts). Fix failures and re-run until green. For UI work, run the dev server or preview and confirm behavior in the browser when feasible.
5. **Tests** — There is no unit-test runner in this repo. Add or update tests only if a framework is introduced or the task adds one. Use `npm run test-yolo` / `npm run test-lane` when touching ML export or inference scripts (see package.json).
6. **Ship** — Commit on a feature branch, push, open a PR with: what changed, why, how you verified, assumptions, and follow-ups. Watch CI if present; fix until checks pass.
7. **Report** — End with a concise summary, verification evidence, and anything still open.

### Long-running work

Iterating for a long time is expected. Keep going until the task is actually done. Do not pause for approval on reversible technical choices; document assumptions in the PR.

### When to stop and ask

Only escalate for: secrets or credentials; destructive or irreversible actions (data deletion, force-push to shared branches, production deploys, spending money); or a genuinely ambiguous product decision. Otherwise decide reasonably and proceed.

### Code quality

Follow existing patterns in `src/`. Keep imports at module top. Prefer exhaustive handling for TypeScript discriminated unions. Leave the tree clean before pushing.

## Project facts

Verified from this repository (re-check if scripts change).

| Item | Detail |
|------|--------|
| **Project** | **fullselfcamera** — browser app that uses the device camera with on-device ML (ONNX via `onnxruntime-web`) for lane/path visualization (FSD-style overlay). |
| **Stack** | React 19, TypeScript, Vite 8, Tailwind CSS 4, Oxlint |
| **Key paths** | `src/components/` UI; `src/ml/` detectors and path logic; `src/engines/` path engine; `src/hooks/`; `public/models/` ONNX weights; `scripts/` export and smoke tests |
| **CI** | No `.github/workflows` in repo — rely on local verification before merge |

### Commands (from `package.json`)

```bash
# Install dependencies
npm ci

# Development (copies ORT WASM to public/ via predev)
npm run dev

# Production build — includes TypeScript project build (`tsc -b`) then Vite bundle
npm run build

# Lint (Oxlint)
npm run lint

# Serve production build locally
npm run preview

# Optional ML script smoke tests (Node; not part of default CI here)
npm run test-yolo
npm run test-lane
```

There is **no** separate `typecheck` or `test` script; typechecking runs as part of `npm run build`. There is **no** Vitest/Jest suite. Model tooling: `npm run copy-ort`, `npm run export-yolo`, `npm run export-lane`.

### Agent verification checklist

Before marking work done:

- [ ] `npm run build` succeeds
- [ ] `npm run lint` succeeds (warnings may exist; do not introduce new errors)
- [ ] UI changes manually checked via `npm run dev` or `npm run preview` when applicable
- [ ] PR opened with verification notes and assumptions
