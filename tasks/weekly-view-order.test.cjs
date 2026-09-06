const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('lib/weekly-view-order.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exportsForTest = {};
vm.runInNewContext(code, { exports: exportsForTest });
const { visibleViewSchema, sharedViewConfig, reorderedViewColumns, WEEKLY_ORDER_PROPERTY } = exportsForTest;
const title = { id: 'title', name: '', type: 'title' };
const date = { id: 'cYI@', name: 'Week Ending', type: 'date' };
const text = { id: 'note', name: 'Note', type: 'rich_text' };
const order = { id: 'order', name: WEEKLY_ORDER_PROPERTY, type: 'unique_id' };
const schema = { properties: [title, date, text, order] };
const view = { id: 'view', configuration: { type: 'table', frozen_column_index: -1, properties: [
  { property_id: 'note', visible: false },
  { property_id: 'cYI%40', visible: true, width: 200 },
  { property_id: 'title', visible: true, width: 280 },
  { property_id: 'order', visible: true },
] } };
const plain = value => JSON.parse(JSON.stringify(value));

test('visible columns follow Notion even when local/title order differs; helpers stay hidden', () => {
  assert.deepEqual(plain(visibleViewSchema(schema, view).properties.map(p => p.id)), ['cYI@', 'title']);
});
test('shared sorting has a unique tie-breaker and hides its property without changing widths', () => {
  const config = sharedViewConfig(schema, view, order);
  assert.deepEqual(plain(config.sorts), [{ property: 'cYI@', direction: 'ascending' }, { property: 'order', direction: 'ascending' }]);
  assert.equal(config.configuration.properties.at(-1).visible, false);
  assert.equal(config.configuration.properties[1].width, 200);
  assert.equal(config.configuration.frozen_column_index, undefined);
  assert.deepEqual(plain(sharedViewConfig(schema, { ...view, ...config }, order)), plain(config));
});
test('descending/custom sorts are preserved and equal/empty values use the unique ID', () => {
  const config = sharedViewConfig(schema, { ...view, sorts: [{ property: 'note', direction: 'descending' }] }, order);
  assert.deepEqual(plain(config.sorts), [{ property: 'note', direction: 'descending' }, { property: 'order', direction: 'ascending' }]);
});
test('column reorder preserves hidden fields and display configuration', () => {
  const config = reorderedViewColumns(schema, view, ['title', 'cYI@']);
  assert.deepEqual(plain(config.properties.slice(0, 2).map(p => p.property_id)), ['title', 'cYI%40']);
  assert.equal(config.properties[0].width, 280);
  assert.equal(config.properties.find(p => p.property_id === 'note').visible, false);
  assert.throws(() => reorderedViewColumns(schema, view, ['title', 'title']));
  assert.throws(() => reorderedViewColumns(schema, view, ['title']));
});

function routeWithFetch(fetch) {
  const routeSource = fs.readFileSync('app/api/weekly/db/[dbId]/route.ts', 'utf8');
  const routeCode = ts.transpileModule(routeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const routeExports = {};
  vm.runInNewContext(routeCode, {
    exports: routeExports, fetch, URLSearchParams,
    require: name => {
      if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };
      if (name === '@/lib/weekly-view-order') return exportsForTest;
      if (name === '@/lib/weekly-notion') return { notionHeaders: () => ({}), resolveDataSourceId: async () => 'ds' };
      if (name === '@/lib/notion-page') return {
        parseDbSchema: raw => raw.schema,
        parsePage: raw => ({ ...raw, createdTime: raw.created_time }),
      };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return routeExports;
}

test('route keeps the complete 130-row view order across pages and retrieves a missing data-source page directly', async () => {
  const ids = Array.from({ length: 130 }, (_, i) => `page-${129 - i}`);
  const dsIds = ids.filter(id => id !== 'page-52').reverse();
  const queries = [];
  const fullView = { id: 'view', type: 'table', parent: { database_id: 'db' }, data_source_id: 'ds',
    ...sharedViewConfig(schema, view, order) };
  const response = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });
  const routes = routeWithFetch(async (url, init = {}) => {
    queries.push([url, init.method ?? 'GET']);
    if (url.endsWith('/data_sources/ds')) return response({ parent: { database_id: 'db' }, schema });
    if (url.endsWith('/views/view')) return response(fullView);
    if (url.endsWith('/views/view/queries')) return response({ id: 'query', results: ids.slice(0, 100).map(id => ({ id })), has_more: true, next_cursor: 'next' });
    if (url.includes('/queries/query?')) return response({ results: ids.slice(100).map(id => ({ id })), has_more: false });
    if (url.endsWith('/queries/query') && init.method === 'DELETE') return response({ deleted: true });
    if (url.endsWith('/data_sources/ds/query')) {
      const offset = JSON.parse(init.body).start_cursor ? 100 : 0;
      return response({ results: dsIds.slice(offset, offset + 100).map(id => ({ id, properties: {} })),
        has_more: offset === 0, next_cursor: offset === 0 ? 'ds-next' : null });
    }
    if (url.endsWith('/pages/page-52')) return response({ id: 'page-52', properties: {} });
    throw new Error(`Unexpected request: ${url}`);
  });
  const result = await routes.GET({ headers: new Headers({ 'x-notion-key': 'test' }), nextUrl: new URL('http://local/db?viewId=view') }, { params: Promise.resolve({ dbId: 'ds' }) });
  assert.equal(result.status, 200);
  assert.deepEqual(plain(result.body.pages.map(page => page.id)), ids);
  assert.equal(new Set(result.body.pages.map(page => page.id)).size, 130);
  assert.equal(result.body.schema.properties.some(p => p.name === WEEKLY_ORDER_PROPERTY), false);
  assert.equal(queries.some(([url]) => url.endsWith('/pages/page-52')), true);
  assert.equal(queries.some(([url, method]) => url.endsWith('/queries/query') && method === 'DELETE'), true);
  assert.equal(queries.some(([, method]) => method === 'PATCH'), false);
});

test('route fails instead of presenting a guessed order when Notion has no accessible view', async () => {
  const routes = routeWithFetch(async url => ({ ok: true, status: 200, json: async () =>
    url.endsWith('/data_sources/ds') ? { parent: { database_id: 'db' }, schema } : { results: [], has_more: false } }));
  const result = await routes.GET({ headers: new Headers({ 'x-notion-key': 'test' }), nextUrl: new URL('http://local/db') }, { params: Promise.resolve({ dbId: 'ds' }) });
  assert.equal(result.status, 500);
  assert.match(result.body.error, /No accessible table view/);
});
