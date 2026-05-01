import { getAllTrades } from '@/lib/notion';

export async function GET(request: Request) {
  const key  = request.headers.get('x-notion-key')  ?? undefined;
  const dbId = request.headers.get('x-notion-db')   ?? undefined;
  try {
    const trades = await getAllTrades({ key, dbId });
    return Response.json({ trades });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Notion fetch error:', message);
    return Response.json({ error: message }, { status: 500 });
  }
}
