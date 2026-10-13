/**
 * SQS worker: for each queued recording, ask the app to transcribe the audio
 * already stored in S3 (diarization + end-word grouping + insights).
 *
 * Environment:
 *   APP_BASE_URL   - public base URL of the Next.js app (e.g. http://1.2.3.4)
 *   PROCESS_SECRET - shared secret sent as x-process-secret
 */
export const handler = async (event) => {
  const baseUrl = process.env.APP_BASE_URL;
  const secret = process.env.PROCESS_SECRET ?? "";

  if (!baseUrl) {
    throw new Error("APP_BASE_URL is not configured");
  }

  for (const record of event.Records ?? []) {
    let recordingId;
    try {
      ({ recordingId } = JSON.parse(record.body));
    } catch {
      throw new Error(`Invalid message body: ${record.body}`);
    }

    const response = await fetch(
      `${baseUrl}/api/recordings/${recordingId}/process`,
      {
        method: "POST",
        headers: secret ? { "x-process-secret": secret } : {},
      }
    );

    if (!response.ok) {
      throw new Error(
        `Processing failed for ${recordingId}: HTTP ${response.status}`
      );
    }

    console.log(`Processed recording ${recordingId}`);
  }
};
