import { NextRequest, NextResponse } from 'next/server';
import { parsePage } from '@/lib/notion-page';

const NOTION_VERSION = '2022-06-28';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const key = (req.headers.get('x-notion-key') ?? process.env.NOTION_API_KEY) as string;
    const auth = `Bearer ${key}`;

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const prop = formData.get('prop') as string | null;
    if (!file || !prop) {
      return NextResponse.json({ error: 'Missing file or prop' }, { status: 400 });
    }

    const createRes = await fetch('https://api.notion.com/v1/file_uploads', {
      method: 'POST',
      headers: { Authorization: auth, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, content_type: file.type }),
    });
    const createData = await createRes.json() as Record<string, unknown>;
    if (!createRes.ok) throw new Error((createData.message as string) ?? 'Failed to create upload');
    const uploadId = createData.id as string;

    const sendForm = new FormData();
    sendForm.append('file', file, file.name);
    const sendRes = await fetch(`https://api.notion.com/v1/file_uploads/${uploadId}/send`, {
      method: 'POST',
      headers: { Authorization: auth, 'Notion-Version': NOTION_VERSION },
      body: sendForm,
    });
    if (!sendRes.ok) {
      const d = await sendRes.json() as Record<string, unknown>;
      throw new Error((d.message as string) ?? 'Failed to send file');
    }

    const pageRes = await fetch(`https://api.notion.com/v1/pages/${id}`, {
      headers: { Authorization: auth, 'Notion-Version': NOTION_VERSION },
    });
    const pageData = await pageRes.json() as Record<string, unknown>;
    const props = pageData.properties as Record<string, Record<string, unknown>> | undefined;
    const existingFiles = (props?.[prop]?.files as unknown[]) ?? [];

    const patchRes = await fetch(`https://api.notion.com/v1/pages/${id}`, {
      method: 'PATCH',
      headers: { Authorization: auth, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: {
          [prop]: {
            files: [
              ...existingFiles,
              { type: 'file_upload', file_upload: { id: uploadId } },
            ],
          },
        },
      }),
    });
    const patchData = await patchRes.json() as Record<string, unknown>;
    if (!patchRes.ok) throw new Error((patchData.message as string) ?? 'Failed to update page');

    const page = parsePage(patchData);
    return NextResponse.json({ page });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
