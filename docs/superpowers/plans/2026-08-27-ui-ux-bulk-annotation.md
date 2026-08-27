# UI/UX Overhaul & Bulk Session Annotation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the ia-dashboard webapp into a sober classic admin design (left sidebar, Linear/GitHub-like) and add bulk selection of sessions to annotate/link several of them to one feature at once.

**Architecture:** Two layers. API: a new bulk link endpoint `POST /api/features/:id/sessions/bulk` that snapshots many sessions and returns `{ linked, skipped }` (skipping already-linked/unknown ids instead of erroring). Webapp: a small set of reusable UI primitives (`src/components/ui/`), pure selection logic (`src/lib/selection.ts`, persisted-across-pages `Map<id, annotated>` local state), a restyled sessions table with checkbox column, a floating bottom action bar, and a `BulkLinkModal` with "new feature" / "existing feature" tabs.

**Tech Stack:** NestJS + Drizzle (api), React 19 + Vite + Tailwind v4 + classic Redux (webapp), Vitest (webapp), Jest (api), pnpm workspace.

## Global Constraints

- No new npm dependencies in either package.
- Classic Redux only: no slices/thunks; existing `apiMiddleware` `*_REQUESTED → *_START/_SUCCESS/_ERROR` pattern untouched. Bulk/feature writes go through direct `api.` calls (the existing `SessionActions` pattern), not the middleware.
- Selection state is React local state (`useState<Map<string, boolean>>`), never Redux.
- TypeScript everywhere; code and comments in English; communication with the user in French.
- Tailwind v4 utility classes only (no custom CSS, no component classes in `index.css`).
- Light mode only; sober palette: `gray-50` page, white cards, `gray-200` borders, `rounded-lg`, `blue-600` primary actions.
- Tests: `pnpm --filter @ia-dashboard/api test` (Jest) and `pnpm --filter @ia-dashboard/webapp test` (Vitest). Typecheck: `pnpm --filter @ia-dashboard/webapp typecheck` and `pnpm --filter @ia-dashboard/api typecheck`.
- The single-session `linkSession` endpoint keeps its current reject-if-linked behavior. Only the new bulk endpoint skips.

---

### Task 1: API — bulk link endpoint

**Files:**
- Modify: `api/src/features/features.service.ts`
- Modify: `api/src/features/features.controller.ts`
- Test: `api/src/features/features.service.spec.ts`

**Interfaces:**
- Consumes: existing `FeaturesService.findOne`, `OpenCodeReader.getSession`, Drizzle `featureSessions`/`features` tables.
- Produces: `FeaturesService.bulkLinkSessions(featureId: string, sessionIds: string[]): Promise<{ linked: string[]; skipped: string[] }>` and controller route `POST /api/features/:id/sessions/bulk` (body `{ sessionIds: string[] }`).

- [ ] **Step 1: Write the failing tests**

Append a `describe("bulkLinkSessions", ...)` block to `api/src/features/features.service.spec.ts`, plus a fixture and a `beforeEach` reset. The shared `readerMock.getSession` currently has `mockReturnValue(...)`; reset it per-test inside the new describe so the "unknown id" test can override safely.

Add this right after the `const db = ...` / `readerMock` fixtures at the top of the describe section (place at end of file, after the existing `describe("FeaturesService", ...)` block):

```ts
describe("bulkLinkSessions", () => {
  const sessionFixture = {
    id: "s1",
    projectId: "p1",
    projectName: "gateway",
    title: "Add auth",
    model: "deepseek-v4-flash-free",
    agent: "build",
    cost: 1.25,
    tokensInput: 100,
    tokensOutput: 200,
    tokensReasoning: 50,
    tokensCacheRead: 300,
    tokensCacheWrite: 0,
    summaryAdditions: 10,
    summaryDeletions: 5,
    summaryFiles: 3,
    timeCreated: 1785702292033,
    timeUpdated: 1785703020414,
  };

  beforeEach(() => {
    (readerMock.getSession as jest.Mock).mockReturnValue(sessionFixture);
  });

  it("links multiple sessions and skips already-linked ones", async () => {
    const db = makeDb(
      [{ id: "f1", name: "Auth" }], // findOne: feature row
      [],                           // findOne: linked sessions list
      [{ sessionId: "s2" }],        // existing-link check
      [{ id: "fs1" }],              // insert snapshot for s1
      [{ id: "fs3" }],              // insert snapshot for s3
      [],                           // update feature.updatedAt
    );
    const svc = new FeaturesService(db as any, readerMock as any);
    const out = await svc.bulkLinkSessions("f1", ["s1", "s2", "s3"]);
    expect(out.linked).toEqual(["s1", "s3"]);
    expect(out.skipped).toEqual(["s2"]);
    expect(readerMock.getSession).toHaveBeenCalledWith("s1");
    expect(readerMock.getSession).toHaveBeenCalledWith("s3");
  });

  it("skips unknown session ids", async () => {
    (readerMock.getSession as jest.Mock).mockImplementation((id: string) =>
      id === "s9" ? undefined : sessionFixture,
    );
    const db = makeDb(
      [{ id: "f1" }], // findOne: feature row
      [],             // findOne: linked sessions list
      [],             // existing-link check
    );
    const svc = new FeaturesService(db as any, readerMock as any);
    const out = await svc.bulkLinkSessions("f1", ["s9"]);
    expect(out.linked).toEqual([]);
    expect(out.skipped).toEqual(["s9"]);
  });

  it("rejects an empty sessionIds array", async () => {
    const db = makeDb();
    const svc = new FeaturesService(db as any, readerMock as any);
    await expect(svc.bulkLinkSessions("f1", [])).rejects.toThrow(BadRequestException);
  });

  it("throws NotFoundException when the feature is missing", async () => {
    const db = makeDb([]);
    const svc = new FeaturesService(db as any, readerMock as any);
    await expect(svc.bulkLinkSessions("missing", ["s1"])).rejects.toThrow(NotFoundException);
  });
});
```

