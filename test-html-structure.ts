import { google } from 'googleapis';
import { readFileSync } from 'fs';

async function testHtml() {
  const serviceAccount = JSON.parse(
    readFileSync('google.json', 'utf-8')
  );

  const auth = new google.auth.JWT(
    serviceAccount.client_email,
    undefined,
    serviceAccount.private_key,
    ['https://www.googleapis.com/auth/drive.readonly']
  );

  const drive = google.drive({ version: 'v3', auth });

  const documentId = '1OPXrZWBT85E4HlLOsZOm0bCUTuuqZOEAYIMP1ABokRc';
  
  console.log('Fetching HTML...');
  const response = await drive.files.export({
    fileId: documentId,
    mimeType: 'text/html',
  });

  const html = response.data as string;
  console.log('\n=== HTML STRUCTURE (first 2000 chars) ===');
  console.log(html.substring(0, 2000));
  console.log('\n=== HTML STRUCTURE (last 1000 chars) ===');
  console.log(html.substring(Math.max(0, html.length - 1000)));
}

testHtml().catch(console.error);
