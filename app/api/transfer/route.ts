import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { nanoid } from 'nanoid';
import { addDays } from 'date-fns';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, message, files, expiryDays } = body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: 'Files are required' }, { status: 400 });
    }

    const allowedExpiryDays = new Set([1, 3, 7]);
    const selectedDays = Number(expiryDays ?? 7);
    if (!allowedExpiryDays.has(selectedDays)) {
      return NextResponse.json({ error: 'expiryDays must be 1, 3, or 7' }, { status: 400 });
    }

    // 6-character shortcode
    const shortCode = nanoid(6);
    const expiresAt = addDays(new Date(), selectedDays);

    const transfer = await prisma.transfer.create({
      data: {
        title: title || null,
        message: message || null,
        shortCode,
        expiresAt,
        files: {
          create: files.map((f: { path?: string; name: string; key: string; size: number; type?: string }) => ({
            path: f.path || f.name,
            name: f.name,
            key: f.key,
            size: f.size,
            type: f.type || 'application/octet-stream'
          }))
        }
      },
      include: { files: true }
    });

    return NextResponse.json({ transfer, shortCode });
  } catch (error) {
    console.error('Error creating transfer:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