`BadRequestException` must be imported at the top of the spec (line 1 currently imports `NotFoundException` from `@nestjs/common`):

```ts
import { BadRequestException, NotFoundException } from "@nestjs/common";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @ia-dashboard/api test -- features.service.spec`
Expected: FAIL — `bulkLinkSessions is not a function`.

- [ ] **Step 3: Implement `bulkLinkSessions` in the service**

Add to `api/src/features/features.service.ts`, after the existing `linkSession` method (line ~132). `inArray`, `eq`, `features`, and `featureSessions` are already imported:

```ts
async bulkLinkSessions(featureId: string, sessionIds: string[]) {
  if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
    throw new BadRequestException("sessionIds must be a non-empty array");
  }
  await this.findOne(featureId);
  const linked: string[] = [];
  const skipped: string[] = [];
  const existingRows = await this.db
    .select({ sessionId: featureSessions.sessionId })
    .from(featureSessions)
    .where(inArray(featureSessions.sessionId, sessionIds));
  const already = new Set(existingRows.map((r) => r.sessionId));
  for (const sessionId of sessionIds) {
    if (already.has(sessionId)) {
      skipped.push(sessionId);
      continue;
    }
    const s = this.reader.getSession(sessionId);
    if (!s) {
      skipped.push(sessionId);
      continue;
    }
    await this.db.insert(featureSessions).values({
      featureId,
      sessionId: s.id,
      title: s.title,
      model: s.model,
      agent: s.agent,
      cost: s.cost,
      tokensInput: s.tokensInput,
      tokensOutput: s.tokensOutput,
      tokensReasoning: s.tokensReasoning,
      tokensCacheRead: s.tokensCacheRead,
      tokensCacheWrite: s.tokensCacheWrite,
      timeCreated: new Date(s.timeCreated),
      timeUpdated: new Date(s.timeUpdated),
      summaryAdditions: s.summaryAdditions,
      summaryDeletions: s.summaryDeletions,
      summaryFiles: s.summaryFiles,
    });
    linked.push(sessionId);
  }
  if (linked.length > 0) {
    await this.db
      .update(features)
      .set({ updatedAt: new Date() })
      .where(eq(features.id, featureId));
  }
  return { linked, skipped };
}
```

- [ ] **Step 4: Add the controller route**

Add to `api/src/features/features.controller.ts`, directly after the existing `@Post(":id/sessions")` `link` method (line ~45):

```ts
@Post(":id/sessions/bulk")
bulkLink(@Param("id") id: string, @Body() body: { sessionIds: string[] }) {
  return this.svc.bulkLinkSessions(id, body.sessionIds);
}
```

No route-ordering conflict: `@Post(":id/sessions")` is exact and `@Delete(":id/sessions/:sessionId")` is a different method.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @ia-dashboard/api test -- features.service.spec`
Expected: PASS (all 4 new tests plus the existing suite).

Run: `pnpm --filter @ia-dashboard/api typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/features/features.service.ts api/src/features/features.controller.ts api/src/features/features.service.spec.ts
git commit -m "feat(api): bulk link sessions to a feature, skipping already-linked"
```

---

### Task 2: Webapp — UI primitives

**Files:**
- Create: `webapp/src/components/ui/Button.tsx`
- Create: `webapp/src/components/ui/Badge.tsx`
- Create: `webapp/src/components/ui/Card.tsx`
- Create: `webapp/src/components/ui/Modal.tsx`
- Create: `webapp/src/components/ui/Field.tsx`
- Create: `webapp/src/components/ui/Spinner.tsx`
- Create: `webapp/src/components/ui/EmptyState.tsx`
- Create: `webapp/src/components/ui/PageHeader.tsx`

**Interfaces:**
- Consumes: nothing (standalone).
- Produces: `Button` (variants primary/secondary/danger/ghost, `loading`), `Badge` (tone gray/green/blue/amber/red), `Card`, `Modal` (`title`, `onClose`, `children`, `footer?`), `Field` + `TextInput`/`TextArea`/`Select`, `Spinner`, `EmptyState`, `PageHeader` (`title`, `subtitle?`, `actions?`).

- [ ] **Step 1: Write `Spinner.tsx`**

```tsx
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}
```

- [ ] **Step 2: Write `Button.tsx`**

```tsx
import { ButtonHTMLAttributes } from "react";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const styles: Record<Variant, string> = {
  primary: "bg-blue-600 text-white hover:bg-blue-700",
  secondary: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-gray-600 hover:bg-gray-100",
};

export function Button({
  variant = "secondary",
  loading = false,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  const isDisabled = disabled || loading;
  return (
    <button
      {...rest}
      disabled={isDisabled}
      className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    >
      {loading && <Spinner className="size-3.5" />}
      {children}
    </button>
  );
}
```

- [ ] **Step 3: Write `Badge.tsx`**

```tsx
import { ReactNode } from "react";

type Tone = "gray" | "green" | "blue" | "amber" | "red";

const tones: Record<Tone, string> = {
  gray: "bg-gray-100 text-gray-600",
  green: "bg-green-100 text-green-700",
  blue: "bg-blue-100 text-blue-700",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
};

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 4: Write `Card.tsx`**

```tsx
import { ReactNode } from "react";

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-lg border border-gray-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}
```

- [ ] **Step 5: Write `Field.tsx`** (`Field`, `TextInput`, `TextArea`, `Select` — `className` props are merged onto the shared input style so callers can set widths)

```tsx
import {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export const fieldInputClass =
  "w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}

export function TextInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldInputClass} ${className}`} />;
}

