# Comparaison de sessions & capture de config agentique — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Comparer deux sessions OpenCode (coût, tokens, appels, outils, sous-agents) y compris les sessions de la VM `devbox`, en capturant la config agentique offerte et sans jamais perdre l'historique VM.

**Architecture:** Le plugin `config-capture` dans la VM écrit captures + snapshots SQLite cohérents dans un store host monté via un device Incus (`ia-store`). Côté `ia-dashboard`, un registry multi-sources lit la DB host et toutes les générations VM, et une route `GET /api/sessions/compare` produit deux profils + deltas, affichés par une vue webapp `/compare`.

**Tech Stack:** NestJS + Drizzle + better-sqlite3 (api), React + Vite + Redux classic + Vitest (webapp), plugin OpenCode TS + helper Python `snapshot.py` (sandbox-opencode), Incus (device virtiofs).

## Global Constraints

- Deux repos touchés : `ia-dashboard` (spec + plan + API + UI) et `sandbox-opencode` (plugin, helper, scripts). Un plan unique ici ; le spec sera recopié en fin de chantier dans `sandbox-opencode/docs/superpowers/specs/`.
- **Jamais** exécuter SQLite (WAL) directement sur virtiofs : uniquement des copies de fichiers. Le backup est fait en temp VM-local puis copié.
- Langues : la conversation et les specs `ia-dashboard` en **français** ; le code et les docs du repo `sandbox-opencode` en **anglais** (convention `sandbox-opencode/AGENTS.md`).
- Une **session comparée = arbre** (parent + descendants `task` récursifs). Le coût d'un parent n'inclut pas ses sous-agents.
- `configId = sha1(canonicalJson({model, smallModel, agents, mcp, plugins, skills}))` — jamais de prompts.
- Générations VM : jamais d'écrasement inter-générations ; dédup par `session.id` (le plus récent `time_updated` gagne) ; fichiers `.tmp` ignorés.
- Aucune nouvelle dépendance npm/pip. pnpm uniquement (`pnpm-policy`).
- Commandes de test : `pnpm --filter @ia-dashboard/api test` (Jest), `pnpm --filter @ia-dashboard/webapp test` (Vitest), `node --test 'tests/**/*.test.ts'` (sandbox-opencode, depuis la racine du repo).
- YAGNI : pas d'export incrémental, pas de daemon host, pas de lecture Phoenix dans l'API, pas de changement du modèle `feature`.
- Périmètre des agrégats existants (`/dashboard`) : restent **host-only** en v1 ; seuls la liste des sessions et `/compare` incluent les sources VM.

---

## File Structure

**sandbox-opencode**
- Create `plugins/config-capture/capture-lib.ts` — helpers purs (`canonical`, `computeConfigId`, `compactConfig`).
- Create `plugins/config-capture/config-capture.ts` — factory plugin OpenCode (hooks `config`, `tool.definition`, `chat.message`, `event`).
- Create `plugins/config-capture/snapshot.py` — gen-id + backup SQLite cohérent + mirror des captures vers le store.
- Create `tests/config-capture.test.ts` — tests `capture-lib`.
- Create `tests/snapshot.test.ts` — test du helper python (spawn `python3` sur DB fixture).
- Create `scripts/sync-vm-sessions.sh` — snapshot manuel host.
- Modify `scripts/sync-opencode.sh` — déploiement plugin + `snapshot.py` + `OPENCODE_PROFILE`.
- Modify `scripts/incus-setup.sh` — device `ia-store`.

**ia-dashboard**
- Modify `api/src/config/config.ts` — `vmStoreDir`.
- Modify `api/src/opencode/opencode.types.ts` — nouveaux types.
- Modify `api/src/opencode/opencode-reader.ts` — `source` + méthodes arbre/calls/steps/tools.
- Create `api/src/opencode/session-sources.ts` — registry multi-sources + chargement captures.
- Modify `api/src/opencode/opencode.module.ts` — provider `SESSION_SOURCES`.
- Modify `api/src/sessions/sessions.service.ts` — liste multi-sources + `compare`.
- Modify `api/src/sessions/sessions.controller.ts` — `GET /compare`.
- Modify `api/src/opencode/opencode-reader.spec.ts` — fixture enrichie + tests méthodes.
- Create `api/src/opencode/session-sources.spec.ts`.
- Create `api/src/sessions/compare.spec.ts`.
- Modify `webapp/src/api/client.ts`, `webapp/src/store/store.ts`, `webapp/src/App.tsx`.
- Create `webapp/src/store/compare.ts`, `webapp/src/store/compare.spec.ts`.
- Create `webapp/src/views/CompareView.tsx`, `webapp/src/views/CompareView.spec.tsx`.

---

## Task 1: Helper de snapshot VM (`snapshot.py`)

**Files:**
- Create: `sandbox-opencode/plugins/config-capture/snapshot.py`
- Test: `sandbox-opencode/tests/snapshot.test.ts`

**Interfaces:**
- Produces: `snapshot.py` CLI `--data-dir <dir> --store-root <dir>`; crée `<store-root>/<hostname>-<uuid4>/` contenant `opencode.db` (backup cohérent), et copie `<data-dir>/ia-dashboard/{configs.json,captures.jsonl}` si présents. Persiste `gen-id` dans `<data-dir>/ia-dashboard/gen-id`.

- [ ] **Step 1: Write the failing test**

Create `sandbox-opencode/tests/snapshot.test.ts`:

```ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const SCRIPT = new URL("../plugins/config-capture/snapshot.py", import.meta.url).pathname

function makeDb(path: string) {
  // create a tiny valid sqlite db via python (no sqlite3 CLI guaranteed)
  execFileSync("python3", [
    "-c",
    `import sqlite3;c=sqlite3.connect(${JSON.stringify(path)});c.execute("CREATE TABLE t(x)");c.execute("INSERT INTO t VALUES(1)");c.commit();c.close()`,
  ])
}

test("snapshot copies db + captures into a generation dir and is idempotent", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "oc-data-"))
  const store = mkdtempSync(join(tmpdir(), "oc-store-"))
  makeDb(join(dataDir, "opencode.db"))
  mkdirSync(join(dataDir, "ia-dashboard"), { recursive: true })
  writeFileSync(join(dataDir, "ia-dashboard", "captures.jsonl"), '{"sessionId":"s1"}\n')
  writeFileSync(join(dataDir, "ia-dashboard", "configs.json"), "")

  const args = ["--data-dir", dataDir, "--store-root", store]
  execFileSync("python3", [SCRIPT, ...args])
  execFileSync("python3", [SCRIPT, ...args]) // second run must not create a new generation

  const gens = readdirSync(store)
  assert.equal(gens.length, 1)
  assert.ok(existsSync(join(store, gens[0], "opencode.db")))
  assert.ok(existsSync(join(store, gens[0], "captures.jsonl")))
  const genId = execFileSync("cat", [join(dataDir, "ia-dashboard", "gen-id")], { encoding: "utf8" }).trim()
  assert.equal(gens[0], genId)
})

test("no temp files are left behind", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "oc-data-"))
  const store = mkdtempSync(join(tmpdir(), "oc-store-"))
  makeDb(join(dataDir, "opencode.db"))
  execFileSync("python3", [SCRIPT, "--data-dir", dataDir, "--store-root", store])
  const gen = readdirSync(store)[0]
  const leftovers = readdirSync(join(store, gen)).filter((f) => f.includes(".tmp"))
  assert.deepEqual(leftovers, [])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/riko/workspace/sandbox-opencode && node --test 'tests/snapshot.test.ts'`
Expected: FAIL — `Cannot find module .../snapshot.py` / python exits non-zero.

- [ ] **Step 3: Write minimal implementation**

Create `sandbox-opencode/plugins/config-capture/snapshot.py`:

