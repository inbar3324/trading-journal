import { NextRequest, NextResponse } from 'next/server';
import { notionHeaders } from '@/lib/weekly-notion';

export async function POST(req: NextRequest) {
  try {
    const key = req.headers.get('x-notion-key');
    if (!key) return NextResponse.json({ error: 'Missing Notion key' }, { status: 401 });

    const { dataSourceId } = await req.json() as { dataSourceId?: string };
    if (!dataSourceId) return NextResponse.json({ error: 'Missing dataSourceId' }, { status: 400 });

    const headers = notionHeaders(key);

    const dsRes = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}`, { headers });
    if (!dsRes.ok) {
      const err = await dsRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: (err as { message?: string }).message ?? 'Failed to load data source' },
        { status: dsRes.status },
      );
    }
    const ds = await dsRes.json() as {
      database_parent?: { database_id?: string };
      parent?: { database_id?: string };
    };
    const databaseId = ds.database_parent?.database_id ?? ds.parent?.database_id;

    let url = '';
    if (databaseId) {
      const dbRes = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, { headers });
      if (dbRes.ok) {
        const db = await dbRes.json() as { url?: string };
        url = db.url ?? '';
      }
    }

    return NextResponse.json({ dbId: dataSourceId, url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