export function TextArea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${fieldInputClass} ${className}`} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${fieldInputClass} ${className}`} />;
}
```

- [ ] **Step 6: Write `Modal.tsx`** (Escape + backdrop click to close, `stopPropagation` on the panel)

```tsx
import { ReactNode, useEffect } from "react";

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Write `EmptyState.tsx` and `PageHeader.tsx`**

`webapp/src/components/ui/EmptyState.tsx`:

```tsx
export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-gray-500">
      <p className="text-sm">{message}</p>
    </div>
  );
}
```

`webapp/src/components/ui/PageHeader.tsx`:

```tsx
import { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}
```

- [ ] **Step 8: Typecheck**

Run: `pnpm --filter @ia-dashboard/webapp typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add webapp/src/components/ui
git commit -m "feat(webapp): add shared UI primitives (Button, Badge, Card, Modal, Field, Spinner, EmptyState, PageHeader)"
```

---

### Task 3: Webapp — selection logic

**Files:**
- Create: `webapp/src/lib/selection.ts`
- Test: `webapp/src/lib/selection.spec.ts`

**Interfaces:**
- Consumes: `SessionRow` shape only structurally (rows are `{ id: string; annotated: boolean }`).
- Produces: pure helpers over `Map<string, boolean>` (session id → annotated at selection time):
  - `setSelection(sel, entry: { id: string; annotated: boolean }, checked: boolean): Map<string, boolean>`
  - `toggleVisibleSelection(sel, rows: { id: string; annotated: boolean }[]): Map<string, boolean>`
  - `allVisibleSelected(sel, rows): boolean`
  - `someVisibleSelected(sel, rows): boolean`
  - `computeBulkEligibility(sel): { eligible: string[]; skipped: number }`

- [ ] **Step 1: Write the failing test**

`webapp/src/lib/selection.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  allVisibleSelected,
  computeBulkEligibility,
  setSelection,
  someVisibleSelected,
  toggleVisibleSelection,
} from "./selection";

describe("selection", () => {
  it("setSelection adds an entry with its annotated flag and removes it when unchecked", () => {
    const added = setSelection(new Map(), { id: "s1", annotated: false }, true);
    expect(added.get("s1")).toBe(false);
    const removed = setSelection(added, { id: "s1", annotated: false }, false);
    expect(removed.has("s1")).toBe(false);
  });

  it("computeBulkEligibility excludes annotated sessions and counts them as skipped", () => {
    const sel = new Map<string, boolean>([
      ["s1", false],
      ["s2", false],
      ["s3", true],
    ]);
    expect(computeBulkEligibility(sel)).toEqual({ eligible: ["s1", "s2"], skipped: 1 });
  });

  it("allVisibleSelected / someVisibleSelected reflect the visible rows", () => {
    const rows = [
      { id: "s1", annotated: false },
      { id: "s2", annotated: true },
    ];
    const partial = new Map<string, boolean>([["s1", false]]);
    expect(allVisibleSelected(partial, rows)).toBe(false);
    expect(someVisibleSelected(partial, rows)).toBe(true);
    const full = new Map<string, boolean>([
      ["s1", false],
      ["s2", true],
    ]);
    expect(allVisibleSelected(full, rows)).toBe(true);
  });

  it("toggleVisibleSelection selects all visible rows or clears them", () => {
    const rows = [
      { id: "s1", annotated: false },
      { id: "s2", annotated: true },
    ];
    const selected = toggleVisibleSelection(new Map(), rows);
    expect(selected.get("s1")).toBe(false);
    expect(selected.get("s2")).toBe(true);
    const cleared = toggleVisibleSelection(selected, rows);
    expect(cleared.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @ia-dashboard/webapp test -- selection.spec`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

`webapp/src/lib/selection.ts`:

```ts
export type SelectionEntry = { id: string; annotated: boolean };
export type Selection = Map<string, boolean>;

export function setSelection(
  sel: ReadonlyMap<string, boolean>,
  entry: SelectionEntry,
  checked: boolean,
): Map<string, boolean> {
  const next = new Map(sel);
  if (checked) next.set(entry.id, entry.annotated);
  else next.delete(entry.id);
  return next;
}

export function toggleVisibleSelection(
  sel: ReadonlyMap<string, boolean>,
  rows: SelectionEntry[],
): Map<string, boolean> {
  const all = allVisibleSelected(sel, rows);
  const next = new Map(sel);
  if (all) {
    for (const r of rows) next.delete(r.id);
  } else {
    for (const r of rows) next.set(r.id, r.annotated);
  }
  return next;
}

export function allVisibleSelected(
  sel: ReadonlyMap<string, boolean>,
  rows: SelectionEntry[],
): boolean {
  return rows.length > 0 && rows.every((r) => sel.has(r.id));
}

export function someVisibleSelected(
  sel: ReadonlyMap<string, boolean>,
  rows: SelectionEntry[],
): boolean {
  return rows.some((r) => sel.has(r.id));
}

export function computeBulkEligibility(sel: ReadonlyMap<string, boolean>): {
  eligible: string[];
  skipped: number;
} {
  const eligible: string[] = [];
  let skipped = 0;
  for (const [id, annotated] of sel) {
    if (annotated) skipped++;
    else eligible.push(id);
  }
  return { eligible, skipped };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @ia-dashboard/webapp test -- selection.spec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/lib/selection.ts webapp/src/lib/selection.spec.ts
git commit -m "feat(webapp): selection helpers for persisted multi-select bulk linking"
```

---

### Task 4: Webapp — app shell (sidebar)

**Files:**
- Modify: `webapp/src/App.tsx`

