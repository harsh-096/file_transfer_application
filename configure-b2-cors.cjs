const B2 = require('backblaze-b2');
require('dotenv').config();

async function updateCors() {
  try {
    const applicationKeyId = process.env.B2_APPLICATION_KEY_ID ?? process.env.STORAGE_ACCESS_KEY_ID;
    const applicationKey = process.env.B2_APPLICATION_KEY ?? process.env.STORAGE_SECRET_ACCESS_KEY;

    if (!applicationKeyId || !applicationKey) {
      throw new Error('Missing B2 credentials. Set B2_APPLICATION_KEY_ID and B2_APPLICATION_KEY.');
    }

    const allowedOrigins = (process.env.STORAGE_ALLOWED_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    const b2 = new B2({
      applicationKeyId,
      applicationKey
    });

    console.log('Authorizing with B2...');
    await b2.authorize();
    
    console.log('Fetching buckets...');
    const response = await b2.listBuckets();
    const bucket = response.data.buckets.find(b => b.bucketName === process.env.STORAGE_BUCKET_NAME);
    
    if (!bucket) {
      console.error(`Bucket ${process.env.STORAGE_BUCKET_NAME} not found`);
      return;
    }
    
    console.log(`Found bucket: ${bucket.bucketId}. Updating CORS rules...`);
    const corsRules = [
      {
        corsRuleName: 'allowUploads',
        allowedOrigins,
        allowedHeaders: ['*', 'content-type', 'x-amz-*'],
        allowedOperations: [
          'b2_download_file_by_id',
          'b2_download_file_by_name',
          'b2_upload_file',
          'b2_upload_part',
          's3_delete',
          's3_get',
          's3_head',
          's3_post',
          's3_put'
        ],
        exposeHeaders: ['ETag', 'x-amz-request-id', 'x-amz-id-2'],
        maxAgeSeconds: 86400
      }
    ];

    await b2.updateBucket({
      bucketId: bucket.bucketId,
      bucketType: bucket.bucketType,
      corsRules: corsRules
    });
    
    console.log("CORS updated successfully via B2 Native API!");
  } catch (err) {
    console.error("Failed to update CORS:", err.response ? err.response.data : err.message);
  }
}

updateCors();
