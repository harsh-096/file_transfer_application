import { NextResponse } from 'next/server';
import { getS3Client } from '@/lib/s3-client';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { nanoid } from 'nanoid';

export async function POST(req: Request) {
  try {
    const { files } = await req.json();
    
    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const s3Client = getS3Client();
    const bucketName = process.env.STORAGE_BUCKET_NAME;

    if (!bucketName) {
      throw new Error('STORAGE_BUCKET_NAME is not set');
    }

    const presignedUrls = await Promise.all(
      files.map(async (file: { name: string; type: string; size: number }) => {
        const uniqueId = nanoid(8);
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const key = `uploads/${uniqueId}-${safeName}`;

        const command = new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          // Avoid signing optional headers for browser uploads.
          // This keeps the presigned request compatible with strict CORS preflight handling.
        });

        // 1 hour expiration for the upload link
        const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

        return {
          originalName: file.name,
          key,
          url,
        };
      })
    );

    return NextResponse.json({ presignedUrls });
  } catch (error) {
    console.error('Error generating presigned URLs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
