import type { NotionPage, NotionDbSchema, NotionPropDef, NotionPropValue, SelectOption } from '@/lib/notion-page';
import type { WStore, WColumn } from '@/lib/weekly-types';

function colToPropDef(col: WColumn): NotionPropDef {
  return {
    id: col.id,
    name: col.name,
    type: col.type === 'text' ? 'rich_text' : col.type,
    options: col.options as SelectOption[] | undefined,
  };
}

export function wstoreToNotebook(store: WStore): { pages: NotionPage[]; schema: NotionDbSchema } {
  const propDefs: NotionPropDef[] = store.columns.map(colToPropDef);

  const schema: NotionDbSchema = {
    title: 'Weekly Summary',
    realDbId: store.notion?.dbId ?? '',
    properties: propDefs,
  };

  const pages: NotionPage[] = store.rows.map(row => {
    const properties: Record<string, NotionPropValue> = {};
    for (const col of store.columns) {
      const v = row.cells[col.id];
      if (v) properties[col.name] = v;
    }
    return {
      id: row.id,
      url: '',
      archived: false,
      cover: null,
      icon: null,
      createdTime: '',
      lastEditedTime: '',
      properties,
    };
  });

  return { pages, schema };
}
