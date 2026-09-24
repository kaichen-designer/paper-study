# Paper Library Organization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user rename a paper, remove it recoverably, and sort the library into three manual reading stages.

**Architecture:** Two new columns on `papers` — `reading_stage` (three-valued) and `deleted_at` (timestamp, null means present). All completion state flows through one writer, `setReadingStage`, so `reading_stage`, `finished_reading`, and `finished_at` can never disagree. The library becomes a client component tree so cards can act, with a trash toggle rather than a separate route.

**Tech Stack:** Next.js 14 App Router, React 18, Supabase (PostgREST + RLS), Vitest + Testing Library, TypeScript.

**Spec:** `openspec/changes/paper-library-organization/` — read `design.md` for the decisions and `specs/paper-library/spec.md` for the normative requirements. Both travel with this plan.

## Global Constraints

- Query functions MUST NOT accept a `userId`/`user_id` parameter. Ownership is enforced by the `papers_update_own` / `papers_delete_own` / `papers_select_own` RLS policies. This is the established pattern in `lib/papers/queries.ts` and `lib/reading-completion/queries.ts`.
- Every `.update()` and `.delete()` MUST chain `.select().single()`. Without it a zero-row match (wrong id, or a row RLS hides) succeeds silently with nothing changed. See the comment on `markReachedLastPage` for the full rationale.
- Schema changes go in `lib/supabase/schema.sql` using `if not exists` forms. That file is applied by hand in the Supabase SQL editor and MUST stay safe to run repeatedly. There is no migration runner in this project.
- UI copy is Traditional Chinese. Stage labels are exactly `正在讀`, `接下來要讀`, `讀完了`.
- Run `npx vitest run <file>` for a single file. The full suite is `npx vitest run`.
- Commit after every task.

**Deviation from design.md, recorded deliberately:** `design.md` says `finished_at` is stamped "若原本為 null". This plan always stamps the current time when the stage becomes `finished`. Reading the row first to preserve an older timestamp would cost a read-modify-write round trip, and the UI never offers "finished" for a paper already in that stage, so the case cannot arise through the interface. The spec requirement ("SHALL record the time it was finished") is satisfied either way.

---

### Task 1: Schema columns

**Files:**
- Modify: `lib/supabase/schema.sql`

**Interfaces:**
- Consumes: nothing
- Produces: `papers.reading_stage` (text, not null, default `'up_next'`, constrained to `up_next` / `reading` / `finished`), `papers.deleted_at` (timestamptz, nullable)

- [ ] **Step 1: Add the columns, constraint, backfill, and index**

Append to `lib/supabase/schema.sql`, immediately after the `create index ... papers_user_id_idx` line:

```sql
-- Reading stage. Three-valued rather than two booleans so that an
-- impossible combination cannot be represented at all. `finished_reading`
-- and `finished_at` are kept for the existing reading-completion flow and
-- are written only by setReadingStage, so the two can never disagree.
alter table papers
  add column if not exists reading_stage text not null default 'up_next';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'papers_reading_stage_check'
  ) then
    alter table papers
      add constraint papers_reading_stage_check
      check (reading_stage in ('up_next', 'reading', 'finished'));
  end if;
end $$;

-- Backfill: a paper already marked finished belongs in the finished
-- stage; everything else starts in up_next.
update papers set reading_stage = 'finished'
  where finished_reading = true and reading_stage <> 'finished';

-- Soft delete. A timestamp rather than a boolean, so it answers both
-- "is this removed" and "when was it removed" — the trash lists by
-- removal time, and a retention policy later needs no schema change.
alter table papers
  add column if not exists deleted_at timestamptz;

create index if not exists papers_user_deleted_idx
  on papers (user_id, deleted_at);
```

- [ ] **Step 2: Verify the file is safe to run twice**

Read the appended block back. Every statement must be `add column if not exists`, `create index if not exists`, a guarded `do $$` block, or an idempotent `update`. Confirm no bare `alter table ... add constraint` outside the guard.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/schema.sql
git commit -m "Add reading_stage and deleted_at columns to papers"
```

- [ ] **Step 4: Tell the user to apply it**

This project has no migration runner. Print exactly:

> `lib/supabase/schema.sql` 已更新。請到 Supabase SQL editor 執行整份檔案（可重複執行）。執行後才能進行後續任務。

Do not proceed past Task 2's tests without the user confirming they ran it — the unit tests mock Supabase and will pass regardless, but the app will fail at runtime.

---

### Task 2: The single writer for reading stage

**Files:**
- Create: `lib/papers/reading-stage.ts`
- Create: `lib/papers/reading-stage.test.ts`
- Modify: `lib/papers/queries.ts` (extend the `Paper` type)

**Interfaces:**
- Consumes: `Paper` from `lib/papers/queries.ts`
- Produces:
  - `type ReadingStage = "up_next" | "reading" | "finished"`
  - `const READING_STAGES: readonly ReadingStage[]`
  - `const STAGE_LABELS: Record<ReadingStage, string>`
  - `setReadingStage(supabase: SupabaseClient, paperId: string, stage: ReadingStage): Promise<Paper>`

- [ ] **Step 1: Extend the Paper type**

In `lib/papers/queries.ts`, add two fields to the `Paper` type:

```ts
  reading_stage: "up_next" | "reading" | "finished";
  deleted_at: string | null;
