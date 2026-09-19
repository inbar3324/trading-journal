const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('lib/weekly-news.ts', 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exportsForTest = {};
vm.runInNewContext(code, { exports: exportsForTest });
const { buildWeeklyNewsPlan } = exportsForTest;

const date = (start, end = null) => ({ type: 'date', start, end, hasTime: false });
const multi = (...names) => ({ type: 'multi_select', options: names.map(name => ({ name, color: 'default' })) });
const columns = [
  { id: 'title', name: 'Summary', type: 'text' },
  { id: 'week', name: 'Week Ending', type: 'date' },
  { id: 'news', name: 'NEWS OF THE WEEK', type: 'multi_select', options: [{ name: 'CPI', color: 'red' }] },
];

test('copies unique Journal NEWS values into the matching weekly date range', () => {
  const store = {
    columns,
    rows: [
      { id: 'a', cells: { week: date('2026-09-14', '2026-09-18'), news: multi() } },
      { id: 'b', cells: { week: date('2026-09-21', '2026-09-25'), news: multi('FOMC') } },
    ],
  };
  const trades = [
    { date: '2026-09-18', news: ['CPI', 'NFP'] },
    { date: '2026-09-15T09:30:00.000+03:00', news: ['CPI'] },
    { date: '2026-09-26', news: ['FOMC'] },
  ];

  const plan = buildWeeklyNewsPlan(store, trades);
  assert.equal(plan.patches.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(plan.patches[0])), {
    rowId: 'a',
    value: { type: 'multi_select', options: [{ name: 'CPI', color: 'red' }, { name: 'NFP', color: 'default' }] },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(plan.patches[1])), {
    rowId: 'b',
    value: { type: 'multi_select', options: [] },
  });
});

test('does not rewrite an already synchronized cell and supports a text target', () => {
  const multiStore = {
    columns,
    rows: [{ id: 'a', cells: { week: date('2026-09-14'), news: multi('CPI') } }],
  };
  assert.equal(buildWeeklyNewsPlan(multiStore, [{ date: '2026-09-14', news: ['CPI'] }]).patches.length, 0);

  const textStore = {
    columns: columns.map(column => column.id === 'news' ? { ...column, type: 'text' } : column),
    rows: [{ id: 'a', cells: { week: date('2026-09-14', '2026-09-18'), news: { type: 'rich_text', text: '' } } }],
  };
  const plan = buildWeeklyNewsPlan(textStore, [{ date: '2026-09-16', news: ['CPI', 'FOMC'] }]);
  assert.deepEqual(JSON.parse(JSON.stringify(plan.patches[0].value)), { type: 'rich_text', text: 'CPI, FOMC' });
});

test('stays inactive until both named NEWS and weekly date columns exist', () => {
  const store = { columns: columns.filter(column => column.id !== 'news'), rows: [] };
  const plan = buildWeeklyNewsPlan(store, []);
  assert.equal(plan.targetColumn, null);
  assert.equal(plan.patches.length, 0);
});
