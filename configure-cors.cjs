const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function configureCorsNative() {
  const applicationKeyId = process.env.STORAGE_ACCESS_KEY_ID;
  const applicationKey = process.env.STORAGE_SECRET_ACCESS_KEY;
  const bucketName = process.env.STORAGE_BUCKET_NAME;

  console.log('Authenticating with B2 Native API...');
  const authResponse = await fetch('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', {
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${applicationKeyId}:${applicationKey}`).toString('base64')
    }
  });
  if (!authResponse.ok) throw new Error('Auth failed: ' + await authResponse.text());
  const authData = await authResponse.json();
  console.log('apiInfo keys:', Object.keys(authData.apiInfo));
  console.log('apiInfo:', JSON.stringify(authData.apiInfo, null, 2));
  const apiUrl = authData.apiInfo?.storageApi?.apiUrl || authData.apiUrl;
  const authorizationToken = authData.authorizationToken;
  const accountId = authData.accountId;
  const bucketId = authData.apiInfo?.storageApi?.bucketId;

  if (!bucketId) throw new Error('Could not find bucketId in auth response');

  console.log('Updating CORS rules for bucket:', bucketId);
  const corsRules = [
    {
      corsRuleName: "allow-all",
      allowedOrigins: ["*"],
      allowedHeaders: ["*"],
      allowedOperations: ["s3_put", "s3_post", "s3_get", "s3_head", "b2_upload_file"],
      exposeHeaders: ["ETag"],
      maxAgeSeconds: 86400
    }
  ];

  const updateResponse = await fetch(`${apiUrl}/b2api/v3/b2_update_bucket`, {
    method: 'POST',
    headers: {
      Authorization: authorizationToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      accountId: accountId,
      bucketId: bucketId,
      corsRules: corsRules,
      bucketType: "allPrivate"
    })
  });

  if (!updateResponse.ok) throw new Error('Update failed: ' + await updateResponse.text());
  console.log('Successfully updated CORS using B2 Native API!');
}

configureCorsNative().catch(console.error);
