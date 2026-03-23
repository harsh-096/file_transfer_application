const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const dotenv = require('dotenv');

dotenv.config();

async function testUpload() {
  const endpoint = process.env.STORAGE_ENDPOINT;
  const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;
  const region = process.env.STORAGE_REGION ?? 'auto';
  const bucketName = process.env.STORAGE_BUCKET_NAME;

  const client = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });

  const key = `test-upload-${Date.now()}.txt`;
  
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: 'text/plain',
  });

  try {
    const url = await getSignedUrl(client, command, { expiresIn: 3600 });
    console.log('Generated URL:', url);

    const body = 'Hello World';
    
    // Test PUT
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/plain'
      },
      body
    });

    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Response:', text);
  } catch (err) {
    console.error('Error:', err);
  }
}

testUpload();
