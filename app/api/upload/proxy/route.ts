import { NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client } from '@/lib/s3-client';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const key = formData.get('key');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    if (typeof key !== 'string' || !key.startsWith('uploads/')) {
      return NextResponse.json({ error: 'Invalid key' }, { status: 400 });
    }

    const bucketName = process.env.STORAGE_BUCKET_NAME;
    if (!bucketName) {
      throw new Error('STORAGE_BUCKET_NAME is not set');
    }

    const s3Client = getS3Client();
    const arrayBuffer = await file.arrayBuffer();

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: Buffer.from(arrayBuffer),
        ContentType: file.type || 'application/octet-stream',
      })
    );

    return NextResponse.json({ ok: true, key });
  } catch (error) {
    console.error('Proxy upload failed:', error);
    return NextResponse.json({ error: 'Proxy upload failed' }, { status: 500 });
  }
}
