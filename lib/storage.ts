import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "node:fs/promises";
import path from "node:path";

const bucket = process.env.AUDIO_BUCKET;
const region =
  process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-west-2";

let s3: S3Client | null = null;

function client(): S3Client {
  if (!s3) {
    s3 = new S3Client({ region });
  }
  return s3;
}

/** True when audio should be persisted to S3 rather than local disk. */
export function isS3Enabled(): boolean {
  return Boolean(bucket);
}

/**
 * Persist a recording's audio. Returns a locator string:
 *   `s3://<bucket>/<key>` when S3 is configured, else `local:<path>`.
 */
export async function uploadAudio(
  recordingId: string,
  data: Buffer,
  contentType = "audio/wav"
): Promise<string> {
  if (!bucket) {
    const dir = path.join(process.cwd(), ".audio");
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${recordingId}.wav`);
    await fs.writeFile(file, data);
    return `local:${file}`;
  }

  const key = `recordings/${recordingId}.wav`;
  await client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: data,
      ContentType: contentType,
    })
  );
  return `s3://${bucket}/${key}`;
}

/** Presigned GET URL for stored S3 audio (null for local paths). */
export async function getAudioUrl(
  audioPath: string,
  expiresIn = 3600
): Promise<string | null> {
  if (!audioPath.startsWith("s3://")) {
    return null;
  }

  const rest = audioPath.slice("s3://".length);
  const slash = rest.indexOf("/");
  const objectBucket = rest.slice(0, slash);
  const key = rest.slice(slash + 1);

  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: objectBucket, Key: key }),
    { expiresIn }
  );
}

/** Read audio bytes for a local path (used by the streaming endpoint). */
export async function readLocalAudio(audioPath: string): Promise<Buffer | null> {
  if (!audioPath.startsWith("local:")) {
    return null;
  }
  return fs.readFile(audioPath.slice("local:".length));
}

/** Read audio bytes from S3 or local storage for a stored locator. */
export async function getAudioBytes(audioPath: string): Promise<Buffer | null> {
  if (audioPath.startsWith("local:")) {
    return readLocalAudio(audioPath);
  }
  if (audioPath.startsWith("s3://")) {
    const rest = audioPath.slice("s3://".length);
    const slash = rest.indexOf("/");
    const objectBucket = rest.slice(0, slash);
    const key = rest.slice(slash + 1);
    const response = await client().send(
      new GetObjectCommand({ Bucket: objectBucket, Key: key })
    );
    const bytes = await response.Body?.transformToByteArray();
    return bytes ? Buffer.from(bytes) : null;
  }
  return null;
}