```

- [ ] **Step 2: Write the failing test**

Create `lib/papers/reading-stage.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { setReadingStage } from "./reading-stage";

function makeUpdateMock(result: { data: unknown; error: unknown } = { data: { id: "p1" }, error: null }) {
  const singleMock = vi.fn().mockResolvedValue(result);
  const selectMock = vi.fn().mockReturnValue({ single: singleMock });
  const eqMock = vi.fn().mockReturnValue({ select: selectMock });
  const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
  const fromMock = vi.fn().mockReturnValue({ update: updateMock });
  const supabase = { from: fromMock } as unknown as SupabaseClient;
  return { supabase, fromMock, updateMock, eqMock };
}

describe("setReadingStage", () => {
  it("records completion when the stage becomes finished", async () => {
    const { supabase, updateMock, eqMock } = makeUpdateMock();

    await setReadingStage(supabase, "p1", "finished");

    const patch = updateMock.mock.calls[0][0];
    expect(patch.reading_stage).toBe("finished");
    expect(patch.finished_reading).toBe(true);
    expect(typeof patch.finished_at).toBe("string");
    expect(eqMock).toHaveBeenCalledWith("id", "p1");
  });

  it("clears completion when the stage moves away from finished", async () => {
    const { supabase, updateMock } = makeUpdateMock();

    await setReadingStage(supabase, "p1", "reading");

    const patch = updateMock.mock.calls[0][0];
    expect(patch.reading_stage).toBe("reading");
    expect(patch.finished_reading).toBe(false);
    expect(patch.finished_at).toBeNull();
  });

  it("writes reading_stage, finished_reading and finished_at together, so the two cannot disagree", async () => {
    const { supabase, updateMock } = makeUpdateMock();

    await setReadingStage(supabase, "p1", "up_next");

    expect(Object.keys(updateMock.mock.calls[0][0]).sort()).toEqual([
      "finished_at",
      "finished_reading",
      "reading_stage",
    ]);
  });

  it("rejects a stage outside the three known values", async () => {
    const { supabase, updateMock } = makeUpdateMock();

    await expect(
      setReadingStage(supabase, "p1", "archived" as never)
    ).rejects.toThrow("archived");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("throws when the update matches no row, instead of succeeding silently", async () => {
    const { supabase } = makeUpdateMock({ data: null, error: { message: "no rows" } });

    await expect(setReadingStage(supabase, "p1", "reading")).rejects.toThrow("no rows");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run lib/papers/reading-stage.test.ts`
Expected: FAIL — cannot resolve `./reading-stage`.

- [ ] **Step 4: Write the implementation**

Create `lib/papers/reading-stage.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Paper } from "@/lib/papers/queries";

export type ReadingStage = "up_next" | "reading" | "finished";

export const READING_STAGES: readonly ReadingStage[] = ["reading", "up_next", "finished"];

/** Display order is deliberate: what you are reading now comes first. */
export const STAGE_LABELS: Record<ReadingStage, string> = {
  reading: "正在讀",
  up_next: "接下來要讀",
  finished: "讀完了",
};

/**
 * The ONLY writer of a paper's reading stage, and therefore the only
 * writer of `finished_reading` and `finished_at`.
 *
 * `finished_reading` predates the stage column and is still read by the
 * reading view. Two independent writers would eventually disagree — the
 * library saying finished while the reader says not — so every path that
 * changes completion goes through here and sets all three fields in one
 * update.
 *
 * Access-scoping note: no `userId` parameter, matching
 * lib/reading-completion/queries.ts. `.select().single()` turns a
 * zero-row match (wrong id, or a row the RLS policy hides) into a thrown
 * error rather than a silent no-op.
 */
export async function setReadingStage(
  supabase: SupabaseClient,
  paperId: string,
  stage: ReadingStage
): Promise<Paper> {
  if (!READING_STAGES.includes(stage)) {
    throw new Error(`Unknown reading stage: ${stage}`);
  }

  const finished = stage === "finished";
  const { data, error } = await supabase
    .from("papers")
    .update({
      reading_stage: stage,
      finished_reading: finished,
      finished_at: finished ? new Date().toISOString() : null,
    })
    .eq("id", paperId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to set reading stage: ${error.message}`);
  }

  return data as Paper;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/papers/reading-stage.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/papers/reading-stage.ts lib/papers/reading-stage.test.ts lib/papers/queries.ts
git commit -m "Add setReadingStage as the single writer of completion state"
```

---

### Task 3: Route the reader's finish action through the single writer

**Files:**
- Modify: `lib/reading-completion/queries.ts`
- Modify: `lib/reading-completion/queries.test.ts`

**Interfaces:**
- Consumes: `setReadingStage` from Task 2
- Produces: `markFinishedReading` keeps its existing signature, so `app/library/[id]/PaperReader.tsx` needs no change

- [ ] **Step 1: Write the failing test**

Add to `lib/reading-completion/queries.test.ts`:

```ts
  it("sets the reading stage as well, so the library and the reader cannot disagree", async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: { id: "p1" }, error: null });
    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    const supabase = {
      from: vi.fn().mockReturnValue({ update: updateMock }),
    } as unknown as SupabaseClient;

    await markFinishedReading(supabase, "p1");

    expect(updateMock.mock.calls[0][0]).toMatchObject({
      reading_stage: "finished",
      finished_reading: true,
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/reading-completion/queries.test.ts`
Expected: FAIL — the patch has no `reading_stage` key.

- [ ] **Step 3: Delegate to the single writer**

In `lib/reading-completion/queries.ts`, replace the body of `markFinishedReading` and add the import:

```ts
import { setReadingStage } from "@/lib/papers/reading-stage";
```

```ts
/**
 * Marks a paper as finished reading.
 *
 * Delegates to setReadingStage rather than writing `finished_reading`
 * directly: the library's stage column and this flag describe the same
 * fact, and a second writer is how they drift apart. The signature is
 * unchanged so callers need not care.
 */
export async function markFinishedReading(supabase: SupabaseClient, paperId: string): Promise<Paper> {
  return setReadingStage(supabase, paperId, "finished");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/reading-completion/queries.test.ts "app/library/[id]/PaperReader.test.tsx"`
Expected: PASS. The existing `markFinishedReading` tests must still pass — if one asserted the exact update payload, update it to `toMatchObject` rather than deleting it.

- [ ] **Step 5: Commit**

```bash
git add lib/reading-completion/queries.ts lib/reading-completion/queries.test.ts
git commit -m "Route the reader's finish action through setReadingStage"
```

---

### Task 4: Rename a paper

**Files:**
- Modify: `lib/papers/queries.ts`
- Modify: `lib/papers/queries.test.ts`

**Interfaces:**
- Produces: `renamePaper(supabase: SupabaseClient, paperId: string, title: string): Promise<Paper>`

- [ ] **Step 1: Write the failing test**

Add to `lib/papers/queries.test.ts`:

```ts
describe("renamePaper", () => {
  function makeRenameMock() {
    const singleMock = vi.fn().mockResolvedValue({ data: { id: "p1" }, error: null });
    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    const supabase = {
      from: vi.fn().mockReturnValue({ update: updateMock }),
    } as unknown as SupabaseClient;
    return { supabase, updateMock };
  }

  it("stores the title with surrounding whitespace removed", async () => {
    const { supabase, updateMock } = makeRenameMock();

    await renamePaper(supabase, "p1", "  Attention Is All You Need  ");

    expect(updateMock).toHaveBeenCalledWith({ title: "Attention Is All You Need" });
  });

  it("rejects a title that is empty once trimmed, without writing", async () => {
    const { supabase, updateMock } = makeRenameMock();

    await expect(renamePaper(supabase, "p1", "   ")).rejects.toThrow();
    await expect(renamePaper(supabase, "p1", "")).rejects.toThrow();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/papers/queries.test.ts`
Expected: FAIL — `renamePaper` is not exported.

- [ ] **Step 3: Write the implementation**

Add to `lib/papers/queries.ts`:

```ts
/**
 * Renames a paper.
 *
 * A title of only whitespace is rejected rather than stored: the library
 * would render an unlabelled, unidentifiable card, and the upload flow
 * guarantees a non-empty title, so nothing should be able to produce one.
 *
 * Access-scoping note: no `userId` parameter; the `papers_update_own` RLS
 * policy scopes the row. `.select().single()` makes a zero-row match an
 * error rather than a silent no-op.
 */
export async function renamePaper(
  supabase: SupabaseClient,
  paperId: string,
  title: string
): Promise<Paper> {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    throw new Error("Cannot rename a paper to an empty title.");
  }

  const { data, error } = await supabase
    .from("papers")
    .update({ title: trimmed })
    .eq("id", paperId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to rename paper: ${error.message}`);
  }

  return data as Paper;
}
```

Add `renamePaper` to the test file's import from `./queries`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/papers/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/papers/queries.ts lib/papers/queries.test.ts
git commit -m "Add renamePaper, rejecting a blank title"
```

---

### Task 5: Recoverable removal

**Files:**
- Modify: `lib/papers/queries.ts`
- Modify: `lib/papers/queries.test.ts`

**Interfaces:**
- Produces:
  - `softDeletePaper(supabase, paperId): Promise<void>`
  - `restorePaper(supabase, paperId): Promise<void>`
  - `listDeletedPapers(supabase): Promise<Paper[]>`
  - `listPapers` now excludes removed papers

- [ ] **Step 1: Write the failing test**

Add to `lib/papers/queries.test.ts`:

```ts
describe("removal and restoration", () => {
  function makeListMock(rows: unknown[] = []) {
    const orderMock = vi.fn().mockResolvedValue({ data: rows, error: null });
    const isMock = vi.fn().mockReturnValue({ order: orderMock });
    const notMock = vi.fn().mockReturnValue({ order: orderMock });
    const selectMock = vi.fn().mockReturnValue({ is: isMock, not: notMock });
    const supabase = {
      from: vi.fn().mockReturnValue({ select: selectMock }),
    } as unknown as SupabaseClient;
    return { supabase, isMock, notMock, orderMock };
  }

  function makeUpdateMock() {
    const singleMock = vi.fn().mockResolvedValue({ data: { id: "p1" }, error: null });
    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    const supabase = {
      from: vi.fn().mockReturnValue({ update: updateMock }),
    } as unknown as SupabaseClient;
    return { supabase, updateMock };
  }

  it("hides removed papers from the library listing", async () => {
    const { supabase, isMock } = makeListMock();

    await listPapers(supabase);

    expect(isMock).toHaveBeenCalledWith("deleted_at", null);
  });

  it("lists only removed papers, most recently removed first", async () => {
    const { supabase, notMock, orderMock } = makeListMock();

    await listDeletedPapers(supabase);

    expect(notMock).toHaveBeenCalledWith("deleted_at", "is", null);
    expect(orderMock).toHaveBeenCalledWith("deleted_at", { ascending: false });
  });

  it("stamps the removal time rather than destroying the row", async () => {
    const { supabase, updateMock } = makeUpdateMock();

    await softDeletePaper(supabase, "p1");

    expect(typeof updateMock.mock.calls[0][0].deleted_at).toBe("string");
  });

  it("restores a paper without touching its reading stage", async () => {
    const { supabase, updateMock } = makeUpdateMock();

    await restorePaper(supabase, "p1");

    expect(updateMock).toHaveBeenCalledWith({ deleted_at: null });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/papers/queries.test.ts`
Expected: FAIL — `listDeletedPapers` / `softDeletePaper` / `restorePaper` are not exported, and `listPapers` does not filter.

- [ ] **Step 3: Write the implementation**

In `lib/papers/queries.ts`, add `.is("deleted_at", null)` to `listPapers` between `.select("*")` and `.order(...)`, and add:

```ts
/**
 * Removes a paper from the library without destroying it.
 *
 * A timestamp rather than a boolean: it answers both "is this removed"
 * and "when", which is what the trash orders by, and leaves room for a
 * retention policy without another schema change.
 */
export async function softDeletePaper(supabase: SupabaseClient, paperId: string): Promise<void> {
  const { error } = await supabase
    .from("papers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", paperId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to remove paper: ${error.message}`);
  }
}

/** Returns a removed paper to the library, under the stage it had before. */
export async function restorePaper(supabase: SupabaseClient, paperId: string): Promise<void> {
  const { error } = await supabase
    .from("papers")
    .update({ deleted_at: null })
    .eq("id", paperId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to restore paper: ${error.message}`);
  }
}

/** Lists removed papers for the trash view, most recently removed first. */
export async function listDeletedPapers(supabase: SupabaseClient): Promise<Paper[]> {
  const { data, error } = await supabase
    .from("papers")
    .select("*")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list removed papers: ${error.message}`);
  }

  return (data ?? []) as Paper[];
}
```

Update the existing `listPapers` test mock so `select()` returns an object exposing `is`, and add the new names to the test file's import.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/papers/queries.test.ts`
Expected: PASS, including the pre-existing `listPapers` tests.

