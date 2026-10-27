const fs = require("fs");
const crypto = require("crypto");
const {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// Thin wrapper around Cloudflare R2 (S3-compatible). Locally the same code
// talks to MinIO (R2_ENDPOINT=http://minio:9000, R2_REGION=us-east-1).
//
// Env: R2_ACCOUNT_ID or R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, optional R2_PUBLIC_BASE (custom domain on a public
// bucket, e.g. https://media.radyoklasik.online) and R2_URL_TTL (seconds a
// presigned link stays valid when there is no public domain).

function config() {
  const e = process.env;
  const endpoint =
    e.R2_ENDPOINT || (e.R2_ACCOUNT_ID ? `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : null);
  return {
    endpoint,
    bucket: e.R2_BUCKET || null,
    accessKeyId: e.R2_ACCESS_KEY_ID || null,
    secretAccessKey: e.R2_SECRET_ACCESS_KEY || null,
    region: e.R2_REGION || "auto",
    publicBase: (e.R2_PUBLIC_BASE || "").replace(/\/+$/, "") || null,
    urlTtl: Number(e.R2_URL_TTL || 12 * 3600),
  };
}

function isConfigured() {
  const c = config();
  return !!(c.endpoint && c.bucket && c.accessKeyId && c.secretAccessKey);
}

let client = null;
let clientKey = null;
function s3() {
  const c = config();
  // Rebuilt when any setting changes (e.g. rotated keys).
  const key = [c.endpoint, c.accessKeyId, c.secretAccessKey, c.region].join("|");
  if (!client || clientKey !== key) {
    client = new S3Client({
      endpoint: c.endpoint,
      region: c.region,
      forcePathStyle: true,
      credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
      // R2 doesn't need the SDK's newer default checksums; we verify ourselves.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    clientKey = key;
  }
  return client;
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256");
    fs.createReadStream(filePath)
      .on("error", reject)
      .on("data", (d) => h.update(d))
      .on("end", () => resolve(h.digest("hex")));
  });
}

// Upload a local file (multipart for big ones). Stores its SHA-256 in the
// object's metadata so verify() can compare later without downloading.
async function upload(localPath, key, { contentType = "application/octet-stream", cacheControl } = {}) {
  const sha256 = await sha256File(localPath);
  const size = fs.statSync(localPath).size;
  const up = new Upload({
    client: s3(),
    params: {
      Bucket: config().bucket,
      Key: key,
      Body: fs.createReadStream(localPath),
      ContentType: contentType,
      ContentLength: size,
      CacheControl: cacheControl,
      Metadata: { sha256 },
    },
    queueSize: 2,
    partSize: 16 * 1024 * 1024,
  });
  await up.done();
  return { key, size, sha256 };
}

// { exists, size, sha256 } — sha256 is what upload() stored.
async function head(key) {
  try {
    const r = await s3().send(new HeadObjectCommand({ Bucket: config().bucket, Key: key }));
    return { exists: true, size: Number(r.ContentLength), sha256: (r.Metadata || {}).sha256 || null };
  } catch (err) {
    const status = err.$metadata && err.$metadata.httpStatusCode;
    if (status === 404 || err.name === "NotFound" || err.name === "NoSuchKey") return { exists: false };
    throw err;
  }
}

// True when the object matches the local file exactly (size + SHA-256).
async function verify(localPath, key, expectedSha) {
  const h = await head(key);
  if (!h.exists) return { ok: false, reason: "missing in bucket" };
  const size = fs.statSync(localPath).size;
  if (h.size !== size) return { ok: false, reason: `size ${h.size} != ${size}` };
  const sha = expectedSha || (await sha256File(localPath));
  if (h.sha256 !== sha) return { ok: false, reason: "checksum mismatch" };
  return { ok: true, size, sha256: sha };
}

async function download(key, localPath) {
  const r = await s3().send(new GetObjectCommand({ Bucket: config().bucket, Key: key }));
  const tmp = `${localPath}.download`;
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmp);
    r.Body.on("error", reject);
    out.on("error", reject);
    out.on("finish", resolve);
    r.Body.pipe(out);
  });
  fs.renameSync(tmp, localPath);
  return localPath;
}

// "Delete" = move under trash/ (a bucket lifecycle rule empties it after 30
// days). R2 has no versioning, so this is the undo window.
async function trash(key) {
  const bucket = config().bucket;
  const h = await head(key);
  if (!h.exists) return { trashed: false };
  await s3().send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: `trash/${key}`,
      CopySource: `/${bucket}/${encodeURIComponent(key).replace(/%2F/g, "/")}`,
    })
  );
  await s3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  return { trashed: true, key: `trash/${key}` };
}

// Where a listener's player should fetch the object.
async function publicUrl(key) {
  const c = config();
  if (c.publicBase) return `${c.publicBase}/${key.split("/").map(encodeURIComponent).join("/")}`;
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: c.bucket, Key: key }), { expiresIn: c.urlTtl });
}

module.exports = { isConfigured, upload, head, verify, download, trash, publicUrl, sha256File, config };
