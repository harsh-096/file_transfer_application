import { NextRequest, NextResponse } from 'next/server';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client } from '@/lib/s3-client';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const s3 = getS3Client();
    const bucket = process.env.STORAGE_BUCKET_NAME;
    if (!bucket) {
      return NextResponse.json({ error: 'Storage bucket not configured' }, { status: 500 });
    }

    const expired = await prisma.transfer.findMany({
      where: { expiresAt: { lt: new Date() } },
      include: { files: true },
    });

    if (!expired.length) {
      return NextResponse.json({ message: 'No expired files to clean.' });
    }

    const deletedIds: string[] = [];

    for (const transfer of expired) {
      try {
        for (const file of transfer.files) {
          await s3.send(
            new DeleteObjectCommand({ Bucket: bucket, Key: file.key })
          );
        }
        deletedIds.push(transfer.id);
      } catch (err) {
        console.error('Failed to delete from storage', err);
      }
    }

    if (deletedIds.length) {
      await prisma.transfer.deleteMany({ where: { id: { in: deletedIds } } });
    }

    return NextResponse.json({ message: 'Cleanup complete', deleted: deletedIds.length });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json({ error: 'Failed to execute cleanup' }, { status: 500 });
  }
}
