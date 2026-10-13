import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const region =
  process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-west-2";

let client: SQSClient | null = null;

/** True when an async processing queue is configured. */
export function isQueueEnabled(): boolean {
  return Boolean(process.env.SQS_QUEUE_URL);
}

/**
 * Enqueue a recording for async diarization + insights (consumed by the
 * Lambda worker). No-op when no queue is configured.
 */
export async function enqueueProcessing(recordingId: string): Promise<boolean> {
  const queueUrl = process.env.SQS_QUEUE_URL;
  if (!queueUrl) {
    return false;
  }

  if (!client) {
    client = new SQSClient({ region });
  }

  await client.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({ recordingId }),
    })
  );

  return true;
}
