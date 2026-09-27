// Off-site copies of the daily backup, in a Railway storage bucket.
//
// The volume holds the database and its local backups together, so losing the
// volume would lose both. Each daily snapshot is therefore also uploaded to a
// bucket, which is separate storage. The bucket's credentials reach the service
// as Railway variable references (see .env.example); without them this is off.
const fs = require('fs');

const PREFIX = 'crm-backups/';
const KEEP = Number(process.env.BACKUP_BUCKET_KEEP || 60);

function config() {
  const c = {
    bucket: process.env.BACKUP_BUCKET,
    endpoint: process.env.BACKUP_BUCKET_ENDPOINT,
    region: process.env.BACKUP_BUCKET_REGION || 'auto',
    accessKeyId: process.env.BACKUP_BUCKET_ACCESS_KEY_ID,
    secretAccessKey: process.env.BACKUP_BUCKET_SECRET_ACCESS_KEY,
  };
  return c.bucket && c.endpoint && c.accessKeyId && c.secretAccessKey ? c : null;
}
const configured = () => !!config();

let testClient = null;
function setClientForTests(client) { testClient = client; }

function client(c) {
  if (testClient) return testClient;
  const { S3Client } = require('@aws-sdk/client-s3');
  return new S3Client({
    endpoint: c.endpoint, region: c.region,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
  });
}

// Upload one backup file, then keep only the newest KEEP copies in the bucket.
async function uploadBackup(filePath, name) {
  const c = config();
  if (!c && !testClient) return { uploaded: false, reason: 'not configured' };
  const { PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
  const s3 = client(c);
  const bucket = c ? c.bucket : 'test-bucket';
  await s3.send(new PutObjectCommand({
    Bucket: bucket, Key: PREFIX + name, Body: fs.readFileSync(filePath), ContentType: 'application/vnd.sqlite3',
  }));

  const keys = [];
  let token;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX, ContinuationToken: token }));
    for (const o of page.Contents || []) keys.push(o.Key);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  // Names carry a UTC timestamp, so newest sorts last.
  keys.sort();
  const stale = keys.slice(0, Math.max(0, keys.length - KEEP));
  if (stale.length) {
    await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: stale.map(Key => ({ Key })) } }));
  }
  return { uploaded: true, key: PREFIX + name, pruned: stale.length, kept: keys.length - stale.length };
}

module.exports = { uploadBackup, configured, setClientForTests, PREFIX, KEEP };