```python
#!/usr/bin/env python3
"""Snapshot the OpenCode DB + config captures into a per-VM-life generation dir.

Never runs SQLite against the destination filesystem (virtiofs): the backup is
built in a local temp file, then copied into place atomically.
"""
import argparse
import os
import shutil
import socket
import sqlite3
import sys
import tempfile
import uuid


def ensure_gen_id(data_dir: str) -> str:
    state = os.path.join(data_dir, "ia-dashboard")
    os.makedirs(state, exist_ok=True)
    gen_file = os.path.join(state, "gen-id")
    if not os.path.exists(gen_file):
        with open(gen_file, "w", encoding="utf-8") as f:
            f.write("%s-%s" % (socket.gethostname(), uuid.uuid4()))
    with open(gen_file, "r", encoding="utf-8") as f:
        return f.read().strip()


def backup(db_path: str, dest_tmp: str) -> None:
    src = sqlite3.connect("file:%s?mode=ro" % db_path, uri=True)
    dst = sqlite3.connect(dest_tmp)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()


def atomic_copy(src: str, dst: str) -> None:
    tmp = "%s.tmp-%s" % (dst, uuid.uuid4().hex)
    shutil.copyfile(src, tmp)
    os.replace(tmp, dst)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True)
    ap.add_argument("--store-root", required=True)
    args = ap.parse_args()

    db_path = os.path.join(args.data_dir, "opencode.db")
    if not os.path.exists(db_path):
        print("no opencode.db at %s" % db_path, file=sys.stderr)
        return 0  # nothing to snapshot yet is not an error

    gen = ensure_gen_id(args.data_dir)
    gen_dir = os.path.join(args.store_root, gen)
    os.makedirs(gen_dir, exist_ok=True)

    fd, tmp_db = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    try:
        backup(db_path, tmp_db)
        atomic_copy(tmp_db, os.path.join(gen_dir, "opencode.db"))
    finally:
        if os.path.exists(tmp_db):
            os.remove(tmp_db)

    state = os.path.join(args.data_dir, "ia-dashboard")
    for name in ("configs.json", "captures.jsonl"):
        src = os.path.join(state, name)
        if os.path.exists(src):
            atomic_copy(src, os.path.join(gen_dir, name))

    print("snapshot -> %s" % gen_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/riko/workspace/sandbox-opencode && node --test 'tests/snapshot.test.ts'`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /home/riko/workspace/sandbox-opencode
git add plugins/config-capture/snapshot.py tests/snapshot.test.ts
git commit -m "feat(vm): snapshot helper for OpenCode DB generations"
```

---

## Task 2: Plugin `config-capture` (capture de la config offerte)

**Files:**
- Create: `sandbox-opencode/plugins/config-capture/capture-lib.ts`
- Create: `sandbox-opencode/plugins/config-capture/config-capture.ts`
- Test: `sandbox-opencode/tests/config-capture.test.ts`

**Interfaces:**
- Consumes: `snapshot.py` (Task 1).
- Produces: `canonical(value: unknown): string`, `computeConfigId(cfg: CaptureConfig): string`, `compactConfig(rawConfig: any, skills: string[]): CaptureConfig` from `capture-lib.ts`; `ConfigCapture` (plugin factory) from `config-capture.ts`.

- [ ] **Step 1: Write the failing test**

Create `sandbox-opencode/tests/config-capture.test.ts`:

```ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { canonical, computeConfigId, compactConfig } from "../plugins/config-capture/capture-lib.ts"

test("canonical is stable regardless of key order", () => {
  assert.equal(canonical({ b: 1, a: 2 }), canonical({ a: 2, b: 1 }))
})

test("configId is deterministic and changes when the toolset changes", () => {
  const base = compactConfig({ agent: { build: { tools: { bash: true } } } }, ["s1"])
  const same = compactConfig({ agent: { build: { tools: { bash: true } } } }, ["s1"])
  const diff = compactConfig({ agent: { build: { tools: { bash: false } } } }, ["s1"])
  assert.equal(computeConfigId(base), computeConfigId(same))
  assert.notEqual(computeConfigId(base), computeConfigId(diff))
})

test("compactConfig keeps only config-describing fields", () => {
  const c = compactConfig(
    { model: "m", small_model: "sm", plugin: ["p"],
      mcp: { bm: { type: "remote", enabled: true } },
      agent: { build: { model: { modelID: "x" }, tools: { bash: true }, options: { reasoningEffort: "high" }, prompt: "SECRET" } } },
    ["ctx"],
  )
  assert.equal(c.model, "m")
  assert.equal(c.mcp[0].name, "bm")
  assert.equal(c.mcp[0].enabled, true)
  assert.equal(c.skills[0], "ctx")
  assert.equal((c.agents.build as any).prompt, undefined) // prompts never captured
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/riko/workspace/sandbox-opencode && node --test 'tests/config-capture.test.ts'`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `sandbox-opencode/plugins/config-capture/capture-lib.ts`:

```ts
import { createHash } from "node:crypto"

export interface CaptureConfig {
  model: string | null
  smallModel: string | null
  agents: Record<string, unknown>
  mcp: { name: string; enabled: boolean; type: string }[]
  plugins: string[]
  skills: string[]
}

export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]"
  const obj = value as Record<string, unknown>
  return (
    "{" +
    Object.keys(obj)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + canonical(obj[k]))
      .join(",") +
    "}"
  )
}

export function computeConfigId(cfg: CaptureConfig): string {
  return createHash("sha1").update(canonical(cfg)).digest("hex")
}

export function compactConfig(raw: any, skills: string[]): CaptureConfig {
  const agents: Record<string, unknown> = {}
  for (const [name, a] of Object.entries(raw?.agent ?? {})) {
    const agent = a as any
    agents[name] = {
      model: agent.model ?? null,
      tools: agent.tools ?? {},
      permission: agent.permission ?? {},
      options: agent.options ?? {},
    }
  }
  const mcp = Object.entries(raw?.mcp ?? {}).map(([name, s]: [string, any]) => ({
    name,
    enabled: s?.enabled !== false,
    type: s?.type ?? "local",
  }))
  return {
    model: raw?.model ?? null,
    smallModel: raw?.small_model ?? null,
    agents,
    mcp,
    plugins: raw?.plugin ?? [],
    skills,
  }
}
```

Create `sandbox-opencode/plugins/config-capture/config-capture.ts`:

```ts
import { appendFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs"
import { spawn } from "node:child_process"
import { join } from "node:path"
import { compactConfig, computeConfigId, CaptureConfig } from "./capture-lib.ts"

const DATA_DIR = join(
  process.env.XDG_DATA_HOME ?? join(process.env.HOME ?? "", ".local", "share"),
  "opencode",
)
const STATE_DIR = join(DATA_DIR, "ia-dashboard")
const STORE_ROOT = "/mnt/ia-store"
const SNAPSHOT_PY = join(process.env.HOME ?? "", ".config", "opencode", "ia-dashboard", "snapshot.py")
const DEBOUNCE_MS = 15_000

function listSkills(): string[] {
  const dir = join(process.env.HOME ?? "", ".config", "opencode", "skills")
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
  } catch {
    return []
  }
}

