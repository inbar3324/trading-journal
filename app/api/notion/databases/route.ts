export async function GET(request: Request) {
  const key = request.headers.get('x-notion-key');
  if (!key) return Response.json({ error: 'Missing token' }, { status: 400 });

  try {
    const res = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filter: { value: 'database', property: 'object' }, page_size: 50 }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? 'Notion API error');

    const databases = (data.results as Record<string, unknown>[]).map((db) => {
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