- [ ] **Step 5: Commit**

```bash
git add lib/papers/queries.ts lib/papers/queries.test.ts
git commit -m "Remove papers recoverably via deleted_at"
```

---

### Task 6: Permanent deletion

**Files:**
- Modify: `lib/papers/queries.ts`
- Modify: `lib/papers/queries.test.ts`

**Interfaces:**
- Produces: `purgePaper(supabase: SupabaseClient, paper: Pick<Paper, "id" | "storage_path">): Promise<void>`

Takes the paper, not just an id, because the storage path is needed after the row is gone.

- [ ] **Step 1: Write the failing test**

Add to `lib/papers/queries.test.ts`:

```ts
describe("purgePaper", () => {
  function makePurgeMock(storageError: unknown = null) {
    const order: string[] = [];
    const singleMock = vi.fn().mockImplementation(async () => {
      order.push("row");
      return { data: { id: "p1" }, error: null };
    });
    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const deleteMock = vi.fn().mockReturnValue({ eq: eqMock });
    const removeMock = vi.fn().mockImplementation(async () => {
      order.push("storage");
      return { error: storageError };
    });
    const supabase = {
      from: vi.fn().mockReturnValue({ delete: deleteMock }),
      storage: { from: vi.fn().mockReturnValue({ remove: removeMock }) },
    } as unknown as SupabaseClient;
    return { supabase, order, removeMock, eqMock };
  }

  it("deletes the row before the stored file, so no paper can point at a missing file", async () => {
    const { supabase, order, removeMock, eqMock } = makePurgeMock();

    await purgePaper(supabase, { id: "p1", storage_path: "u1/p1.pdf" });

    expect(order).toEqual(["row", "storage"]);
    expect(eqMock).toHaveBeenCalledWith("id", "p1");
    expect(removeMock).toHaveBeenCalledWith(["u1/p1.pdf"]);
  });

  it("still succeeds when the stored file cannot be deleted", async () => {
    const { supabase } = makePurgeMock({ message: "not found" });

    await expect(
      purgePaper(supabase, { id: "p1", storage_path: "u1/p1.pdf" })
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/papers/queries.test.ts`
Expected: FAIL — `purgePaper` is not exported.