export const ConfigCapture = async () => {
  let config: CaptureConfig | null = null
  const seenConfigs = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | null = null

  const ensureState = () => mkdirSync(STATE_DIR, { recursive: true })

  const recordConfig = (cfg: CaptureConfig) => {
    const id = computeConfigId(cfg)
    if (seenConfigs.has(id)) return id
    seenConfigs.add(id)
    ensureState()
    appendFileSync(join(STATE_DIR, "configs.json"), JSON.stringify({ id, config: cfg }) + "\n")
    return id
  }

  const snapshotSoon = () => {
    if (!existsSync(STORE_ROOT)) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      spawn("python3", [SNAPSHOT_PY, "--data-dir", DATA_DIR, "--store-root", STORE_ROOT], {
        detached: true,
        stdio: "ignore",
      }).unref()
    }, DEBOUNCE_MS)
  }

  return {
    config: async (raw: any) => {
      config = compactConfig(raw, listSkills())
      recordConfig(config)
    },
    event: async ({ event }: { event: { type: string } }) => {
      if (event.type === "session.idle") snapshotSoon()
    },
    "chat.message": async (input: any) => {
      if (!config) return
      ensureState()
      appendFileSync(
        join(STATE_DIR, "captures.jsonl"),
        JSON.stringify({
          sessionId: input.sessionID,
          profile: process.env.OPENCODE_PROFILE ?? null,
          agent: input.agent ?? null,
          model: input.model ?? null,
          configId: computeConfigId(config),
          at: Date.now(),
        }) + "\n",
      )
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/riko/workspace/sandbox-opencode && node --test 'tests/config-capture.test.ts'`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /home/riko/workspace/sandbox-opencode
git add plugins/config-capture/capture-lib.ts plugins/config-capture/config-capture.ts tests/config-capture.test.ts
git commit -m "feat(vm): config-capture opencode plugin"
```

---

## Task 3: Plomberie VM/host (device, sync, script manuel)

**Files:**
- Modify: `sandbox-opencode/scripts/sync-opencode.sh`
- Modify: `sandbox-opencode/scripts/incus-setup.sh`
- Create: `sandbox-opencode/scripts/sync-vm-sessions.sh`

**Interfaces:**
- Consumes: `plugins/config-capture/*` (Tasks 1–2).
- Produces: `scripts/sync-vm-sessions.sh [instance]` — déclenche un snapshot VM vers `~/.local/share/opencode-vm`.

- [ ] **Step 1: Deploy the plugin from `sync-opencode.sh`**

In `sync-opencode.sh`, after the guardrails plugin block (which pushes to `$DEST/plugin/`), add a block that pushes the config-capture plugin **and** the `snapshot.py` helper, and injects `OPENCODE_PROFILE`:

```bash
# 2c. push the config-capture plugin + snapshot helper, and tag the profile
CAPTURE_SRC="$ROOT/plugins/config-capture"
if [ -d "$CAPTURE_SRC" ]; then
  echo "==> Pushing config-capture plugin"
  incus exec "$VM" -- mkdir -p "$DEST/plugin" "$DEST/ia-dashboard"
  incus file push "$CAPTURE_SRC/config-capture.ts" "$VM$DEST/plugin/config-capture.ts"
  incus file push "$CAPTURE_SRC/capture-lib.ts" "$VM$DEST/plugin/capture-lib.ts"
  incus file push "$CAPTURE_SRC/snapshot.py" "$VM$DEST/ia-dashboard/snapshot.py"
  incus config set "$VM" environment.OPENCODE_PROFILE="$PROFILE"
fi
```

- [ ] **Step 2: Add the `ia-store` device in `incus-setup.sh`**

In `incus-setup.sh`, after the `workspace` device is added, add:

```bash
# shared store for VM session snapshots (host-owned history; never SQLite directly on it)
STORE="$HOME/.local/share/opencode-vm"
mkdir -p "$STORE"
if ! incus config device list "$VM" | grep -qx ia-store; then
  echo "==> Mounting session store: $STORE -> /mnt/ia-store"
  incus config device add "$VM" ia-store disk source="$STORE" path=/mnt/ia-store
fi
```

- [ ] **Step 3: Create the manual snapshot script**

Create `sandbox-opencode/scripts/sync-vm-sessions.sh`:

```bash
#!/usr/bin/env bash
# sync-vm-sessions.sh — force a VM session snapshot into the host store
# (~/.local/share/opencode-vm). Run on the Incus host, NOT inside the VM.
# Usage: bash sync-vm-sessions.sh [instance_name]   (default: devbox)
set -euo pipefail

VM="${1:-devbox}"
STORE="$HOME/.local/share/opencode-vm"

if ! incus config device list "$VM" | grep -qx ia-store; then
  echo "==> device 'ia-store' missing on $VM — run incus-setup.sh first" >&2
  exit 1
fi

echo "==> Snapshotting $VM sessions into $STORE"
incus exec "$VM" --user 1000 --group 1000 --env HOME=/home/agent --env USER=agent -- \
  python3 /home/agent/.config/opencode/ia-dashboard/snapshot.py \
    --data-dir /home/agent/.local/share/opencode \
    --store-root /mnt/ia-store

echo "==> Generations:"
ls -1 "$STORE" 2>/dev/null || true
```

Make it executable: `chmod +x scripts/sync-vm-sessions.sh`.

- [ ] **Step 4: Verify wiring on a live VM**

Run:
```bash
cd /home/riko/workspace/sandbox-opencode
bash scripts/incus-setup.sh devbox        # adds the ia-store device (idempotent)
bash scripts/sync-opencode.sh default devbox
bash scripts/sync-vm-sessions.sh devbox
```
Expected: `snapshot -> /mnt/ia-store/<hostname>-<uuid>` printed, then `ls` shows one generation directory under `~/.local/share/opencode-vm`. Re-running `sync-vm-sessions.sh` must not create a second generation.

- [ ] **Step 5: Commit**

```bash
cd /home/riko/workspace/sandbox-opencode
git add scripts/sync-opencode.sh scripts/incus-setup.sh scripts/sync-vm-sessions.sh
git commit -m "feat(vm): deploy config-capture and expose the session store"
```

---

## Task 4: Reader — arbre, appels, steps, outils

**Files:**
- Modify: `ia-dashboard/api/src/opencode/opencode.types.ts`
- Modify: `ia-dashboard/api/src/opencode/opencode-reader.ts`
- Test: `ia-dashboard/api/src/opencode/opencode-reader.spec.ts`

**Interfaces:**
- Produces on `OpenCodeReader`: `getSessionTree(id: string): string[]`, `getSessionCalls(ids: string[]): SessionCall[]`, `getSessionSteps(ids: string[]): SessionStep[]`, `getSessionToolUsage(ids: string[]): ToolUsage[]`, and a public `source: string`.

- [ ] **Step 1: Add the types**

In `api/src/opencode/opencode.types.ts`, add `source: string;` to the existing `OpenCodeSession` interface, and append:

```ts
export interface SessionCall {
  sessionId: string;
  timeCreated: number;
  cost: number;
  tokensInput: number;
  tokensOutput: number;
  tokensReasoning: number;
  cacheRead: number;
  cacheWrite: number;
  model: string;
  agent: string | null;
  mode: string | null;
}

export interface SessionStep {
  sessionId: string;
  cost: number;
  tokensInput: number;
  tokensOutput: number;
  tokensReasoning: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ToolUsage {
  tool: string;
  count: number;
  completed: number;
  error: number;
}
```

- [ ] **Step 2: Write the failing tests**

Extend the fixture in `api/src/opencode/opencode-reader.spec.ts`. In `buildFixture`, after the session inserts, add message/part rows. Add a helper to build a message row and parts:

```ts
function addAssistant(db: Database.Database, id: string, sessionId: string, data: object, at: number) {
  db.prepare("INSERT INTO message (id, session_id, data, time_created, time_updated) VALUES (?,?,?,?,?)")
    .run(id, sessionId, JSON.stringify(data), at, at);
}
function addPart(db: Database.Database, id: string, messageId: string, sessionId: string, data: object, at: number) {
  db.prepare("INSERT INTO part (id, message_id, session_id, data, time_created, time_updated) VALUES (?,?,?,?,?,?)")
    .run(id, messageId, sessionId, JSON.stringify(data), at, at);
}
```

Then, next to the existing `s1` / `s1-sub` inserts, add:

```ts
addAssistant(db, "m1", "s1", { role: "assistant", cost: 0.5, modelID: "m-x", providerID: "p", agent: "build", mode: "build",
  tokens: { input: 100, output: 20, reasoning: 5, cache: { read: 30, write: 0 } } }, 1785702300000);
addPart(db, "p1", "m1", "s1", { type: "step-finish", cost: 0.5,
  tokens: { input: 100, output: 20, reasoning: 5, cache: { read: 30, write: 0 } } }, 1785702300000);
addPart(db, "p2", "m1", "s1", { type: "tool", tool: "bash", state: { status: "completed" } }, 1785702300001);
addPart(db, "p3", "m1", "s1", { type: "tool", tool: "read", state: { status: "error" } }, 1785702300002);
addAssistant(db, "m2", "s1-sub", { role: "assistant", cost: 0.4, modelID: "m-x", providerID: "p", agent: "general", mode: "general",
  tokens: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } } }, 1785702400000);
addPart(db, "p4", "m2", "s1-sub", { type: "tool", tool: "bash", state: { status: "completed" } }, 1785702400001);
```

Add tests:

```ts
test("getSessionTree returns the parent and its descendants", () => {
  const reader = new OpenCodeReader(path);
  expect(reader.getSessionTree("s1").sort()).toEqual(["s1", "s1-sub"]);
});

test("getSessionCalls parses assistant messages for the tree", () => {
  const reader = new OpenCodeReader(path);
  const calls = reader.getSessionCalls(["s1", "s1-sub"]);
  expect(calls).toHaveLength(2);
  expect(calls.reduce((s, c) => s + c.cost, 0)).toBeCloseTo(0.9);
  expect(calls[0].model).toBe("m-x");
});

test("getSessionToolUsage counts tools, completed and error", () => {
  const reader = new OpenCodeReader(path);
  const tools = reader.getSessionToolUsage(["s1", "s1-sub"]);
  const bash = tools.find((t) => t.tool === "bash")!;
  expect(bash.count).toBe(2);
  expect(bash.completed).toBe(2);
  expect(tools.find((t) => t.tool === "read")!.error).toBe(1);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @ia-dashboard/api test -- opencode-reader.spec`
Expected: FAIL — `reader.getSessionTree is not a function`.

- [ ] **Step 4: Implement the reader methods**

In `api/src/opencode/opencode-reader.ts`, add the imports for the new types and a `source` field. Change the constructor:

```ts
constructor(
  private readonly dbPath: string,
  public readonly source: string = "host",
) {}
```

Add the methods (reusing the existing named-parameter style for `IN (...)`):

```ts
getSessionTree(id: string): string[] {
  const db = this.requireDb();
  const rows = db
    .prepare(
      `WITH RECURSIVE tree(id) AS (
         SELECT id FROM session WHERE id = @id
         UNION ALL
         SELECT s.id FROM session s JOIN tree t ON s.parent_id = t.id
       )
       SELECT id FROM tree`,
    )
    .all({ id }) as { id: string }[];
  return rows.map((r) => r.id);
}

private inClause(ids: string[], prefix: string): { sql: string; params: Record<string, unknown> } {
  const params: Record<string, unknown> = {};
  const sql = ids.map((id, i) => {
    params[`${prefix}${i}`] = id;
    return `@${prefix}${i}`;
  }).join(", ");
  return { sql, params };
}

getSessionCalls(ids: string[]): SessionCall[] {
  if (ids.length === 0) return [];
  const db = this.requireDb();
  const { sql, params } = this.inClause(ids, "c");
  const rows = db
    .prepare(
      `SELECT session_id, time_created, data FROM message
       WHERE session_id IN (${sql}) AND json_extract(data, '$.role') = 'assistant'
       ORDER BY time_created`,
    )
    .all(params) as { session_id: string; time_created: number; data: string }[];
  return rows.map((r) => {
    const d = JSON.parse(r.data) as any;
    return {
      sessionId: r.session_id,
      timeCreated: r.time_created,
      cost: d.cost ?? 0,
      tokensInput: d.tokens?.input ?? 0,
      tokensOutput: d.tokens?.output ?? 0,
      tokensReasoning: d.tokens?.reasoning ?? 0,
      cacheRead: d.tokens?.cache?.read ?? 0,
      cacheWrite: d.tokens?.cache?.write ?? 0,
      model: d.modelID ?? "",
      agent: d.agent ?? null,
      mode: d.mode ?? null,
    };
  });
}

getSessionSteps(ids: string[]): SessionStep[] {
  if (ids.length === 0) return [];
  const db = this.requireDb();
  const { sql, params } = this.inClause(ids, "s");
  const rows = db
    .prepare(
      `SELECT session_id, data FROM part
       WHERE session_id IN (${sql}) AND json_extract(data, '$.type') = 'step-finish'`,
    )
    .all(params) as { session_id: string; data: string }[];
  return rows.map((r) => {
    const d = JSON.parse(r.data) as any;
    return {
      sessionId: r.session_id,
      cost: d.cost ?? 0,
      tokensInput: d.tokens?.input ?? 0,
      tokensOutput: d.tokens?.output ?? 0,
      tokensReasoning: d.tokens?.reasoning ?? 0,
      cacheRead: d.tokens?.cache?.read ?? 0,
      cacheWrite: d.tokens?.cache?.write ?? 0,
    };
  });
}

getSessionToolUsage(ids: string[]): ToolUsage[] {
  if (ids.length === 0) return [];
  const db = this.requireDb();
  const { sql, params } = this.inClause(ids, "t");
  const rows = db
    .prepare(
      `SELECT json_extract(data, '$.tool') AS tool,
              json_extract(data, '$.state.status') AS status
       FROM part
       WHERE session_id IN (${sql}) AND json_extract(data, '$.type') = 'tool'`,
    )
    .all(params) as { tool: string | null; status: string | null }[];
  const map = new Map<string, ToolUsage>();
  for (const r of rows) {
    if (!r.tool) continue;
    const u = map.get(r.tool) ?? { tool: r.tool, count: 0, completed: 0, error: 0 };
    u.count++;
    if (r.status === "completed") u.completed++;
    if (r.status === "error") u.error++;
    map.set(r.tool, u);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}
```

Also add `source: this.source` to the object returned by `toSession`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @ia-dashboard/api test -- opencode-reader.spec`
Expected: PASS (existing + new tests).

- [ ] **Step 6: Commit**

```bash
cd /home/riko/workspace-ia/ia-dashboard
git add api/src/opencode/opencode.types.ts api/src/opencode/opencode-reader.ts api/src/opencode/opencode-reader.spec.ts
git commit -m "feat(api): session tree, calls, steps and tool usage in reader"
```

---

## Task 5: Registry multi-sources + captures de config

**Files:**
- Modify: `ia-dashboard/api/src/config/config.ts`
- Create: `ia-dashboard/api/src/opencode/session-sources.ts`
- Modify: `ia-dashboard/api/src/opencode/opencode.module.ts`
- Create: `ia-dashboard/api/src/opencode/session-sources.spec.ts`

**Interfaces:**
- Consumes: `OpenCodeReader` (Task 4).
- Produces: `SessionConfigSnapshot { profile, agent, model, configId, config }`; class `SessionSources` with `list(filters): SessionListFilters-page`, `getSession(id)`, `readerFor(id): OpenCodeReader | null`, `capture(sessionId): SessionConfigSnapshot | null`, `sourceOf(id): string`, `listModels()`.

- [ ] **Step 1: Add `vmStoreDir` to config**

In `api/src/config/config.ts`, add to `AppConfig` and `loadConfig`:

```ts
// AppConfig interface
vmStoreDir: string;

// loadConfig return
vmStoreDir:
  process.env.OPENCODE_VM_STORE_DIR ??
  join(homedir(), ".local", "share", "opencode-vm"),
```

- [ ] **Step 2: Write the failing test**

Create `api/src/opencode/session-sources.spec.ts`:

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { SessionSources } from "./session-sources";

function seedDb(path: string, sessionId: string, timeUpdated: number, title: string) {
  const db = new Database(path);
  db.exec(`CREATE TABLE project (id TEXT PRIMARY KEY, worktree TEXT, name TEXT);
    CREATE TABLE session (id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT, directory TEXT, path TEXT,
      title TEXT, model TEXT, agent TEXT, cost REAL, tokens_input INTEGER, tokens_output INTEGER,
      tokens_reasoning INTEGER, tokens_cache_read INTEGER, tokens_cache_write INTEGER,
      summary_additions INTEGER, summary_deletions INTEGER, summary_files INTEGER,
      time_created INTEGER, time_updated INTEGER, time_compacting INTEGER);
    CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, data TEXT, time_created INTEGER, time_updated INTEGER);
    CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, data TEXT, time_created INTEGER, time_updated INTEGER);
    CREATE TABLE todo (session_id TEXT, content TEXT, status TEXT, priority TEXT, position INTEGER, time_created INTEGER, time_updated INTEGER);`);
  db.prepare("INSERT INTO project VALUES (?,?,?)").run("proj1", "/w/app", null);
  db.prepare(`INSERT INTO session VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    sessionId, "proj1", null, "/w/app", null, title, '{"id":"m"}', "build",
    1, 0, 0, 0, 0, 0, 0, 0, 0, timeUpdated - 100, timeUpdated, null,
  );
  db.close();
}

