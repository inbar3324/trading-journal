# Journal rebuild — schema-driven Notion mirror

## Goal
Replace the hardcoded `/journal` page with a generic Notion table view that mirrors **any** Notion DB 1:1 — columns, options, and edits all derived from the live Notion schema. Bidirectional sync. Public-app safe (per-user credentials).

## Scope decisions
- Keep `lib/types.ts#Trade` and `lib/notion.ts` intact for analytics/weekly pages — they need typed access for stat math.
- Add a parallel **generic** layer: `NotionPage` (id + properties dict) used only by `/journal`.
- Editable property types: title, rich_text, number, select, multi_select, date, url, email, phone_number, checkbox, files, status.
- Read-only property types: people, relation, formula, rollup, created_time, last_edited_time, created_by, last_edited_by, unique_id.
- Column order: from object insertion order returned by Notion DB API (≈ DB column order). Title pinned first.
- Polling: 15 s.

## Tasks

### 1 — Generic Notion layer
- [ ] `lib/notion-page.ts`
  - `NotionPropValue` discriminated union for all property types
  - `NotionPage { id, url, archived, cover, icon, properties }`
  - `NotionDbSchema` with full per-property metadata (type, options, order)
  - `parsePage`, `buildPropertiesPatch`, `parseDb`

### 2 — Generic API endpoints
- [ ] `GET /api/notion/pages` — list pages → `{ pages, schema, realDbId, dbTitle }`
- [ ] `GET /api/notion/pages/[id]`
- [ ] `PATCH /api/notion/pages/[id]`
- [ ] `DELETE /api/notion/pages/[id]`
- [ ] `POST /api/notion/pages/create`
- [ ] `POST /api/notion/pages/[id]/file` — upload file to a `files` property

### 3 — Journal UI rebuild
- [ ] `components/journal/v2/Cell.tsx` — read-only renderer per type
- [ ] `components/journal/v2/Editor.tsx` — inline editor per type
- [ ] `components/journal/v2/Popovers.tsx` — Select/MultiSelect/Status popovers
- [ ] `app/journal/page.tsx` — schema-driven table, dynamic columns, inline new row

### 4 — Sync
- [ ] Poll every 15 s
- [ ] Optimistic UI on edit, rollback on error
- [ ] After edit, refetch only that page (not whole list)

### 5 — Verify
- [ ] `npm run build` passes
- [ ] Analytics + weekly pages still work
- [ ] Round-trip edits for every supported property type
- [ ] Adding option in Notion → shown in dropdown after refresh

## Out of scope
- Notion views (calendar/gallery/board)
- Sub-page block content
- Real-time websockets (polling is fine)
