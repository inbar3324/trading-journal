import { getAllTrades } from '@/lib/notion';

export async function GET() {
  try {
    const trades = await getAllTrades();
    return Response.json({ trades });
  } catch (err) {
    console.error('Notion fetch error:', err);
    return Response.json({ error: 'Failed to fetch trades from Notion' }, { status: 500 });
  }
}
