# ia-dashboard — UI/UX Overhaul & Bulk Session Annotation

Restyle of the webapp (classic sober admin look) plus bulk "annotate / link"
of multiple OpenCode sessions to a feature at once.

Date: 2026-08-27. Decisions validated with the user by dialogue.

## Context & motivation

- The webapp currently lets you annotate/link **one** session at a time through a
  right-side drawer (`SessionActions.tsx`). The API only supports unitary linking
  (`POST /api/features/:id/sessions`) and **rejects** a session already linked to a
  feature (`BadRequestException: Session already linked to a feature`).
- The user wants:
  1. A classic, efficient, sober admin design (Linear/GitHub style), with a
     **left sidebar** navigation instead of the current horizontal top nav.
  2. **Multi-select** of sessions on the list, persisted across pages, to
     annotate/link several sessions to a feature **at the same time**.

## Validated decisions

| Topic | Choice |
|---|---|
| Bulk flow | Select N sessions → modal with **two tabs**: "New feature" (create + link) or "Existing feature" (pick + link). All selectable sessions get linked to one feature. |
| Selection model | `Set<string>` of session ids in React local state; **persists across pages** (list stays mounted). Per-page header checkbox toggles visible rows. |
| Already-annotated sessions | **Ignored with a warning**: excluded from the bulk link, counter shown ("X session(s) already linked, skipped"). |
| Bulk action placement | **Floating bottom bar** (fixed) when selection ≥ 1: "N selected · [Clear] [Annotate / Link]". |
| Design | Left **sidebar** nav + sober admin style: `gray-50` background, white cards, `gray-200` borders, `rounded-lg`, blue-600 primary actions. Light mode only (no dark toggle). |
| Approach | **B** — light reusable UI primitives (`src/components/ui/`) + refactor of all 5 views onto them. |

## Non-goals

- No dark mode toggle (not requested).
- No "select all matching filter" bulk action (only page + persisted selection).
- No bulk re-link of already-annotated sessions (risky: overwrites snapshots).
- No bulk unlink.
- No new Redux slices/thunks; selection is pure local UI state.

## Architecture

### UI primitives (`webapp/src/components/ui/`)

Small shared components, all Tailwind v4 + TypeScript, no extra deps:

- `Button` — variants `primary` / `secondary` / `danger` / `ghost`; optional
  `loading` prop (spinner + disabled).
- `Badge` — small status pill; `tone` (`green`/`gray`/`blue`/`amber`/`red`) for
  feature status + annotated badge.
- `Card` — white rounded bordered container.
- `Modal` — centered dialog (overlay, Escape + backdrop click to close, title,
  footer slot). Used for the bulk flow. The unitary `SessionActions` drawer keeps
  its right-drawer layout but is restyled onto the same primitives
  (`Field`/`Button`), so the whole app is visually consistent.
- `Field` — label + input/select/textarea with consistent styling.
- `Spinner`, `EmptyState`, `PageHeader` — helpers.

### Shell (`webapp/src/App.tsx`)

- Two-column layout: fixed left sidebar (brand "ia-dashboard", nav links
  `Sessions`, `Features`; `NavLink` active styling) + scrollable content area on
  `gray-50`.
- Routes unchanged (`/`, `/sessions`, `/features`, `/features/:id`).

### Sessions list (`webapp/src/views/SessionsView.tsx`)

- Add a **checkbox column**; header checkbox toggles the current page's rows.
- Columns: checkbox, Title (truncate + tooltip), Project, Model, **Date** (added,
  currently missing), Cost, In/Out, Status, actions.
- Selection state: `useState<Set<string>>` + `useRef` logic; selection is the
  **union** of checked ids, independent of the visible page.
- Filters in a dedicated `Card` with **Apply** and **Reset** buttons.
- Loading → skeleton rows; empty → `EmptyState`.

### Bulk action

- **Floating bottom bar** (fixed, shadow, `gray-50`/white) rendered when
  `selected.size > 0`: "N selected · [Clear] [Annotate / Link]".
- **Bulk modal** (`BulkLinkModal.tsx`):
  - Tab "New feature": `name` (pre-filled from first selected session title),
    `project` (from meta projects), `purpose`, `satisfaction` 1–5 → creates a
    feature then bulk-links.
  - Tab "Existing feature": select of existing features (loaded via
    `GET /api/features`) → bulk-links.
  - Only **non-annotated** selected sessions are eligible; already-annotated are
    counted and ignored with a warning line.
  - Result recap: "N sessions linked · M already linked, skipped". On success:
    clear selection, reload list.
- `api.` direct calls (same pattern as `SessionActions`): `api.createFeature`,
  new `api.bulkLinkSessions(featureId, sessionIds)`.

### API — bulk link endpoint

`api/src/features/features.controller.ts` + `features.service.ts`:

- `POST /api/features/:id/sessions/bulk` — body `{ sessionIds: string[] }` →
  `{ linked: string[], skipped: string[] }`.
- Service iterates ids: reads each session from the OpenCode reader (snapshot
  fields identical to `linkSession`), skips (without error) sessions **already
  linked** and **unknown** ids; inserts new `feature_sessions` rows; bumps
  `features.updated_at`.
- Reuses the snapshot mapping logic of `linkSession`. Route ordering: define
  `sessions/bulk` before `sessions/:sessionId` patterns if any overlap.

### Features views

- `FeaturesView`: cards via `Card` + `Badge` (status colors: planned=gray,
  in_progress=blue, done=green, abandoned=red) + local name search input.
- `FeatureDetail`: stats banner (total cost, tokens in/out, session count, time
  spent) + linked-sessions table restyled (ghost/danger buttons for
  resync/unlink).
- `FeatureForm`: restyled via `Field`/`Button`.

## Data flow

1. List load from SQLite (unchanged). Selection is client-only state.
2. Bulk link: client computes eligible (non-annotated) selected ids → one API
   call `POST /api/features/:id/sessions/bulk`.
3. Server snapshots each eligible session (reader) + inserts rows, skips
   already-linked/unknown, returns `{ linked, skipped }`.
4. Client shows recap, clears selection, reloads session list.

## Error handling & edge cases

- Bulk with all sessions already-linked → still succeeds with `linked: []`,
  modal shows "0 linked · M skipped".
- Empty `sessionIds` → `BadRequestException`.
- Feature not found → `NotFoundException` (existing `findOne` behavior).
- Session read failure in reader → treated as skipped (counted).
- Bulk modal: disable submit while busy, show inline error on failure, allow
  retry without losing selection.

## Testing

- `api/` (Jest): `features.service.spec.ts` — bulk link: links multiple, skips
  already-linked, skips unknown ids, returns linked/skipped arrays; empty body
  → 400; feature missing → 404.
- `webapp/` (Vitest): pure-logic tests for `lib/selection.ts` (toggle, page
  toggle-all, persisted union, bulk eligibility skip of already-annotated).
  No component-test infra exists (no jsdom/@testing-library), so components are
  verified by typecheck + manual dev run — no new dependencies are introduced.
- `pnpm test` at root runs both.

## Constraints (policies)

- Tailwind v4 + classic Redux (no slices/thunks) — selection stays local React
  state; API calls via `api.` direct (as `SessionActions` already does).
- TypeScript everywhere; code/comments in English.