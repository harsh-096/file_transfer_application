import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { nanoid } from 'nanoid';
import { addDays } from 'date-fns';
import { getS3Client } from '@/lib/s3-client';
import { prisma } from '@/lib/prisma';

const MAX_FILE_BYTES = 500 * 1024 * 1024;

interface UploadRequestBody {
  fileName: string;
  fileSize: number;
  fileType: string;
  expireDays: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as UploadRequestBody;
    const { fileName, fileSize, fileType, expireDays } = body;

    if (!fileName || !fileType || !fileSize || !expireDays) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (fileSize > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'File exceeds 500 MB limit' }, { status: 400 });
    }

    const s3 = getS3Client();
    const bucket = process.env.STORAGE_BUCKET_NAME;
    if (!bucket) {
      return NextResponse.json({ error: 'Storage bucket not configured' }, { status: 500 });
    }

    const fileKey = `${Date.now()}-${fileName.replace(/\s+/g, '-')}`;
    const shortCode = nanoid(8);
    const days = parseInt(expireDays) === 3 ? 3 : 1;
    const expiresAt = addDays(new Date(), days);

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: fileKey,
      ContentType: fileType,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

    const transfer = await prisma.transfer.create({
      data: {
        shortCode,
        expiresAt,
        files: {
          create: {
            path: fileName,
            name: fileName,
            key: fileKey,
            size: fileSize,
            type: fileType || 'application/octet-stream',
          },
        },
      },
    });

    const origin = request.nextUrl.origin;

    return NextResponse.json({
      uploadUrl,
      shortCode: transfer.shortCode,
      downloadLink: `${origin}/d/${transfer.shortCode}`,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Failed to initialize upload' }, { status: 500 });
  }
}