**Interfaces:**
- Consumes: nothing new (views already exist).
- Produces: two-column layout — fixed left sidebar with brand + `Sessions`/`Features` nav links (active state highlighted), content area on `gray-50`. Routes unchanged.

- [ ] **Step 1: Rewrite `App.tsx`**

```tsx
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { SessionsView } from "./views/SessionsView";
import { FeaturesView } from "./views/FeaturesView";
import { FeatureDetail } from "./views/FeatureDetail";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-md px-3 py-1.5 text-sm font-medium ${
    isActive ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-100"
  }`;

export function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-gray-50">
        <aside className="w-52 shrink-0 border-r border-gray-200 bg-white">
          <div className="flex h-full flex-col gap-1 px-3 py-4">
            <div className="mb-3 px-3 text-lg font-semibold text-gray-900">ia-dashboard</div>
            <NavLink to="/sessions" className={navLinkClass}>
              Sessions
            </NavLink>
            <NavLink to="/features" className={navLinkClass}>
              Features
            </NavLink>
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-6">
          <Routes>
            <Route path="/" element={<SessionsView />} />
            <Route path="/sessions" element={<SessionsView />} />
            <Route path="/features" element={<FeaturesView />} />
            <Route path="/features/:id" element={<FeatureDetail />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @ia-dashboard/webapp typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add webapp/src/App.tsx
git commit -m "feat(webapp): sidebar layout shell"
```

---

### Task 5: Webapp — sessions list restyle with multi-select

**Files:**
- Modify: `webapp/src/views/SessionsView.tsx`

**Interfaces:**
- Consumes: primitives from Task 2 (`Badge`, `Button`, `Card`, `EmptyState`, `PageHeader`, `Select`, `Spinner`), selection helpers from Task 3, existing `SessionRow`/`RootState`/`SessionActions`.
- Produces: `SessionsView` with a checkbox column, header page-toggle (with `indeterminate` state), persisted `Map` selection, date column, restyled filters card, skeleton/empty states. The per-row "annotate / link" still opens the single-session `SessionActions` drawer. No bulk bar/modal yet (Task 6 wires those).

- [ ] **Step 1: Rewrite `SessionsView.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../store/store";
import { SessionRow } from "../store/sessions";
import { SessionActions } from "./SessionActions";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { Select } from "../components/ui/Field";
import { Spinner } from "../components/ui/Spinner";
import {
  allVisibleSelected,
  setSelection,
  someVisibleSelected,
  toggleVisibleSelection,
} from "../lib/selection";

function Filters({
  meta,
}: {
  meta: { projects: string[]; models: string[] };
}) {
  const dispatch = useDispatch();
  const [project, setProject] = useState("");
  const [model, setModel] = useState("");
  const [annotated, setAnnotated] = useState("");

  const apply = (f: Record<string, string>) => {
    dispatch({
      type: "SESSIONS_LOAD_REQUESTED",
      payload: {
        path: `/api/sessions?${new URLSearchParams({ page: "1", ...f }).toString()}`,
        filters: f,
      },
    });
  };

  const reset = () => {
    setProject("");
    setModel("");
    setAnnotated("");
    apply({});
  };

  return (
    <Card className="mb-4 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          className="w-44"
          value={project}
          onChange={(e) => setProject(e.target.value)}
        >
          <option value="">All projects</option>
          {meta.projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <Select
          className="w-44"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          <option value="">All models</option>
          {meta.models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
        <Select
          className="w-44"
          value={annotated}
          onChange={(e) => setAnnotated(e.target.value)}
        >
          <option value="">Any status</option>
          <option value="yes">Annotated</option>
          <option value="no">Not annotated</option>
        </Select>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => apply({ project, model, annotated })}>
            Apply
          </Button>
          <Button onClick={reset}>Reset</Button>
        </div>
      </div>
    </Card>
  );
}

const badgeFor = (s: SessionRow) =>
  s.annotated ? <Badge tone="green">annotated</Badge> : <Badge tone="gray">not annotated</Badge>;

export function SessionsView() {
  const dispatch = useDispatch();
  const { items, total, page, filters, meta, loading, error } = useSelector(
    (s: RootState) => s.sessions,
  );
  const [selected, setSelected] = useState<Map<string, boolean>>(new Map());
  const [single, setSingle] = useState<SessionRow | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams({ page: String(page), ...filters }).toString();
    dispatch({
      type: "SESSIONS_LOAD_REQUESTED",
      payload: { path: `/api/sessions?${qs}`, filters },
    });
  }, [dispatch, page, filters]);

  useEffect(() => {
    dispatch({ type: "META_LOAD_REQUESTED", payload: { path: "/api/sessions/meta" } });
  }, [dispatch]);

  const onToggle = (s: SessionRow, checked: boolean) =>
    setSelected((prev) => setSelection(prev, { id: s.id, annotated: s.annotated }, checked));

  const allSel = allVisibleSelected(selected, items);
  const someSel = someVisibleSelected(selected, items);

  return (
    <div>
      <PageHeader title="Sessions" subtitle={`${total} sessions`} />
      <Filters meta={meta} />
      {error && (
        <div className="mb-2 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</div>
      )}
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allSel}
                  aria-label="Select all on page"
                  ref={(el) => {
                    if (el) el.indeterminate = someSel && !allSel;
                  }}
                  onChange={() => setSelected((prev) => toggleVisibleSelection(prev, items))}
                />
              </th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Project</th>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2 text-right">Cost</th>
              <th className="px-3 py-2 text-right">In/Out</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={(e) => onToggle(s, e.target.checked)}
                  />
                </td>
                <td className="max-w-xs truncate px-3 py-2" title={s.title}>
                  {s.title}
                </td>
                <td className="px-3 py-2">{s.projectName}</td>
                <td className="px-3 py-2">{s.model}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {s.timeCreated ? new Date(s.timeCreated).toLocaleDateString() : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{s.cost.toFixed(2)} €</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {s.tokensInput} / {s.tokensOutput}
                </td>
                <td className="px-3 py-2">{badgeFor(s)}</td>
                <td className="px-3 py-2 text-right">
                  <Button variant="ghost" onClick={() => setSingle(s)}>
                    annotate / link
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && (
          <div className="flex items-center gap-2 p-4 text-sm text-gray-500">
            <Spinner /> Loading…
          </div>
        )}
        {!loading && items.length === 0 && (
          <EmptyState message="No sessions match the current filters." />
        )}
      </Card>
      <p className="mt-3 text-sm text-gray-500">Page {page}</p>

      {single && <SessionActions session={single} onClose={() => setSingle(null)} />}
    </div>
  );
}
```

Note: the `ref` callback is written to return `undefined` (body braces), which is required for React 19 ref callbacks.

- [ ] **Step 2: Typecheck and run existing tests**

Run: `pnpm --filter @ia-dashboard/webapp typecheck`
Expected: PASS.

Run: `pnpm --filter @ia-dashboard/webapp test`
Expected: PASS (existing reducer/middleware/selection specs).

- [ ] **Step 3: Commit**

```bash
git add webapp/src/views/SessionsView.tsx
git commit -m "feat(webapp): restyle sessions list with checkbox column and persisted selection"
```

---

### Task 6: Webapp — bulk link modal and floating action bar

**Files:**
- Create: `webapp/src/views/BulkLinkModal.tsx`
- Modify: `webapp/src/api/client.ts`
- Modify: `webapp/src/views/SessionsView.tsx`

**Interfaces:**
- Consumes: `api.bulkLinkSessions` (added here), `api.createFeature`, `api.features`, primitives, `computeBulkEligibility` (Task 3).
- Produces:
  - `api.bulkLinkSessions(id: string, sessionIds: string[]): Promise<{ linked: string[]; skipped: string[] }>`
  - `BulkLinkModal({ sessionIds, alreadyLinked, suggestedName, meta, onClose, onLinked })` where `meta` is `{ projects: string[] }` and `onLinked` is invoked after a successful bulk link (parent clears selection + reloads).

- [ ] **Step 1: Add `bulkLinkSessions` to the client**

Add to the `api` object in `webapp/src/api/client.ts`, after `resyncSession` (line ~38):

```ts
  bulkLinkSessions: (id: string, sessionIds: string[]) =>
    apiFetch<any>(`/api/features/${id}/sessions/bulk`, {
      method: "POST",
      body: JSON.stringify({ sessionIds }),
    }),
