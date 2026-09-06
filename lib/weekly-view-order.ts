import type { NotionDbSchema, NotionPropDef } from './notion-page';

export const WEEKLY_ORDER_PROPERTY = '__W_SUMMARY_ORDER';

export interface WeeklyView {
  id: string;
  type?: string;
  data_source_id?: string;
  parent?: { database_id?: string };
  sorts?: Array<Record<string, unknown>> | null;
  configuration?: Record<string, unknown> & { properties?: Array<Record<string, unknown>> };
}

export function matchesProperty(value: unknown, property: NotionPropDef): boolean {
  return typeof value === 'string' && [property.id, encodeURIComponent(property.id), property.name].includes(value);
}

export function visibleViewSchema(schema: NotionDbSchema, view: WeeklyView): NotionDbSchema {
  const ordered: NotionPropDef[] = [];
  const seen = new Set<string>();
  for (const config of view.configuration?.properties ?? []) {
    const prop = schema.properties.find(p => matchesProperty(config.property_id, p));
    if (!prop || seen.has(prop.id)) continue;
    seen.add(prop.id);
    if (config.visible !== false && prop.name !== WEEKLY_ORDER_PROPERTY) ordered.push(prop);
  }
  for (const prop of schema.properties) {
    if (!seen.has(prop.id) && prop.name !== WEEKLY_ORDER_PROPERTY) ordered.push(prop);
  }
  return { ...schema, properties: ordered };
}

export function sharedViewConfig(schema: NotionDbSchema, view: WeeklyView, order: NotionPropDef) {
  const sorts = [...(view.sorts ?? [])];
  if (!sorts.length) {
    const date = schema.properties.find(p => p.type === 'date');
    if (date) sorts.push({ property: date.id, direction: 'ascending' });
  }
  if (!sorts.some(sort => matchesProperty(sort.property, order))) {
    sorts.push({ property: order.id, direction: 'ascending' });
  }
  const properties = (view.configuration?.properties ?? schema.properties.map(p => ({ property_id: p.id, visible: true })))
    .filter(config => !matchesProperty(config.property_id, order));
  properties.push({ property_id: order.id, visible: false });
  return { sorts, configuration: { type: 'table', properties } };
}

export function reorderedViewColumns(schema: NotionDbSchema, view: WeeklyView, ids: string[]) {
  const visible = visibleViewSchema(schema, view).properties;
  if (new Set(ids).size !== ids.length || ids.length !== visible.length ||
      ids.some(id => !visible.some(p => p.id === id))) {
    throw new Error('Column order changed in Notion. Refresh the table and try again.');
  }
  const config = view.configuration?.properties ?? [];
  const properties = ids.map(id => {
    const prop = visible.find(p => p.id === id)!;
    return config.find(c => matchesProperty(c.property_id, prop)) ?? { property_id: id, visible: true };
  });
  properties.push(...config.filter(c => !visible.some(p => matchesProperty(c.property_id, p))));
  return { type: 'table', properties };
}
