import { NextRequest, NextResponse } from 'next/server';

const NOTION_VERSION = '2025-09-03';

interface NotionTitlePart { plain_text?: string }
interface NotionSearchResult {
  id: string;
  object: string;
  parent?: { type?: string };
  properties?: Record<string, { type?: string; title?: NotionTitlePart[] }>;
  url?: string;
}

export async function GET(req: NextRequest) {
  const key = req.headers.get('x-notion-key');
  if (!key) return NextResponse.json({ error: 'Missing Notion key' }, { status: 401 });

  const res = await fetch('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filter: { value: 'page', property: 'object' },
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
      page_size: 50,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: (err as { message?: string }).message ?? 'Failed to list Notion pages' },
      { status: 500 },
    );
  }

  const data = await res.json() as { results: NotionSearchResult[] };

  const pages = data.results
    .filter(p => p.object === 'page')
    .map(p => {
      let title = 'Untitled';
      if (p.properties) {
        for (const prop of Object.values(p.properties)) {
          if (prop.type === 'title' && Array.isArray(prop.title) && prop.title.length > 0) {
            title = prop.title.map(t => t.plain_text ?? '').join('') || 'Untitled';
            break;
          }
        }
      }
      return { id: p.id, title, url: p.url ?? null };
    });

  return NextResponse.json({ pages });
}