- [ ] **Step 3: Write the implementation**

Add to `lib/papers/queries.ts`:

```ts
/**
 * Permanently deletes a paper, its notes, annotations and reflection
 * messages (by `on delete cascade`), and its stored PDF.
 *
 * Order matters and is deliberate: the row goes first, then the file on
 * a best-effort basis. Doing it the other way round risks leaving a row
 * whose file is gone — a paper in the library that cannot be opened.
 * This way the worst case is an orphaned file: wasted space that shows
 * up nowhere and can be swept later. Auditable waste beats broken state.
 */
export async function purgePaper(
  supabase: SupabaseClient,
  paper: Pick<Paper, "id" | "storage_path">
): Promise<void> {
  const { error } = await supabase
    .from("papers")
    .delete()
    .eq("id", paper.id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to delete paper: ${error.message}`);
  }

  // Best effort: a failure here leaves an orphaned file, which is
  // preferable to reporting a failure for a deletion that did happen.
  await supabase.storage.from("papers").remove([paper.storage_path]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/papers/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/papers/queries.ts lib/papers/queries.test.ts
git commit -m "Add purgePaper, deleting the row before the stored file"
```

---

### Task 7: The paper card

**Files:**
- Create: `components/PaperCard.tsx`
- Create: `components/PaperCard.test.tsx`

**Interfaces:**
- Consumes: `renamePaper`, `softDeletePaper`, `restorePaper`, `purgePaper` from `lib/papers/queries`; `setReadingStage`, `READING_STAGES`, `STAGE_LABELS` from `lib/papers/reading-stage`; `getSupabaseBrowserClient` from `lib/supabase/client`
- Produces: default export `PaperCard`, props `{ paper: PaperWithFileUrl; noteCount: number; onChanged: () => void }`

`PaperWithFileUrl` moves here from `PaperList.tsx` in Task 8; for now import it from `./PaperList`.

- [ ] **Step 1: Write the failing test**

Create `components/PaperCard.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PaperCard from "./PaperCard";

const renamePaperMock = vi.fn();
const setReadingStageMock = vi.fn();
const softDeletePaperMock = vi.fn();
const purgePaperMock = vi.fn();

vi.mock("@/lib/papers/queries", () => ({
  renamePaper: (...a: unknown[]) => renamePaperMock(...a),
  softDeletePaper: (...a: unknown[]) => softDeletePaperMock(...a),
  restorePaper: vi.fn(),
  purgePaper: (...a: unknown[]) => purgePaperMock(...a),
}));

vi.mock("@/lib/papers/reading-stage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/papers/reading-stage")>(
    "@/lib/papers/reading-stage"
  );
  return { ...actual, setReadingStage: (...a: unknown[]) => setReadingStageMock(...a) };
});

vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => ({}) }));
vi.mock("./PaperThumbnail", () => ({ default: () => <div data-testid="thumb" /> }));

const paper = {
  id: "p1",
  user_id: "u1",
  title: "Guidelines for Human-AI Interaction",
  storage_path: "u1/p1.pdf",
  uploaded_at: "2026-09-01T00:00:00.000Z",
  metadata: {},
  reached_last_page: false,
  finished_reading: false,
  finished_at: null,
  imported_to_detabase: false,
  reading_stage: "up_next" as const,
  deleted_at: null,
  fileUrl: "/x.pdf",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PaperCard", () => {
  it("renames the paper and shows the new title", async () => {
    renamePaperMock.mockResolvedValue({ ...paper, title: "新標題" });
    render(<PaperCard paper={paper} noteCount={0} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "重新命名" }));
    fireEvent.change(screen.getByLabelText("論文標題"), { target: { value: "  新標題  " } });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    await waitFor(() => expect(renamePaperMock).toHaveBeenCalledWith({}, "p1", "  新標題  "));
    await waitFor(() => expect(screen.getByText("新標題")).toBeInTheDocument());
  });

  it("reports a blank title instead of saving it", async () => {
    renamePaperMock.mockRejectedValue(new Error("empty"));
    render(<PaperCard paper={paper} noteCount={0} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "重新命名" }));
    fireEvent.change(screen.getByLabelText("論文標題"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText("Guidelines for Human-AI Interaction")).toBeInTheDocument();
  });

  it("changes the reading stage only when asked", async () => {
    setReadingStageMock.mockResolvedValue({ ...paper, reading_stage: "reading" });
    const onChanged = vi.fn();
    render(<PaperCard paper={paper} noteCount={0} onChanged={onChanged} />);

    // Rendering alone must not move a paper between stages.
    expect(setReadingStageMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("閱讀階段"), { target: { value: "reading" } });

    await waitFor(() => expect(setReadingStageMock).toHaveBeenCalledWith({}, "p1", "reading"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("removes a paper without asking, because removal is recoverable", async () => {
    softDeletePaperMock.mockResolvedValue(undefined);
    render(<PaperCard paper={paper} noteCount={0} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "移至回收筒" }));

    await waitFor(() => expect(softDeletePaperMock).toHaveBeenCalledWith({}, "p1"));
  });

  it("requires confirmation naming the note count before permanent deletion", async () => {
    render(
      <PaperCard paper={{ ...paper, deleted_at: "2026-09-20T00:00:00.000Z" }} noteCount={12} onChanged={vi.fn()} />
    );

    fireEvent.click(screen.getByRole("button", { name: "永久刪除" }));

    expect(purgePaperMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("12");

    fireEvent.click(screen.getByRole("button", { name: "確定永久刪除" }));
    await waitFor(() => expect(purgePaperMock).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/PaperCard.test.tsx`
Expected: FAIL — cannot resolve `./PaperCard`.

- [ ] **Step 3: Write the component**

Create `components/PaperCard.tsx`. It is a client component: every action writes through the browser Supabase client.

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { purgePaper, renamePaper, restorePaper, softDeletePaper } from "@/lib/papers/queries";
import {
  READING_STAGES,
  STAGE_LABELS,
  setReadingStage,
  type ReadingStage,
} from "@/lib/papers/reading-stage";
import PaperThumbnail from "./PaperThumbnail";
import type { PaperWithFileUrl } from "./PaperList";

export default function PaperCard({
  paper,
  noteCount,
  onChanged,
}: {
  paper: PaperWithFileUrl;
  noteCount: number;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState(paper.title);
  const [draft, setDraft] = useState(paper.title);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const removed = paper.deleted_at !== null;

  async function handleRename() {
    const supabase = getSupabaseBrowserClient();
    try {
      const updated = await renamePaper(supabase, paper.id, draft);
      setTitle(updated.title);
      setEditing(false);
      setError(null);
      onChanged();
    } catch {
      setError("標題不能是空白。");
    }
  }

  async function handleStageChange(stage: ReadingStage) {
    const supabase = getSupabaseBrowserClient();
    try {
      await setReadingStage(supabase, paper.id, stage);
      setError(null);
      onChanged();
    } catch {
      setError("階段更新失敗,請稍後再試。");
    }
  }

  async function handleRemove() {
    const supabase = getSupabaseBrowserClient();
    try {
      await softDeletePaper(supabase, paper.id);
      onChanged();
    } catch {
      setError("移至回收筒失敗,請稍後再試。");
    }
  }

  async function handleRestore() {
    const supabase = getSupabaseBrowserClient();
    try {
      await restorePaper(supabase, paper.id);
      onChanged();
    } catch {
      setError("還原失敗,請稍後再試。");
    }
  }

  async function handlePurge() {
    const supabase = getSupabaseBrowserClient();
    try {
      await purgePaper(supabase, paper);
      setConfirming(false);
      onChanged();
    } catch {
      setError("永久刪除失敗,請稍後再試。");
    }
  }

  return (
    <li className="paper-card">
      <Link href={`/library/${paper.id}`} className="paper-card-link">
        <PaperThumbnail fileUrl={paper.fileUrl} />
        {!editing && <span className="paper-card-title">{title}</span>}
      </Link>

      {editing && (
        <div className="paper-card-rename">
          <label htmlFor={`title-${paper.id}`}>論文標題</label>
          <input
            id={`title-${paper.id}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="button" onClick={handleRename}>
            儲存
          </button>
          <button type="button" onClick={() => setEditing(false)}>
            取消
          </button>
        </div>
      )}

      {!removed && (
        <div className="paper-card-actions">
          <button type="button" onClick={() => setEditing(true)}>
            重新命名
          </button>
          <label htmlFor={`stage-${paper.id}`}>閱讀階段</label>
          <select
            id={`stage-${paper.id}`}
            value={paper.reading_stage}
            onChange={(event) => handleStageChange(event.target.value as ReadingStage)}
          >
            {READING_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
          <button type="button" onClick={handleRemove}>
            移至回收筒
          </button>
        </div>
      )}

      {removed && (
        <div className="paper-card-actions">
          <button type="button" onClick={handleRestore}>
            還原
          </button>
          <button type="button" onClick={() => setConfirming(true)}>
            永久刪除
          </button>
        </div>
      )}

      {confirming && (
        <div role="alertdialog" className="paper-card-confirm">
          <p>
            將永久刪除這篇論文與它的 {noteCount} 筆筆記與畫記,無法復原。
          </p>
          <button type="button" onClick={handlePurge}>
            確定永久刪除
          </button>
          <button type="button" onClick={() => setConfirming(false)}>
            取消
          </button>
        </div>
      )}

      {error && <p role="alert">{error}</p>}
    </li>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/PaperCard.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add components/PaperCard.tsx components/PaperCard.test.tsx
git commit -m "Add PaperCard with rename, stage, remove and purge actions"
```

---

### Task 8: Group the library by stage

**Files:**
- Modify: `components/PaperList.tsx`
- Modify: `components/PaperList.test.tsx`

**Interfaces:**
- Consumes: `PaperCard` from Task 7
- Produces: `PaperList` props become `{ papers: PaperWithFileUrl[]; deletedPapers: PaperWithFileUrl[]; noteCounts: Record<string, number> }`

- [ ] **Step 1: Write the failing test**

Add to `components/PaperList.test.tsx` (mock `./PaperCard` so this test is about grouping only):

```tsx
vi.mock("./PaperCard", () => ({
  default: ({ paper }: { paper: { id: string; title: string } }) => (
    <li data-testid={`card-${paper.id}`}>{paper.title}</li>
  ),
}));
```

```tsx
  it("shows each paper under the group matching its reading stage", () => {
    render(
      <PaperList
        papers={[
          { ...base, id: "a", title: "A", reading_stage: "reading" },
          { ...base, id: "b", title: "B", reading_stage: "up_next" },
          { ...base, id: "c", title: "C", reading_stage: "finished" },
        ]}
        deletedPapers={[]}
        noteCounts={{}}
      />
    );

    for (const heading of ["正在讀", "接下來要讀", "讀完了"]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
  });

  it("does not render a heading for a stage with no papers", () => {
    render(
      <PaperList
        papers={[{ ...base, id: "a", title: "A", reading_stage: "reading" }]}
        deletedPapers={[]}
        noteCounts={{}}
      />
    );

    expect(screen.getByRole("heading", { name: "正在讀" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "讀完了" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "接下來要讀" })).toBeNull();
  });
```

Define `base` in the test file as the same paper shape used in `PaperCard.test.tsx`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/PaperList.test.tsx`
Expected: FAIL — no headings are rendered.

- [ ] **Step 3: Rewrite PaperList**

Replace `components/PaperList.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Paper } from "@/lib/papers/queries";
import { READING_STAGES, STAGE_LABELS } from "@/lib/papers/reading-stage";
import PaperCard from "./PaperCard";
import TrashToggle from "./TrashToggle";

export type PaperWithFileUrl = Paper & { fileUrl: string };

export default function PaperList({
  papers,
  deletedPapers,
  noteCounts,
}: {
  papers: PaperWithFileUrl[];
  deletedPapers: PaperWithFileUrl[];
  noteCounts: Record<string, number>;
}) {
  const router = useRouter();
  const [showingTrash, setShowingTrash] = useState(false);
  // The server component owns the data; refreshing re-runs it rather
  // than duplicating the paper list in client state.
  const refresh = () => router.refresh();

  if (showingTrash) {
    return (
      <>
        <TrashToggle showingTrash onToggle={() => setShowingTrash(false)} count={deletedPapers.length} />
        {deletedPapers.length === 0 ? (
          <p>回收筒是空的。</p>
        ) : (
          <ul className="paper-grid">
            {deletedPapers.map((paper) => (
              <PaperCard
                key={paper.id}
                paper={paper}
                noteCount={noteCounts[paper.id] ?? 0}
                onChanged={refresh}
              />
            ))}
          </ul>
        )}
      </>
    );
  }

  if (papers.length === 0) {
    return (
      <>
        <TrashToggle showingTrash={false} onToggle={() => setShowingTrash(true)} count={deletedPapers.length} />
        <p>尚未上傳任何論文,使用上方表單上傳第一份 PDF 開始閱讀。</p>
      </>
    );
  }

  return (
    <>
      <TrashToggle showingTrash={false} onToggle={() => setShowingTrash(true)} count={deletedPapers.length} />
      {READING_STAGES.map((stage) => {
        const inStage = papers.filter((paper) => paper.reading_stage === stage);
        // An empty stage renders nothing at all: a heading over no cards
        // reads as a fault rather than as an empty category.
        if (inStage.length === 0) return null;
        return (
          <section key={stage} className="paper-stage-group">
            <h2>{STAGE_LABELS[stage]}</h2>
            <ul className="paper-grid">
              {inStage.map((paper) => (
                <PaperCard
                  key={paper.id}
                  paper={paper}
                  noteCount={noteCounts[paper.id] ?? 0}
                  onChanged={refresh}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/PaperList.test.tsx`
Expected: FAIL on the missing `./TrashToggle` — that is Task 9. Create a placeholder only if the runner cannot resolve the module; otherwise proceed to Task 9 and re-run both together.

- [ ] **Step 5: Commit**

```bash
git add components/PaperList.tsx components/PaperList.test.tsx
git commit -m "Group the library by reading stage"
```

---

### Task 9: The trash toggle

**Files:**
- Create: `components/TrashToggle.tsx`
- Create: `components/TrashToggle.test.tsx`

**Interfaces:**
- Produces: default export `TrashToggle`, props `{ showingTrash: boolean; onToggle: () => void; count: number }`

- [ ] **Step 1: Write the failing test**

Create `components/TrashToggle.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TrashToggle from "./TrashToggle";

describe("TrashToggle", () => {
  it("offers the trash with its count while showing the library", () => {
    const onToggle = vi.fn();
    render(<TrashToggle showingTrash={false} onToggle={onToggle} count={3} />);

    const button = screen.getByRole("button", { name: /回收筒/ });
    expect(button).toHaveTextContent("3");

    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalled();
  });

  it("offers the way back while showing the trash", () => {
    const onToggle = vi.fn();
    render(<TrashToggle showingTrash onToggle={onToggle} count={0} />);

    fireEvent.click(screen.getByRole("button", { name: "回到論文庫" }));
    expect(onToggle).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/TrashToggle.test.tsx`
Expected: FAIL — cannot resolve `./TrashToggle`.

- [ ] **Step 3: Write the component**

Create `components/TrashToggle.tsx`:

```tsx
"use client";

/**
 * A toggle inside the library rather than a separate route. The trash is
 * a low-traffic place people leave immediately; a route of its own would
 * need navigation, a back path and an empty state of its own, none of
 * which earn their keep at this size.
 */
export default function TrashToggle({
  showingTrash,
  onToggle,
  count,
}: {
  showingTrash: boolean;
  onToggle: () => void;
  count: number;
}) {
  return (
    <button type="button" className="trash-toggle" onClick={onToggle}>
      {showingTrash ? "回到論文庫" : `回收筒 (${count})`}
    </button>
  );
}
```

- [ ] **Step 4: Run both test files to verify they pass**

Run: `npx vitest run components/TrashToggle.test.tsx components/PaperList.test.tsx`
Expected: PASS, including Task 8's grouping tests.

- [ ] **Step 5: Commit**

```bash
git add components/TrashToggle.tsx components/TrashToggle.test.tsx
git commit -m "Add the trash toggle"
```

---

### Task 10: Wire the library page and verify the whole change

**Files:**
- Modify: `app/library/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `listPapers`, `listDeletedPapers` from `lib/papers/queries`; `PaperList` from Task 8

- [ ] **Step 1: Supply both lists and the note counts**

Replace the body of `app/library/page.tsx`:

```tsx
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { listPapers, listDeletedPapers } from "@/lib/papers/queries";
import { getPaperSignedUrl } from "@/lib/papers/get-paper";
import PaperUpload from "@/components/PaperUpload";
import PaperList from "@/components/PaperList";

export default async function LibraryPage() {
  const supabase = await getSupabaseServerClient();
  const [papers, deletedPapers] = await Promise.all([
    listPapers(supabase),
    listDeletedPapers(supabase),
  ]);

  // Each card renders a thumbnail of the PDF's first page, which needs a
  // signed URL per paper (the storage bucket is private) — see
  // lib/papers/get-paper.ts for why a signed, not public, URL is required.
  const withFileUrls = async (rows: typeof papers) =>
    Promise.all(
      rows.map(async (paper) => ({
        ...paper,
        fileUrl: await getPaperSignedUrl(supabase, paper.storage_path),
      }))
    );

  // Counts back the permanent-deletion confirmation, which has to say
  // what goes with the paper.
  const { data: noteRows } = await supabase.from("notes").select("paper_id");
  const noteCounts: Record<string, number> = {};
  for (const row of noteRows ?? []) {
    const id = (row as { paper_id: string }).paper_id;
    noteCounts[id] = (noteCounts[id] ?? 0) + 1;
  }

  return (
    <main>
      <h1>我的論文庫</h1>
      <PaperUpload />
      <PaperList
        papers={await withFileUrls(papers)}
        deletedPapers={await withFileUrls(deletedPapers)}
        noteCounts={noteCounts}
      />
    </main>
  );
}
```

- [ ] **Step 2: Add the styles**

Append to `app/globals.css`:

```css
.paper-stage-group {
  margin-bottom: 1.5rem;
}

.paper-stage-group > h2 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  opacity: 0.8;
}

.paper-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
  margin-top: 0.4rem;
  font-size: 0.85rem;
}

.paper-card-rename {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.4rem;
}

.paper-card-confirm {
  margin-top: 0.5rem;
  padding: 0.6rem;
  border-radius: var(--radius-card);
  background: #4a1d1d;
  color: #ffd9d9;
}

.trash-toggle {
  margin-bottom: 1rem;
}
```

- [ ] **Step 3: Run the full suite, the type check and the build**

Run each and confirm no failures:

```bash
npx vitest run
```

```bash
npx tsc --noEmit -p tsconfig.json
```

```bash
npx next build
```

`tsc` reports two pre-existing errors in `lib/papers/upload.test.ts` and `lib/papers/validate-pdf.test.ts`. Those are unrelated to this change and must be the only ones.

- [ ] **Step 4: Commit and push**

```bash
git add app/library/page.tsx app/globals.css
git commit -m "Wire the library page to the grouped list and trash"
git push origin master
```

- [ ] **Step 5: Confirm the schema is applied**

Ask the user to confirm they ran `lib/supabase/schema.sql` in the Supabase SQL editor. Without it, the deployed app will fail on every library load, because `reading_stage` and `deleted_at` will not exist.

---

## Self-Review

**Spec coverage.** Each requirement in `specs/paper-library/spec.md` maps to a task: Paper Renaming → Tasks 4 and 7; Reading Stage → Tasks 1, 2 and 7; Reading Stage Is The Single Source Of Truth For Completion → Tasks 2 and 3; Library Grouped By Reading Stage → Task 8; Paper Removal Is Recoverable → Tasks 5, 7 and 9; Permanent Deletion → Tasks 6 and 7.

**Design coverage.** Each decision heading in `design.md` maps to a task: single source of truth → Tasks 2 and 3; `deleted_at` timestamp → Tasks 1 and 5; trash as a toggle → Task 9; row before file → Task 6; manual stage changes → Task 7 (asserted by "rendering alone must not move a paper between stages").

**Type consistency.** `ReadingStage`, `READING_STAGES`, `STAGE_LABELS` and `setReadingStage` are defined once in Task 2 and used under those exact names in Tasks 3, 7 and 8. `PaperWithFileUrl` is exported from `PaperList.tsx` throughout. `purgePaper` takes a paper object, not an id, in both Task 6 and Task 7.

**Known ordering wrinkle.** Task 8 imports `./TrashToggle`, which Task 9 creates. Task 8's step 4 says so and defers the green bar to Task 9. Reordering would not help — `PaperList` also needs `PaperCard` from Task 7 — and splitting the toggle out keeps each task's test focused.