```

- [ ] **Step 2: Write `BulkLinkModal.tsx`**

```tsx
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Button } from "../components/ui/Button";
import { Field, Select, TextArea, TextInput } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";

type Tab = "new" | "existing";

export function BulkLinkModal({
  sessionIds,
  alreadyLinked,
  suggestedName,
  meta,
  onClose,
  onLinked,
}: {
  sessionIds: string[];
  alreadyLinked: number;
  suggestedName: string;
  meta: { projects: string[] };
  onClose: () => void;
  onLinked: () => void;
}) {
  const [tab, setTab] = useState<Tab>("new");
  const [name, setName] = useState(suggestedName);
  const [project, setProject] = useState(meta.projects[0] ?? "");
  const [purpose, setPurpose] = useState("");
  const [satisfaction, setSatisfaction] = useState(3);
  const [features, setFeatures] = useState<any[]>([]);
  const [featureId, setFeatureId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ linked: string[]; skipped: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== "existing") return;
    let cancelled = false;
    api
      .features()
      .then((f) => {
        if (cancelled) return;
        setFeatures(f);
        if (f.length > 0) setFeatureId(f[0].id);
      })
      .catch((e: any) => {
        if (!cancelled) setError(String(e.message ?? e));
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      let id = featureId;
      if (tab === "new") {
        const feat = await api.createFeature({
          name: name.trim() || suggestedName,
          project,
          purpose,
          satisfaction: Number(satisfaction),
        });
        id = feat.id;
      }
      const res = await api.bulkLinkSessions(id, sessionIds);
      setResult(res);
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Annotate / link ${sessionIds.length} session(s)`}
      onClose={onClose}
      footer={
        result ? (
          <Button variant="primary" onClick={onLinked}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={busy} loading={busy}>
              Link sessions
            </Button>
          </>
        )
      }
    >
      {error && <div className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</div>}
      {alreadyLinked > 0 && (
        <div className="mb-3 rounded-md bg-amber-50 p-2 text-sm text-amber-700">
          {alreadyLinked} session(s) already linked to a feature — they will be skipped.
        </div>
      )}

      {result ? (
        <div className="space-y-2 text-sm">
          <p className="text-green-700">
            <b>{result.linked.length}</b> session(s) linked.
          </p>
          <p className="text-gray-600">
            {result.skipped.length + alreadyLinked} session(s) skipped (already linked or unknown).
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex gap-2">
            <Button variant={tab === "new" ? "primary" : "secondary"} onClick={() => setTab("new")}>
              New feature
            </Button>
            <Button
              variant={tab === "existing" ? "primary" : "secondary"}
              onClick={() => setTab("existing")}
            >
              Existing feature
            </Button>
          </div>

          {tab === "new" ? (
            <div className="space-y-3">
              <Field label="Name">
                <TextInput value={name} placeholder={suggestedName} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Project">
                <Select value={project} onChange={(e) => setProject(e.target.value)}>
                  {meta.projects.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Purpose">
                <TextArea value={purpose} onChange={(e) => setPurpose(e.target.value)} />
              </Field>
              <Field label="Satisfaction (1–5)">
                <TextInput
                  type="number"
                  min={1}
                  max={5}
                  value={satisfaction}
                  onChange={(e) => setSatisfaction(Number(e.target.value))}
                />
              </Field>
            </div>
          ) : (
            <Field label="Feature">
              {features.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Spinner /> Loading features…
                </div>
              ) : (
                <Select value={featureId} onChange={(e) => setFeatureId(e.target.value)}>
                  {features.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} — {f.project}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
        </>
      )}
    </Modal>
  );
}
```

- [ ] **Step 3: Wire the floating bar + modal into `SessionsView.tsx`**

Edit the imports to add `BulkLinkModal`, `computeBulkEligibility`, and `useMemo` (the react import becomes `import { useEffect, useMemo, useState } from "react";`):

```tsx
import { BulkLinkModal } from "./BulkLinkModal";
import {
  allVisibleSelected,
  computeBulkEligibility,
  setSelection,
  someVisibleSelected,
  toggleVisibleSelection,
} from "../lib/selection";
```

Add state in the component (after the existing `const [single, setSingle] = ...` line):

```tsx
  const [bulkOpen, setBulkOpen] = useState(false);
```

Add, after `const someSel = someVisibleSelected(selected, items);`:

```tsx
  const { eligible, skipped } = computeBulkEligibility(selected);
  const suggestedName = useMemo(() => {
    const first = items.find((s) => selected.has(s.id));
    return first ? first.title : "";
  }, [items, selected]);
```

Add a reload helper used after linking (near the other dispatch effects or after the `useEffect`s):

```tsx
  const reload = () =>
    dispatch({
      type: "SESSIONS_LOAD_REQUESTED",
      payload: {
        path: `/api/sessions?${new URLSearchParams({ page: String(page), ...filters }).toString()}`,
        filters,
      },
    });
```

Replace the trailing `{single && <SessionActions .../>}` block with:

```tsx
      {single && <SessionActions session={single} onClose={() => setSingle(null)} />}

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 shadow-lg backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
            <span className="text-sm text-gray-700">
              <b>{eligible.length}</b> session(s) selected
              {skipped > 0 ? ` · ${skipped} already linked (skipped)` : ""}
            </span>
            <div className="flex gap-2">
              <Button onClick={() => setSelected(new Map())}>Clear</Button>
              <Button variant="primary" onClick={() => setBulkOpen(true)} disabled={eligible.length === 0}>
                Annotate / Link
              </Button>
            </div>
          </div>
        </div>
      )}

      {bulkOpen && (
        <BulkLinkModal
          sessionIds={eligible}
          alreadyLinked={skipped}
          suggestedName={suggestedName}
          meta={meta}
          onClose={() => setBulkOpen(false)}
          onLinked={() => {
            setBulkOpen(false);
            setSelected(new Map());
            reload();
          }}
        />
      )}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @ia-dashboard/webapp typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/api/client.ts webapp/src/views/BulkLinkModal.tsx webapp/src/views/SessionsView.tsx
git commit -m "feat(webapp): bulk annotate/link modal and floating selection bar"
```

---

### Task 7: Webapp — features views restyle

**Files:**
- Modify: `webapp/src/views/FeaturesView.tsx`
- Modify: `webapp/src/views/FeatureDetail.tsx`
- Modify: `webapp/src/views/FeatureForm.tsx`

**Interfaces:**
- Consumes: primitives from Task 2, existing `api`/Redux.
- Produces: restyled `FeaturesView` (cards + status badge + local name search), `FeatureDetail` (stats banner + restyled linked-sessions table), `FeatureForm` (styling only, same fields and save behavior).

- [ ] **Step 1: Rewrite `FeaturesView.tsx`**

```tsx
import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { RootState } from "../store/store";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { TextInput } from "../components/ui/Field";
import { PageHeader } from "../components/ui/PageHeader";

const statusTone: Record<string, "gray" | "green" | "blue" | "amber" | "red"> = {
  planned: "gray",
  in_progress: "blue",
  done: "green",
  abandoned: "red",
};

export function FeaturesView() {
  const dispatch = useDispatch();
  const { items, loading, error } = useSelector((s: RootState) => s.features);
  const [q, setQ] = useState("");

  useEffect(() => {
    dispatch({ type: "FEATURES_LOAD_REQUESTED", payload: { path: "/api/features" } });
  }, [dispatch]);

  const filtered = useMemo(
    () => items.filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase())),
    [items, q],
  );

  return (
    <div>
      <PageHeader title="Features" subtitle={`${items.length} features`} />
      {error && (
        <div className="mb-2 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</div>
      )}
      <div className="mb-4 max-w-sm">
        <TextInput
          placeholder="Search by name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {filtered.length === 0 && !loading ? (
        <EmptyState message="No features." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((f) => (
            <Link key={f.id} to={`/features/${f.id}`} className="block">
              <Card className="p-4 transition hover:border-gray-300 hover:shadow">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-gray-900">{f.name}</span>
                  <Badge tone={statusTone[f.status] ?? "gray"}>{f.status}</Badge>
                </div>
                <div className="mt-1 text-sm text-gray-600">
                  {f.project} · {f.sessionCount} sessions
                </div>
                <div className="mt-1 text-sm text-gray-700">
                  {Number(f.totalCost ?? 0).toFixed(2)} € · {f.totalTokensInput} /{" "}
                  {f.totalTokensOutput} tok
                  {f.satisfaction ? ` · ★${f.satisfaction}` : ""}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
      {loading && <p className="mt-2 text-sm text-gray-500">Loading…</p>}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `FeatureDetail.tsx`**

```tsx
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useParams, Link } from "react-router-dom";
import { api } from "../api/client";
import { RootState } from "../store/store";
import { FeatureForm } from "./FeatureForm";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { Spinner } from "../components/ui/Spinner";

export function FeatureDetail() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useDispatch();
  const { current, loading, error } = useSelector((s: RootState) => s.features);

  useEffect(() => {
    if (id) {
      dispatch({ type: "FEATURE_LOAD_REQUESTED", payload: { path: `/api/features/${id}` } });
    }
  }, [dispatch, id]);

  const reload = () =>
    dispatch({
      type: "FEATURE_LOAD_REQUESTED",
      payload: { path: `/api/features/${current.id}` },
    });

  if (loading && !current)
    return (
      <div className="flex items-center gap-2 p-6 text-gray-500">
        <Spinner /> Loading…
      </div>
    );
  if (!current) return <p className="p-6">Not found</p>;
  if (error) return <div className="p-6 text-red-700">{error}</div>;

  const totalCost = current.sessions.reduce((a: number, s: any) => a + Number(s.cost ?? 0), 0);
  const totalIn = current.sessions.reduce((a: number, s: any) => a + Number(s.tokensInput ?? 0), 0);
  const totalOut = current.sessions.reduce((a: number, s: any) => a + Number(s.tokensOutput ?? 0), 0);

  return (
    <div>
      <Link to="/features" className="text-sm text-blue-600 hover:underline">
        ← Back
      </Link>
      <PageHeader title={current.name} subtitle={`${current.project} · ${current.status}`} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-3">
          <div className="text-xs uppercase text-gray-500">Total cost</div>
          <div className="text-lg font-semibold tabular-nums">{totalCost.toFixed(2)} €</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs uppercase text-gray-500">Tokens in</div>
          <div className="text-lg font-semibold tabular-nums">{totalIn}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs uppercase text-gray-500">Tokens out</div>
          <div className="text-lg font-semibold tabular-nums">{totalOut}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs uppercase text-gray-500">Sessions</div>
          <div className="text-lg font-semibold tabular-nums">{current.sessions.length}</div>
        </Card>
      </div>
      {current.purpose && (
        <p className="mb-4 text-sm text-gray-700">
          <b>Purpose:</b> {current.purpose}
        </p>
      )}
      {current.comment && (
        <p className="mb-4 text-sm text-gray-700">
          <b>Comment:</b> {current.comment}
        </p>
      )}
      {current.tags?.length > 0 && (
        <p className="mb-4 text-sm text-gray-700">
          <b>Tags:</b> {current.tags.join(", ")}
        </p>
      )}
      <FeatureForm feature={current} />
      <h2 className="mb-2 mt-6 text-lg font-semibold">Linked sessions</h2>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2 text-right">Cost</th>
              <th className="px-3 py-2 text-right">In/Out</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2 text-right" />
            </tr>
          </thead>
          <tbody>
            {current.sessions.map((s: any) => (
              <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="max-w-xs truncate px-3 py-2" title={s.title}>
                  {s.title}
                </td>
                <td className="px-3 py-2">{s.model}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {Number(s.cost ?? 0).toFixed(2)} €
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {s.tokensInput} / {s.tokensOutput}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {s.timeCreated ? new Date(s.timeCreated).toLocaleDateString() : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      await api.resyncSession(current.id, s.sessionId);
                      reload();
                    }}
                  >
                    resync
                  </Button>
                  <Button
                    variant="danger"
                    className="ml-1"
                    onClick={async () => {
                      await api.unlinkSession(current.id, s.sessionId);
                      reload();
                    }}
                  >
                    unlink
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {current.sessions.length === 0 && <EmptyState message="No linked sessions yet." />}
      </Card>
    </div>
  );
}
```

Note: the linked-session table uses `s.id` as the row key (the `feature_sessions` snapshot id, as in the original code); the action buttons keep using `s.sessionId`.

- [ ] **Step 3: Rewrite `FeatureForm.tsx`** (styling only — same fields, validation-free submit, same `saved` feedback)

```tsx
import { useState } from "react";
import { useDispatch } from "react-redux";
import { api } from "../api/client";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Field, Select, TextArea, TextInput } from "../components/ui/Field";

export function FeatureForm({ feature }: { feature: any }) {
  const dispatch = useDispatch();
  const [name, setName] = useState(feature.name);
  const [purpose, setPurpose] = useState(feature.purpose ?? "");
  const [satisfaction, setSatisfaction] = useState(
    feature.satisfaction != null ? String(feature.satisfaction) : "",
  );
  const [status, setStatus] = useState(feature.status);
  const [comment, setComment] = useState(feature.comment ?? "");
  const [timeSpentMin, setTimeSpentMin] = useState(
    feature.timeSpentMin != null ? String(feature.timeSpentMin) : "",
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const reload = () =>
    dispatch({
      type: "FEATURE_LOAD_REQUESTED",
      payload: { path: `/api/features/${feature.id}` },
    });

  const submit = async () => {
    setBusy(true);
    await api.updateFeature(feature.id, {
      name,
      purpose,
      satisfaction: satisfaction === "" ? null : Number(satisfaction),
      status,
      comment,
      timeSpentMin: timeSpentMin === "" ? null : Number(timeSpentMin),
    });
    setBusy(false);
    setSaved(true);
    reload();
  };

  return (
    <Card className="mb-6 max-w-lg p-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" className="col-span-2">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Purpose" className="col-span-2">
          <TextArea value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option>planned</option>
            <option>in_progress</option>
            <option>done</option>
            <option>abandoned</option>
          </Select>
        </Field>
        <Field label="Satisfaction (1–5)">
          <TextInput
            type="number"
            min={1}
            max={5}
            value={satisfaction}
            onChange={(e) => setSatisfaction(e.target.value)}
          />
        </Field>
        <Field label="Time spent (min)" className="col-span-2">
          <TextInput
            type="number"
            value={timeSpentMin}
            onChange={(e) => setTimeSpentMin(e.target.value)}
          />
        </Field>
        <Field label="Comment" className="col-span-2">
          <TextArea value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
        <div className="col-span-2 flex items-center gap-3">
          <Button variant="primary" onClick={submit} disabled={busy} loading={busy}>
            Save
          </Button>
          {saved && <span className="text-sm text-green-700">Saved.</span>}
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @ia-dashboard/webapp typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/views/FeaturesView.tsx webapp/src/views/FeatureDetail.tsx webapp/src/views/FeatureForm.tsx
git commit -m "feat(webapp): restyle features views onto shared primitives"
```

---

### Task 8: Webapp — restyle the single-session drawer

**Files:**
- Modify: `webapp/src/views/SessionActions.tsx`

**Interfaces:**
- Consumes: primitives from Task 2, existing `api`/`SessionRow`/`RootState`.
- Produces: `SessionActions` restyled onto `Field`/`TextInput`/`TextArea`/`Select`/`Button`, keeping its right-drawer layout and its exact behaviors (create-and-link, unlink, resync, done/error states).

- [ ] **Step 1: Rewrite `SessionActions.tsx`**

```tsx
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { api } from "../api/client";
import { RootState } from "../store/store";
import { SessionRow } from "../store/sessions";
import { Button } from "../components/ui/Button";
import { Field, Select, TextArea, TextInput } from "../components/ui/Field";

function refreshSessions(dispatch: (a: any) => void) {
  dispatch({
    type: "SESSIONS_LOAD_REQUESTED",
    payload: { path: "/api/sessions?page=1", filters: {} },
  });
}

export function SessionActions({
  session,
  onClose,
}: {
  session: SessionRow;
  onClose: () => void;
}) {
  const dispatch = useDispatch();
  const meta = useSelector((s: RootState) => s.sessions.meta);
  const [name, setName] = useState("");
  const [project, setProject] = useState(meta.projects[0] ?? "");
  const [purpose, setPurpose] = useState("");
  const [satisfaction, setSatisfaction] = useState(3);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createAndLink = async () => {
    setBusy(true);
    setError(null);
    try {
      const feat = await api.createFeature({
        name: name || session.title,
        project,
        purpose,
        satisfaction: Number(satisfaction),
      });
      await api.linkSession(feat.id, session.id);
      setDone(true);
      refreshSessions(dispatch);
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    setError(null);
    try {
      if (session.featureId) {
        await api.unlinkSession(session.featureId, session.id);
      }
      refreshSessions(dispatch);
      onClose();
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const resync = async () => {
    setBusy(true);
    setError(null);
    try {
      if (session.featureId) {
        await api.resyncSession(session.featureId, session.id);
      }
      refreshSessions(dispatch);
      onClose();
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="h-full w-96 overflow-y-auto bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Annotate session</h2>
        <p className="mb-4 truncate text-sm text-gray-500" title={session.title}>
          {session.title}
        </p>
        {error && (
          <div className="mb-2 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</div>
        )}
        {done ? (
          <p className="text-green-700">
            Session linked to feature <b>{name || session.title}</b>.
          </p>
        ) : session.annotated ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-600">
              Already annotated — feature <code>{session.featureId}</code>.
            </p>
            <div className="flex justify-end gap-2">
              <Button onClick={onClose}>Close</Button>
              <Button onClick={resync} disabled={busy} loading={busy}>
                Resync snapshot
              </Button>
              <Button variant="danger" onClick={unlink} disabled={busy} loading={busy}>
                Unlink
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Field label="Name">
              <TextInput
                className="mb-2"
                value={name}
                placeholder={session.title}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Project">
              <Select
                className="mb-2"
                value={project}
                onChange={(e) => setProject(e.target.value)}
              >
                {meta.projects.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Purpose">
              <TextArea className="mb-2" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
            </Field>
            <Field label="Satisfaction (1–5)">
              <TextInput
                type="number"
                min={1}
                max={5}
                className="mb-4"
                value={satisfaction}
                onChange={(e) => setSatisfaction(Number(e.target.value))}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="primary" onClick={createAndLink} disabled={busy} loading={busy}>
                Create & link
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @ia-dashboard/webapp typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add webapp/src/views/SessionActions.tsx
git commit -m "feat(webapp): restyle single-session annotate drawer onto shared primitives"
```

---

### Task 9: End-to-end verification

**Files:**
- None (verification only).

- [ ] **Step 1: Run the full test suites**

Run: `pnpm test`
Expected: PASS — API Jest suite (including the 4 new bulk tests) and webapp Vitest suite (including the new selection spec).

- [ ] **Step 2: Run both typechecks**

Run: `pnpm --filter @ia-dashboard/api typecheck && pnpm --filter @ia-dashboard/webapp typecheck`
Expected: PASS.

- [ ] **Step 3: Manual smoke test (dev)**

If a local stack is available (`docker compose up` or the README local-dev steps), verify:
1. Sessions list shows the new layout, checkbox column, date column; header checkbox toggles the page and shows indeterminate when partially selected.
2. Selection persists when navigating page 2 → back to page 1.
3. Selecting 3 sessions (one already annotated) → floating bar shows "2 session(s) selected · 1 already linked (skipped)".
4. "Annotate / Link" → "New feature" tab creates a feature and links the 2 eligible sessions; recap shows "2 session(s) linked · 1 session(s) skipped"; selection clears; badges flip to annotated.
5. "Existing feature" tab links to a picked feature.
6. Feature detail shows the new stats banner and restyled table; resync/unlink still work.