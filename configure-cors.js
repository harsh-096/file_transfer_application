import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function configureCors() {
  const endpoint = process.env.STORAGE_ENDPOINT;
  const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;
  const region = process.env.STORAGE_REGION ?? 'auto';
  const bucket = process.env.STORAGE_BUCKET_NAME;
  const allowedOrigins = (process.env.STORAGE_ALLOWED_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('Missing storage config');
  }

  const client = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });

  const command = new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedHeaders: ['*', 'content-type', 'x-amz-*'],
          AllowedMethods: ['GET', 'PUT', 'POST', 'HEAD'],
          AllowedOrigins: allowedOrigins,
          ExposeHeaders: ['ETag', 'x-amz-request-id', 'x-amz-id-2'],
          MaxAgeSeconds: 86400
        }
      ]
    }
  });

  try {
    await client.send(command);
    console.log('CORS configured successfully on bucket:', bucket);
  } catch (error) {
    console.error('Failed to configure CORS:', error);
  }
}

configureCors();
