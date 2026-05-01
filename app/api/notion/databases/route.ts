import { Client } from '@notionhq/client';

export async function GET(request: Request) {
  const key = request.headers.get('x-notion-key');
  if (!key) return Response.json({ error: 'Missing token' }, { status: 400 });

  try {
    const notion = new Client({ auth: key });

    // Use the SDK so the correct API version (2025-09-03) and base URL are used,
    // ensuring the returned IDs are compatible with dataSources.query.
    const res = await (notion as unknown as {
      search: (args: object) => Promise<{ results: Record<string, unknown>[] }>;
    }).search({
      filter: { value: 'data_source', property: 'object' },
      page_size: 50,
    });

    const databases = res.results.map((db) => {
      const titleArr = (db.title as { plain_text?: string }[] | undefined) ?? [];
      return {
        id: db.id as string,
        title: titleArr[0]?.plain_text || 'Untitled',
      };
    });

    return Response.json({ databases });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
