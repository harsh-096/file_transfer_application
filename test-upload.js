async function test() {
  try {
    const fileData = 'Hello World! This is a test file.';
    
    // 1. Get upload URL
    const res = await fetch('http://localhost:3000/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'test.txt',
        fileSize: fileData.length,
        fileType: 'text/plain',
        expireDays: '1',
      }),
    });
    const data = await res.json();
    console.log('Upload API response:', data);
    
    // 2. Upload file to S3
    const putRes = await fetch(data.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: fileData
    });
    console.log('S3 PUT status:', putRes.status);
    
    // 3. Test download link
    const downloadRes = await fetch(data.downloadLink, {
      redirect: 'manual'
    });
    console.log('Download link redirect status:', downloadRes.status);
    console.log('Redirect location:', downloadRes.headers.get('location'));
    
    if (downloadRes.status === 307 || downloadRes.status === 302 || downloadRes.status === 303 || downloadRes.status === 308) {
      const s3Url = downloadRes.headers.get('location');
      const s3GetRes = await fetch(s3Url);
      console.log('S3 GET status:', s3GetRes.status);
      console.log('Downloaded data:', await s3GetRes.text());
    } else {
      console.log('Download response:', await downloadRes.text());
    }
  } catch (err) {
    console.error(err);
  }
}
test();
