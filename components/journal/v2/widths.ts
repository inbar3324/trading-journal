import type { NotionPropType } from '@/lib/notion-page';

const DEFAULTS: Record<NotionPropType, number> = {
  title: 240,
  rich_text: 200,
  number: 100,
  select: 140,
  multi_select: 180,
  status: 140,
  date: 140,
  url: 170,
  email: 170,
  phone_number: 140,
  checkbox: 60,
  files: 130,
  people: 140,
  relation: 160,
  formula: 130,
  rollup: 130,
  created_time: 160,
  last_edited_time: 160,
  created_by: 130,
  last_edited_by: 130,
  unique_id: 100,
  unsupported: 100,
};

export function colWidth(type: NotionPropType): number {
  return DEFAULTS[type] ?? 140;
}
