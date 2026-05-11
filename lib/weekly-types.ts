import type { NotionPropValue, NotionPropType } from './notion-page';

export type WColType =
  | 'text' | 'number' | 'url'
  | 'select' | 'multi_select'
  | 'date' | 'checkbox' | 'files';

export interface WColumn {
  id: string;
  notionPropId?: string;
  notionType?: NotionPropType;
  name: string;
  type: WColType;
  options?: { name: string; color: string }[];
}

export interface WRow {
  id: string;
  notionPageId?: string;
  cells: Record<string, NotionPropValue>;
}

export interface WStore {
  notion?: { dbId: string; dbUrl: string } | null;
  columns: WColumn[];
  rows: WRow[];
}