function setup() {
  const hostDir = mkdtempSync(join(tmpdir(), "host-"));
  const hostDb = join(hostDir, "opencode.db");
  seedDb(hostDb, "h1", 1000, "host-session");

  const store = mkdtempSync(join(tmpdir(), "store-"));
  const gen = join(store, "devbox-abc");
  mkdirSync(gen, { recursive: true });
  seedDb(join(gen, "opencode.db"), "v1", 2000, "vm-session");
  writeFileSync(join(gen, "captures.jsonl"),
    JSON.stringify({ sessionId: "v1", profile: "muse-spark", agent: "build", model: { modelID: "m" }, configId: "cid1", at: 1 }) + "\n");
  writeFileSync(join(gen, "configs.json"),
    JSON.stringify({ id: "cid1", config: { model: "m" } }) + "\n");

  return { hostDb, store };
}

test("lists host and vm sessions with their source, dedup by id keeping newest", () => {
  const { hostDb, store } = setup();
  const sources = new SessionSources(hostDb, store);
  const page = sources.list({});
  const byId = Object.fromEntries(page.items.map((s) => [s.id, s]));
  expect(byId.h1.source).toBe("host");
  expect(byId.v1.source).toBe("vm:devbox-abc");
  // newest first
  expect(page.items[0].id).toBe("v1");
});

