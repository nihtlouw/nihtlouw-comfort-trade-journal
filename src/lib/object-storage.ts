import { createHash, createHmac } from "node:crypto";

export type ObjectStorageConfig = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

export function getObjectStorageConfig(env: NodeJS.ProcessEnv = process.env): ObjectStorageConfig | null {
  const endpoint = (env.R2_ENDPOINT || env.S3_ENDPOINT || "").trim().replace(/\/+$/, "");
  const bucket = (env.R2_BUCKET || env.S3_BUCKET || "").trim();
  const accessKeyId = (env.R2_ACCESS_KEY_ID || env.S3_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (env.R2_SECRET_ACCESS_KEY || env.S3_SECRET_ACCESS_KEY || "").trim();
  const region = (env.R2_REGION || env.S3_REGION || "auto").trim() || "auto";
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, bucket, accessKeyId, secretAccessKey, region };
}

function sha256Hex(payload: Uint8Array | string): string {
  return createHash("sha256").update(payload).digest("hex");
}

function hmacSha256(key: Buffer | string, message: string): Buffer {
  return createHmac("sha256", key).update(message, "utf8").digest();
}

function encodeRfc3986Segment(segment: string): string {
  return encodeURIComponent(segment).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function encodeS3Path(bucket: string, key: string): string {
  const cleanKey = key.replace(/^\/+/, "");
  const segments = [bucket, ...cleanKey.split("/").filter(Boolean)];
  return `/${segments.map(encodeRfc3986Segment).join("/")}`;
}

function formatAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

export function signS3Request(params: {
  method: "PUT" | "GET" | "DELETE";
  config: ObjectStorageConfig;
  key: string;
  body?: Uint8Array;
  contentType?: string;
  now?: Date;
}): { url: string; headers: Record<string, string> } {
  const { method, config, key, body, contentType, now = new Date() } = params;
  const endpointUrl = new URL(config.endpoint);
  const basePath = endpointUrl.pathname.replace(/\/+$/, "");
  const canonicalPath = `${basePath}${encodeS3Path(config.bucket, key)}`;
  const url = `${endpointUrl.origin}${canonicalPath}`;

  const { amzDate, dateStamp } = formatAmzDate(now);
  const payloadHash = body ? sha256Hex(body) : sha256Hex("");

  const rawHeaders: Record<string, string> = {
    host: endpointUrl.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (contentType) {
    rawHeaders["content-type"] = contentType;
  }

  const sortedNames = Object.keys(rawHeaders).sort();
  const canonicalHeaders = sortedNames.map((name) => `${name}:${rawHeaders[name].trim()}\n`).join("");
  const signedHeaders = sortedNames.join(";");

  const canonicalRequest = [
    method,
    canonicalPath,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmacSha256(`AWS4${config.secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, config.region);
  const kService = hmacSha256(kRegion, "s3");
  const kSigning = hmacSha256(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  const headers: Record<string, string> = {
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  return { url, headers };
}

export async function putCloudObject(params: {
  config: ObjectStorageConfig;
  key: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<void> {
  const { url, headers } = signS3Request({
    method: "PUT",
    config: params.config,
    key: params.key,
    body: params.bytes,
    contentType: params.contentType,
  });
  const response = await fetch(url, {
    method: "PUT",
    headers: { ...headers, "Content-Length": String(params.bytes.byteLength) },
    body: new Blob([new Uint8Array(params.bytes)]),
  });
  if (!response.ok) {
    throw new Error(`Object storage upload failed (${response.status}).`);
  }
}

export async function getCloudObject(params: {
  config: ObjectStorageConfig;
  key: string;
}): Promise<Uint8Array> {
  const { url, headers } = signS3Request({
    method: "GET",
    config: params.config,
    key: params.key,
  });
  const response = await fetch(url, {
    method: "GET",
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Object storage read failed (${response.status}).`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function deleteCloudObject(params: {
  config: ObjectStorageConfig;
  key: string;
}): Promise<void> {
  const { url, headers } = signS3Request({
    method: "DELETE",
    config: params.config,
    key: params.key,
  });
  const response = await fetch(url, { method: "DELETE", headers });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Object storage delete failed (${response.status}).`);
  }
}
