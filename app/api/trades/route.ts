import { getAllTrades } from '@/lib/notion';

export async function GET(request: Request) {
  const key  = request.headers.get('x-notion-key')  ?? undefined;
  const dbId = request.headers.get('x-notion-db')   ?? undefined;
  try {
    const trades = await getAllTrades({ key, dbId });
    return Response.json({ trades });
  } catch (err) {
    console.error('Notion fetch error:', err);
    return Response.json({ error: 'Failed to fetch trades from Notion' }, { status: 500 });
  }
}