test("resolves a session's reader and captured config", () => {
  const { hostDb, store } = setup();
  const sources = new SessionSources(hostDb, store);
  expect(sources.readerFor("v1")?.source).toBe("vm:devbox-abc");
  expect(sources.capture("v1")?.profile).toBe("muse-spark");
  expect(sources.capture("h1")).toBeNull();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @ia-dashboard/api test -- session-sources.spec`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `SessionSources`**

Create `api/src/opencode/session-sources.ts`:

```ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { OpenCodeReader } from "./opencode-reader";
import { OpenCodeSession, SessionListFilters, SessionPage } from "./opencode.types";

export interface SessionConfigSnapshot {
  profile: string | null;
  agent: string | null;
  model: string | null;
  configId: string | null;
  config: unknown | null;
}

interface Source {
  source: string;
  reader: OpenCodeReader;
  captures: Map<string, { profile: string | null; agent: string | null; model: string | null; configId: string | null }>;
  configs: Map<string, unknown>;
}

export class SessionSources {
  private sources: Source[] = [];

  constructor(hostDbPath: string, vmStoreDir: string) {
    this.sources.push({ source: "host", reader: new OpenCodeReader(hostDbPath, "host"), captures: new Map(), configs: new Map() });
    this.sources.push(...this.loadVmGenerations(vmStoreDir));
  }

  private loadVmGenerations(storeDir: string): Source[] {
    if (!existsSync(storeDir)) return [];
    const out: Source[] = [];
    for (const gen of readdirSync(storeDir)) {
      const dbPath = join(storeDir, gen, "opencode.db");
      if (!existsSync(dbPath)) continue;
      const source: Source = {
        source: `vm:${gen}`,
        reader: new OpenCodeReader(dbPath, `vm:${gen}`),
        captures: new Map(),
        configs: new Map(),
      };
      const cfgPath = join(storeDir, gen, "configs.json");
      if (existsSync(cfgPath)) {
        for (const line of readFileSync(cfgPath, "utf8").split("\n")) {
          if (!line.trim()) continue;
          const parsed = JSON.parse(line) as { id: string; config: unknown };
          source.configs.set(parsed.id, parsed.config);
        }
      }
      const capPath = join(storeDir, gen, "captures.jsonl");
      if (existsSync(capPath)) {
        for (const line of readFileSync(capPath, "utf8").split("\n")) {
          if (!line.trim()) continue;
          const c = JSON.parse(line) as any;
          source.captures.set(c.sessionId, {
            profile: c.profile ?? null,
            agent: c.agent ?? null,
            model: c.model?.modelID ?? null,
            configId: c.configId ?? null,
          });
        }
      }
      out.push(source);
    }
    return out;
  }

  readerFor(id: string): OpenCodeReader | null {
    for (const s of this.sources) if (s.reader.getSession(id)) return s.reader;
    return null;
  }

  getSession(id: string): OpenCodeSession | null {
    for (const s of this.sources) {
      const found = s.reader.getSession(id);
      if (found) return found;
    }
    return null;
  }

  sourceOf(id: string): string | null {
    for (const s of this.sources) if (s.reader.getSession(id)) return s.source;
    return null;
  }

  capture(sessionId: string): SessionConfigSnapshot | null {
    for (const s of this.sources) {
      const c = s.captures.get(sessionId);
      if (c) {
        return { ...c, config: c.configId ? s.configs.get(c.configId) ?? null : null };
      }
    }
    return null;
  }

  listModels(): string[] {
    const set = new Set<string>();
    for (const s of this.sources) for (const m of s.reader.listModels()) set.add(m);
    return [...set].sort();
  }

  list(filters: SessionListFilters): SessionPage {
    const merged = new Map<string, OpenCodeSession>();
    for (const s of this.sources) {
      // the reader caps pageSize at 200; page through so the merged list is complete
      let pageNo = 1;
      let total = Infinity;
      const collected: OpenCodeSession[] = [];
      while (collected.length < total && pageNo <= 100) {
        const p = s.reader.listSessions({ ...filters, page: pageNo, pageSize: 200 });
        total = p.total;
        if (p.items.length === 0) break;
        collected.push(...p.items);
        pageNo++;
      }
      for (const item of collected) {
        const existing = merged.get(item.id);
        if (!existing || item.timeUpdated > existing.timeUpdated) merged.set(item.id, item);
      }
    }
    const all = [...merged.values()].sort((a, b) => b.timeCreated - a.timeCreated);
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));
    return { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, pageSize };
  }
}
```

Add `source` to `OpenCodeSession` (already added in Task 4 — verify it is present; do not duplicate it).

- [ ] **Step 5: Update the module provider**

In `api/src/opencode/opencode.module.ts`, replace the `OPENCODE_READER` provider with a `SESSION_SOURCES` provider (keep `OPENCODE_READER` exported for the places still using it):

```ts
import { Global, Module } from "@nestjs/common";
import { OpenCodeReader } from "./opencode-reader";
import { SessionSources } from "./session-sources";
import { APP_CONFIG, AppConfig } from "../config/config";

export const OPENCODE_READER = Symbol("OPENCODE_READER");
export const SESSION_SOURCES = Symbol("SESSION_SOURCES");

@Global()
@Module({
  providers: [
    { provide: OPENCODE_READER, inject: [APP_CONFIG], useFactory: (c: AppConfig) => new OpenCodeReader(c.dbPath) },
    { provide: SESSION_SOURCES, inject: [APP_CONFIG], useFactory: (c: AppConfig) => new SessionSources(c.dbPath, c.vmStoreDir) },
  ],
  exports: [OPENCODE_READER, SESSION_SOURCES],
})
export class OpenCodeModule {}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @ia-dashboard/api test -- session-sources.spec`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @ia-dashboard/api typecheck`
Expected: no errors (fix the `OpenCodeSession.source` usages if the compiler complains).

- [ ] **Step 8: Commit**

```bash
cd /home/riko/workspace-ia/ia-dashboard
git add api/src/config/config.ts api/src/opencode/session-sources.ts api/src/opencode/opencode.module.ts api/src/opencode/opencode.types.ts api/src/opencode/session-sources.spec.ts
git commit -m "feat(api): multi-source session registry with config captures"
```

---

## Task 6: Route `GET /api/sessions/compare`

**Files:**
- Modify: `ia-dashboard/api/src/sessions/sessions.service.ts`
- Modify: `ia-dashboard/api/src/sessions/sessions.controller.ts`
- Test: `ia-dashboard/api/src/sessions/compare.spec.ts`

**Interfaces:**
- Consumes: `SessionSources` (Task 5), reader methods (Task 4).
- Produces: `SessionsService.compare(a: string, b: string)` returning `{ a: Profile, b: Profile, delta: Delta }`, and route `GET /api/sessions/compare?a=&b=`.

- [ ] **Step 1: Write the failing test**

Create `api/src/sessions/compare.spec.ts`:

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { OpenCodeReader } from "../opencode/opencode-reader";

