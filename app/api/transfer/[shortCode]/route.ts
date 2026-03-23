import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getS3Client } from '@/lib/s3-client';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = getS3Client();

export async function GET(req: Request, { params }: { params: Promise<{ shortCode: string }> }) {
  try {
    const { shortCode } = await params;
    const transfer = await prisma.transfer.findUnique({
      where: { shortCode },
      include: { files: true }
    });

    if (!transfer) {
      return NextResponse.json({ error: 'Transfer not found' }, { status: 404 });
    }

    if (transfer.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Transfer expired' }, { status: 410 });
    }

    const bucketName = process.env.STORAGE_BUCKET_NAME;

    if (!bucketName) {
        throw new Error('STORAGE_BUCKET_NAME is not set');
    }

    // Generate presigned URLs for each file for download and preview
    const filesWithUrls = await Promise.all(
      transfer.files.map(async (file) => {
        const downloadCommand = new GetObjectCommand({
          Bucket: bucketName,
          Key: file.key,
          ResponseContentDisposition: `attachment; filename="${encodeURIComponent(file.name)}"`,
        });
        
        const previewCommand = new GetObjectCommand({
          Bucket: bucketName,
          Key: file.key,
        });

        const [downloadUrl, previewUrl] = await Promise.all([
          getSignedUrl(s3Client, downloadCommand, { expiresIn: 3600 * 24 }),
          getSignedUrl(s3Client, previewCommand, { expiresIn: 3600 * 24 })
        ]);
        
        return {
          ...file,
          downloadUrl,
          previewUrl
        };
      })
    );

    return NextResponse.json({ transfer: { ...transfer, files: filesWithUrls } });
  } catch (error) {
    console.error('Error fetching transfer:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