function sessionDb(): string {
  const dir = mkdtempSync(join(tmpdir(), "cmp-"));
  const path = join(dir, "opencode.db");
  const db = new Database(path);
  db.exec(`CREATE TABLE project (id TEXT PRIMARY KEY, worktree TEXT, name TEXT);
    CREATE TABLE session (id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT, directory TEXT, path TEXT,
      title TEXT, model TEXT, agent TEXT, cost REAL, tokens_input INTEGER, tokens_output INTEGER,
      tokens_reasoning INTEGER, tokens_cache_read INTEGER, tokens_cache_write INTEGER,
      summary_additions INTEGER, summary_deletions INTEGER, summary_files INTEGER,
      time_created INTEGER, time_updated INTEGER, time_compacting INTEGER);
    CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, data TEXT, time_created INTEGER, time_updated INTEGER);
    CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, data TEXT, time_created INTEGER, time_updated INTEGER);
    CREATE TABLE todo (session_id TEXT, content TEXT, status TEXT, priority TEXT, position INTEGER, time_created INTEGER, time_updated INTEGER);`);
  db.prepare("INSERT INTO project VALUES (?,?,?)").run("p", "/w/a", null);
  const ins = db.prepare("INSERT INTO session VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  ins.run("a", "p", null, "/w/a", null, "A", '{"id":"m"}', "build", 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, null);
  ins.run("a-sub", "p", "a", "/w/a", null, "A sub", '{"id":"m"}', "general", 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, null);
  const msg = db.prepare("INSERT INTO message VALUES (?,?,?,?,?)");
  msg.run("m1", "a", JSON.stringify({ role: "assistant", cost: 1, modelID: "m", tokens: {} }), 0, 0);
  msg.run("m2", "a-sub", JSON.stringify({ role: "assistant", cost: 0.5, modelID: "m", tokens: {} }), 0, 0);
  const part = db.prepare("INSERT INTO part VALUES (?,?,?,?,?,?)");
  part.run("pp1", "m1", "a", JSON.stringify({ type: "tool", tool: "bash", state: { status: "completed" } }), 0, 0);
  part.run("pp2", "m2", "a-sub", JSON.stringify({ type: "tool", tool: "bash", state: { status: "completed" } }), 0, 0);
  db.close();
  return path;
}

test("tree aggregation sums parent + subagents", () => {
  const reader = new OpenCodeReader(sessionDb());
  const tree = reader.getSessionTree("a");
  const calls = reader.getSessionCalls(tree);
  expect(tree.sort()).toEqual(["a", "a-sub"]);
  expect(calls.reduce((s, c) => s + c.cost, 0)).toBeCloseTo(1.5);
  expect(reader.getSessionToolUsage(tree).find((t) => t.tool === "bash")!.count).toBe(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ia-dashboard/api test -- compare.spec`
Expected: FAIL only if Task 4 methods are missing; otherwise it passes. If it passes, proceed — this test is the value guard for the tree math used by `compare`.

- [ ] **Step 3: Implement `compare` in the service**

In `api/src/sessions/sessions.service.ts`, swap the reader injection for the multi-source registry (so the session list and picker include VM sessions), then add `profile`/`compare`.

Constructor + imports (replace the existing `OPENCODE_READER` injection):

```ts
import { SESSION_SOURCES } from "../opencode/opencode.module";
import { SessionSources } from "../opencode/session-sources";

constructor(
  @Inject(SESSION_SOURCES) private readonly sources: SessionSources,
  @Inject(DRIZZLE) private readonly db: DrizzleDb,
) {}
```

Then, in the same file, replace the three reader usages:
- `const page = this.reader.listSessions(filters);` → `const page = this.sources.list(filters);`
- `const session = this.reader.getSession(id);` → `const session = this.sources.getSession(id);`
- `models: this.reader.listModels(),` → `models: this.sources.listModels(),`

Add the new methods:

```ts
private profile(id: string) {
  const reader = this.sources.readerFor(id);
  if (!reader) return null;
  const session = reader.getSession(id);
  if (!session) return null;
  const tree = reader.getSessionTree(id);
  const calls = reader.getSessionCalls(tree);
  const steps = reader.getSessionSteps(tree);
  const tools = reader.getSessionToolUsage(tree);
  const byModel = new Map<string, { model: string; cost: number; tokensInput: number; tokensOutput: number; llmCalls: number }>();
  for (const c of calls) {
    const m = byModel.get(c.model) ?? { model: c.model, cost: 0, tokensInput: 0, tokensOutput: 0, llmCalls: 0 };
    m.cost += c.cost; m.tokensInput += c.tokensInput; m.tokensOutput += c.tokensOutput; m.llmCalls++;
    byModel.set(c.model, m);
  }
  const sum = (pick: (s: (typeof steps)[number]) => number) => steps.reduce((acc, s) => acc + pick(s), 0);
  const capture = this.sources.capture(id);
  return {
    session, source: reader.source, profile: capture?.profile ?? null,
    configId: capture?.configId ?? null, config: capture?.config ?? null,
    totals: {
      cost: calls.reduce((acc, c) => acc + c.cost, 0),
      tokensInput: sum((s) => s.tokensInput), tokensOutput: sum((s) => s.tokensOutput),
      tokensReasoning: sum((s) => s.tokensReasoning), cacheRead: sum((s) => s.cacheRead),
      cacheWrite: sum((s) => s.cacheWrite), llmCalls: calls.length,
      toolCalls: tools.reduce((acc, t) => acc + t.count, 0),
      treeSize: tree.length,
    },
    byModel: [...byModel.values()].sort((x, y) => y.cost - x.cost),
    tools,
    tree: tree.map((tid) => {
      const s = reader.getSession(tid)!;
      return { sessionId: s.id, parentId: s.parentId, agent: s.agent, model: s.model, cost: s.cost };
    }),
  };
}

compare(a: string, b: string) {
  const pa = this.profile(a);
  const pb = this.profile(b);
  if (!pa || !pb) return null;
  const toolMap = new Map<string, { name: string; a: number; b: number; delta: number }>();
  const all = new Set([...pa.tools.map((t) => t.tool), ...pb.tools.map((t) => t.tool)]);
  for (const name of all) {
    const av = pa.tools.find((t) => t.tool === name)?.count ?? 0;
    const bv = pb.tools.find((t) => t.tool === name)?.count ?? 0;
    toolMap.set(name, { name, a: av, b: bv, delta: bv - av });
  }
  const t = (p: typeof pa) => p.totals;
  return {
    a: pa, b: pb,
    delta: {
      cost: t(pb).cost - t(pa).cost,
      tokensInput: t(pb).tokensInput - t(pa).tokensInput,
      tokensOutput: t(pb).tokensOutput - t(pa).tokensOutput,
      tokensReasoning: t(pb).tokensReasoning - t(pa).tokensReasoning,
      cacheRead: t(pb).cacheRead - t(pa).cacheRead,
      cacheWrite: t(pb).cacheWrite - t(pa).cacheWrite,
      llmCalls: t(pb).llmCalls - t(pa).llmCalls,
      toolCalls: t(pb).toolCalls - t(pa).toolCalls,
      tools: [...toolMap.values()].sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)),
    },
  };
}
```

- [ ] **Step 4: Add the controller route**

In `api/src/sessions/sessions.controller.ts`, add before `@Get(":id")`:

```ts
@Get("compare")
async compare(@Query("a") a: string, @Query("b") b: string) {
  const result = await this.svc.compare(a, b);
  if (!result) throw new NotFoundException("session not found");
  return result;
}
```

Import `NotFoundException` from `@nestjs/common`.

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter @ia-dashboard/api test && pnpm --filter @ia-dashboard/api typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
cd /home/riko/workspace-ia/ia-dashboard
git add api/src/sessions/sessions.service.ts api/src/sessions/sessions.controller.ts api/src/sessions/compare.spec.ts
git commit -m "feat(api): GET /sessions/compare with tree aggregation"
```

---

## Task 7: Webapp — store + client compare

**Files:**
- Modify: `ia-dashboard/webapp/src/api/client.ts`
- Modify: `ia-dashboard/webapp/src/store/store.ts`
- Create: `ia-dashboard/webapp/src/store/compare.ts`
- Create: `ia-dashboard/webapp/src/store/compare.spec.ts`

**Interfaces:**
- Produces: `compareReducer`, actions `COMPARE_LOAD_REQUESTED/START/SUCCESS/ERROR`, `api.compare(a, b)`.

- [ ] **Step 1: Add the API client method**

In `webapp/src/api/client.ts`, add to the `api` object:

```ts
compare: (a: string, b: string) =>
  apiFetch<any>(`/api/sessions/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`),
```

- [ ] **Step 2: Write the failing test**

Create `webapp/src/store/compare.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { compareReducer } from "./compare";

describe("compareReducer", () => {
  it("stores the payload on SUCCESS", () => {
    const s = compareReducer(undefined as any, {
      type: "COMPARE_LOAD_SUCCESS",
      payload: { data: { a: { totals: { cost: 1 } }, b: { totals: { cost: 2 } }, delta: { cost: 1 } } },
    });
    expect(s.data?.delta.cost).toBe(1);
    expect(s.loading).toBe(false);
  });

  it("stores the error on ERROR", () => {
    const s = compareReducer(undefined as any, {
      type: "COMPARE_LOAD_ERROR",
      payload: { error: new Error("boom") },
    });
    expect(s.error).toContain("boom");
    expect(s.loading).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @ia-dashboard/webapp test -- compare.spec`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the reducer**

Create `webapp/src/store/compare.ts`:

```ts
export interface CompareState {
  data: any | null;
  loading: boolean;
  error: string | null;
}

const initial: CompareState = { data: null, loading: false, error: null };

export function compareReducer(state: CompareState = initial, action: any): CompareState {
  switch (action.type) {
    case "COMPARE_LOAD_REQUESTED":
      return { ...state, loading: true, error: null };
    case "COMPARE_LOAD_SUCCESS":
      return { ...state, loading: false, data: action.payload.data };
    case "COMPARE_LOAD_ERROR":
      return { ...state, loading: false, error: String(action.payload.error) };
    default:
      return state;
  }
}
```

- [ ] **Step 5: Register the reducer**

In `webapp/src/store/store.ts`, import `compareReducer` and add `compare: compareReducer` to `reducer`.

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter @ia-dashboard/webapp test -- compare.spec && pnpm --filter @ia-dashboard/webapp typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /home/riko/workspace-ia/ia-dashboard
git add webapp/src/api/client.ts webapp/src/store/store.ts webapp/src/store/compare.ts webapp/src/store/compare.spec.ts
git commit -m "feat(webapp): compare store and api client"
```

---

## Task 8: Webapp — vue `/compare`

**Files:**
- Create: `ia-dashboard/webapp/src/views/CompareView.tsx`
- Create: `ia-dashboard/webapp/src/views/CompareView.spec.tsx`
- Modify: `ia-dashboard/webapp/src/App.tsx`

**Interfaces:**
- Consumes: `compareReducer`, `api.compare`, `useSelector`/`useDispatch`.
- Produces: route `/compare` and nav link.

- [ ] **Step 1: Write the failing test**

Create `webapp/src/views/CompareView.spec.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { CompareView } from "./CompareView";
import { compareReducer } from "../store/compare";

function renderWith(data: any) {
  const store = configureStore({
    reducer: {
      compare: compareReducer,
      sessions: (s: any = { items: [], meta: { projects: [], models: [] } }) => s,
    },
    middleware: (g) => g({ thunk: false, serializableCheck: false }),
  });
  store.dispatch({ type: "COMPARE_LOAD_SUCCESS", payload: { data } });
  return renderToStaticMarkup(
    <Provider store={store}>
      <CompareView />
    </Provider>,
  );
}

describe("CompareView", () => {
  it("renders both session titles and the tool delta", () => {
    const html = renderWith({
      a: { session: { id: "a", title: "Session A" }, totals: { cost: 1, llmCalls: 2, toolCalls: 3, treeSize: 1 } },
      b: { session: { id: "b", title: "Session B" }, totals: { cost: 2, llmCalls: 4, toolCalls: 5, treeSize: 1 } },
      delta: { cost: 1, llmCalls: 2, toolCalls: 2, offeredOnlyA: [], offeredOnlyB: [],
               tools: [{ name: "bash", a: 1, b: 3, delta: 2 }] },
    });
    expect(html).toContain("Session A");
    expect(html).toContain("Session B");
    expect(html).toContain("bash");
  });
});
```

> Uses the existing repo pattern (`react-dom/server` `renderToStaticMarkup`, as in `DashboardView.spec.tsx`) — no new dependency. `useEffect` does not run under static rendering, so the mount-time `SESSIONS_LOAD_REQUESTED` dispatch is inert.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ia-dashboard/webapp test -- CompareView.spec`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the view**

Create `webapp/src/views/CompareView.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";

export function CompareView() {
  const dispatch = useDispatch();
  const { data, loading, error } = useSelector((s: any) => s.compare);
  const sessions = useSelector((s: any) => s.sessions.items);
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  useEffect(() => {
    dispatch({ type: "SESSIONS_LOAD_REQUESTED", payload: { path: "/api/sessions?pageSize=200" } });
  }, [dispatch]);

  const run = () => {
    if (a && b) dispatch({ type: "COMPARE_LOAD_REQUESTED", payload: { path: `/api/sessions/compare?a=${a}&b=${b}` } });
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Comparer deux sessions" />
      <div className="flex gap-2">
        <select value={a} onChange={(e) => setA(e.target.value)} className="rounded border px-2 py-1 text-sm">
          <option value="">Session A…</option>
          {sessions.map((s: any) => <option key={s.id} value={s.id}>{s.title} ({s.source})</option>)}
        </select>
        <select value={b} onChange={(e) => setB(e.target.value)} className="rounded border px-2 py-1 text-sm">
          <option value="">Session B…</option>
          {sessions.map((s: any) => <option key={s.id} value={s.id}>{s.title} ({s.source})</option>)}
        </select>
        <button onClick={run} className="rounded bg-blue-600 px-3 py-1 text-sm text-white">Comparer</button>
      </div>

      {loading && <p className="text-sm text-gray-500">Chargement…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {data && (
        <div className="grid grid-cols-2 gap-4">
          <Card><h3 className="font-semibold">{data.a.session.title}</h3>
            <p className="text-sm text-gray-600">Coût {data.a.totals.cost.toFixed(4)} · {data.a.totals.llmCalls} appels · {data.a.totals.toolCalls} outils · {data.a.totals.treeSize} sessions</p>
          </Card>
          <Card><h3 className="font-semibold">{data.b.session.title}</h3>
            <p className="text-sm text-gray-600">Coût {data.b.totals.cost.toFixed(4)} · {data.b.totals.llmCalls} appels · {data.b.totals.toolCalls} outils · {data.b.totals.treeSize} sessions</p>
          </Card>
          <Card className="col-span-2">
            <h3 className="mb-2 font-semibold">Δ outils (B − A)</h3>
            <table className="w-full text-sm">
              <thead><tr><th className="text-left">Outil</th><th>A</th><th>B</th><th>Δ</th></tr></thead>
              <tbody>
                {data.delta.tools.map((t: any) => (
                  <tr key={t.name}><td>{t.name}</td><td>{t.a}</td><td>{t.b}</td><td>{t.delta > 0 ? `+${t.delta}` : t.delta}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
```

Verify `PageHeader` and `Card` accept the used props (`title`, `className`) by reading `webapp/src/components/ui/PageHeader.tsx` and `Card.tsx`; adapt the props if needed.

- [ ] **Step 4: Add the route + nav link**

In `webapp/src/App.tsx`: import `CompareView`, add `<Route path="/compare" element={<CompareView />} />`, and a `<NavLink to="/compare">Comparer</NavLink>` in the aside.

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter @ia-dashboard/webapp test && pnpm --filter @ia-dashboard/webapp typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/riko/workspace-ia/ia-dashboard
git add webapp/src/views/CompareView.tsx webapp/src/views/CompareView.spec.tsx webapp/src/App.tsx
git commit -m "feat(webapp): /compare view"
```

---

## Task 9: Documentation (traçabilité sandbox-opencode)

**Files:**
- Create: `sandbox-opencode/docs/superpowers/specs/2026-09-20-comparaison-sessions-design.md`
- Modify: `sandbox-opencode/AGENTS.md`

**Interfaces:**
- Consumes: le spec `ia-dashboard/docs/superpowers/specs/2026-09-20-comparaison-sessions-design.md`.

- [ ] **Step 1: Copy + translate the spec**

Copier le spec dans `sandbox-opencode/docs/superpowers/specs/2026-09-20-comparaison-sessions-design.md`, **en anglais** (convention `sandbox-opencode/AGENTS.md` : docs en anglais), en conservant les décisions, le diagramme et le tableau de constats techniques (WAL/virtiofs, subagents). Traduire les titres et le corps ; garder les identifiants et chemins tels quels.

- [ ] **Step 2: Document the new plugin and script in AGENTS.md**

Dans `sandbox-opencode/AGENTS.md`, dans la liste des plugins, ajouter une ligne :

```markdown
- `plugins/config-capture/` is pushed into the VM by `sync-opencode.sh` (config
  capture + DB snapshots for ia-dashboard; writes to the `ia-store` device,
  tolerates its absence). Bypass: none (read-only capture).
```

Et dans la section Scripts, après `sync-opencode.sh` :

```markdown
- `scripts/sync-vm-sessions.sh` — runs on the Incus **host**. Forces a VM session
  snapshot into `~/.local/share/opencode-vm` (also written automatically by the
  config-capture plugin on `session.idle`). Usage: `bash scripts/sync-vm-sessions.sh [instance]`.
```

- [ ] **Step 3: Verify the docs**

Run: `cd /home/riko/workspace/sandbox-opencode && ls docs/superpowers/specs/ && grep -n "config-capture" AGENTS.md`
Expected: the spec file is listed and both AGENTS.md entries are present.

- [ ] **Step 4: Commit**

```bash
cd /home/riko/workspace/sandbox-opencode
git add docs/superpowers/specs/2026-09-20-comparaison-sessions-design.md AGENTS.md
git commit -m "docs: session comparison + config capture design"
```

---

## Task 10: Outils offerts — capture (`offeredTools`) + diff

**Files:**
- Modify: `sandbox-opencode/plugins/config-capture/capture-lib.ts`
- Modify: `sandbox-opencode/plugins/config-capture/config-capture.ts`
- Modify: `sandbox-opencode/tests/config-capture.test.ts`
- Create: `ia-dashboard/api/src/opencode/offered.ts`
- Create: `ia-dashboard/api/src/opencode/offered.spec.ts`
- Modify: `ia-dashboard/api/src/opencode/session-sources.ts`
- Modify: `ia-dashboard/api/src/sessions/sessions.service.ts`
- Modify: `ia-dashboard/webapp/src/views/CompareView.tsx`

**Interfaces:**
- Consumes: hook `tool.definition` (Task 2), `SessionConfigSnapshot` (Task 5), `compare` (Task 6).
- Produces: `OfferedTracker` (sandbox), `offeredDiff(a, b): { onlyA: string[]; onlyB: string[] }` (api), `offeredTools` dans le profil et `offeredOnlyA/B` dans le delta.

- [ ] **Step 1: Write the failing test (tracker)**

Append to `sandbox-opencode/tests/config-capture.test.ts`:

```ts
import { OfferedTracker } from "../plugins/config-capture/capture-lib.ts"

test("OfferedTracker scopes tools to the current session and resets on change", () => {
  const t = new OfferedTracker()
  t.observe("s1"); t.add("bash"); t.add("read")
  assert.deepEqual(t.snapshot("s1"), ["bash", "read"])
  t.observe("s2"); t.add("edit")
  assert.deepEqual(t.snapshot("s2"), ["edit"])
  assert.deepEqual(t.snapshot("s1"), []) // reset when the session changes
  t.add("glob")
  assert.deepEqual(t.snapshot("s2"), ["edit", "glob"])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/riko/workspace/sandbox-opencode && node --test 'tests/config-capture.test.ts'`
Expected: FAIL — `OfferedTracker` is not exported.

- [ ] **Step 3: Implement `OfferedTracker`**

Append to `sandbox-opencode/plugins/config-capture/capture-lib.ts`:

```ts
export class OfferedTracker {
  private sessionId: string | null = null
  private tools = new Set<string>()

  observe(sessionId: string): void {
    if (sessionId !== this.sessionId) {
      this.sessionId = sessionId
      this.tools = new Set()
    }
  }

  add(toolID: string): void {
    if (this.sessionId) this.tools.add(toolID)
  }

  snapshot(sessionId: string): string[] {
    return this.sessionId === sessionId ? [...this.tools].sort() : []
  }
}
```

- [ ] **Step 4: Wire the tracker into the plugin**

In `sandbox-opencode/plugins/config-capture/config-capture.ts`, import `OfferedTracker`, then:

- instantiate `const offered = new OfferedTracker()` and `const meta = new Map<string, { agent: any; model: any; configId: string }>()`;
- replace the hooks with:

```ts
config: async (raw: any) => {
  config = compactConfig(raw, listSkills())
  recordConfig(config)
},
event: async ({ event }: { event: { type: string; properties?: any } }) => {
  if (event.type !== "session.idle") return
  const sessionId = event.properties?.sessionID
  if (sessionId) {
    const m = meta.get(sessionId)
    if (m) {
      ensureState()
      appendFileSync(
        join(STATE_DIR, "captures.jsonl"),
        JSON.stringify({
          sessionId,
          profile: process.env.OPENCODE_PROFILE ?? null,
          agent: m.agent,
          model: m.model,
          configId: m.configId,
          offeredTools: offered.snapshot(sessionId),
          at: Date.now(),
        }) + "\n",
      )
    }
  }
  snapshotSoon()
},
"tool.definition": async (input: { toolID: string }) => {
  offered.add(input.toolID)
},
"chat.message": async (input: any) => {
  if (!config) return
  offered.observe(input.sessionID)
  meta.set(input.sessionID, {
    agent: input.agent ?? null,
    model: input.model ?? null,
    configId: computeConfigId(config),
  })
},
```

Remove the previous body of `event` and `chat.message` (the old `chat.message` wrote `captures.jsonl`; the write now happens on `session.idle` so it can include `offeredTools`).

- [ ] **Step 5: Run sandbox tests**

Run: `cd /home/riko/workspace/sandbox-opencode && node --test 'tests/**/*.test.ts'`
Expected: PASS (all files).

- [ ] **Step 6: Write the failing test (diff)**

Create `ia-dashboard/api/src/opencode/offered.spec.ts`:

```ts
import { offeredDiff } from "./offered";

test("offeredDiff returns the symmetric difference, sorted", () => {
  expect(offeredDiff(["bash", "read"], ["bash", "edit"])).toEqual({
    onlyA: ["read"],
    onlyB: ["edit"],
  });
  expect(offeredDiff([], ["x"])).toEqual({ onlyA: [], onlyB: ["x"] });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `pnpm --filter @ia-dashboard/api test -- offered.spec`
Expected: FAIL — module not found.

- [ ] **Step 8: Implement `offeredDiff` and wire it**

Create `ia-dashboard/api/src/opencode/offered.ts`:

```ts
export function offeredDiff(a: string[], b: string[]): { onlyA: string[]; onlyB: string[] } {
  const sa = new Set(a);
  const sb = new Set(b);
  return {
    onlyA: [...sa].filter((t) => !sb.has(t)).sort(),
    onlyB: [...sb].filter((t) => !sa.has(t)).sort(),
  };
}
```

In `session-sources.ts`, add `offeredTools: string[]` to `SessionConfigSnapshot`, set `offeredTools: c.offeredTools ?? []` in the captures loader (and `[]` in the `capture` fallback), and in `capture()` return `offeredTools`.

In `sessions.service.ts` `compare()`, import `offeredDiff` and add to the returned result:

```ts
const offered = offeredDiff(pa.offeredTools, pb.offeredTools);
// inside delta:
offeredOnlyA: offered.onlyA,
offeredOnlyB: offered.onlyB,
```

And in `profile()`, add `offeredTools: capture?.offeredTools ?? []` to the returned object.

- [ ] **Step 9: Show the offered diff in the UI**

In `webapp/src/views/CompareView.tsx`, add a card after the tools table:

```tsx
{(data.delta.offeredOnlyA.length > 0 || data.delta.offeredOnlyB.length > 0) && (
  <Card className="col-span-2">
    <h3 className="mb-2 font-semibold">Outils offerts en plus</h3>
    <p className="text-sm">A uniquement : {data.delta.offeredOnlyA.join(", ") || "—"}</p>
    <p className="text-sm">B uniquement : {data.delta.offeredOnlyB.join(", ") || "—"}</p>
  </Card>
)}
```

- [ ] **Step 10: Run all tests + typecheck**

Run:
```bash
cd /home/riko/workspace-ia/ia-dashboard
pnpm --filter @ia-dashboard/api test && pnpm --filter @ia-dashboard/api typecheck
pnpm --filter @ia-dashboard/webapp test && pnpm --filter @ia-dashboard/webapp typecheck
```
Expected: all PASS.

- [ ] **Step 11: Commit (both repos)**

```bash
cd /home/riko/workspace/sandbox-opencode
git add plugins/config-capture/capture-lib.ts plugins/config-capture/config-capture.ts tests/config-capture.test.ts
git commit -m "feat(vm): capture offered toolset per session"

cd /home/riko/workspace-ia/ia-dashboard
git add api/src/opencode/offered.ts api/src/opencode/offered.spec.ts api/src/opencode/session-sources.ts api/src/sessions/sessions.service.ts webapp/src/views/CompareView.tsx
git commit -m "feat(api,webapp): offered toolset diff in compare"
```

---

## Self-Review

- **Spec coverage:** plugin (Tasks 1–2, 10) ✓ ; device + scripts (Task 3) ✓ ; reader tree/calls/steps/tools (Task 4) ✓ ; multi-source + captures + générations (Task 5) ✓ ; API compare + deltas + 404 (Task 6) ✓ ; outils offerts + `offeredOnlyA/B` (Task 10) ✓ ; UI picker + deltas + source + offered diff (Tasks 7–8, 10) ✓ ; spec recopié dans sandbox-opencode (Task 9) ✓. Volontairement hors v1 : `durationMs` (spec mis à jour, section Hors périmètre).
- **Placeholders:** aucun TBD. La note `@testing-library/react` de la Task 8 et l'heuristique `tool.definition` de la Task 10 sont des vérifications explicites, pas des placeholders.
- **Type consistency:** `SessionCall`/`SessionStep`/`ToolUsage` définis Task 4 et réutilisés Tasks 5–6 ; `SessionConfigSnapshot` (avec `offeredTools`) défini/enrichi Tasks 5 et 10, consommé Task 6/10 ; `source` ajouté à `OpenCodeSession` Task 5 et renvoyé par `toSession` Task 4 ; `compareReducer.data.delta.cost` cohérent entre Tasks 7 et 8 ; `offeredDiff` produit Task 10 et consommé par `compare`.

