/**
 * Reference SST (v3) config for deploying the Lecture Notes app to a full
 * AWS account.
 *
 * NOTE: This lab account denies `iam:CreateRole`, which SST requires, so the
 * running environment was provisioned with AWS CLI instead (see
 * scripts/aws-provision.sh). This file is the target infrastructure-as-code
 * for an account where role creation is allowed. Run with `npx sst deploy`.
 *
 * Prerequisites (in the app repo): `npx sst init` then `npm i sst`.
 */
/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "lecture-notes",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    // --- Storage: recorded audio -------------------------------------------
    const audioBucket = new sst.aws.Bucket("Audio");

    // --- Secrets: Mistral API key ------------------------------------------
    const mistralKey = new sst.Secret("MistralApiKey");

    // --- Async pipeline: SQS + Lambda worker -------------------------------
    const queue = new sst.aws.Queue("ProcessingQueue");

    queue.subscribe({
      handler: "lambda/process-audio/index.handler",
      runtime: "nodejs20.x",
      link: [mistralKey],
    });

    // --- App: Next.js on App Runner (WebSocket-free server; browser talks
    //     directly to Mistral's realtime endpoint) --------------------------
    const app = new sst.aws.Nextjs("Web", {
      link: [audioBucket, mistralKey, queue],
      environment: {
        AUDIO_BUCKET: audioBucket.name,
        MISTRAL_SECRET_ARN: mistralKey.arn,
        SQS_QUEUE_URL: queue.url,
      },
    });

    return {
      url: app.url,
      bucket: audioBucket.name,
      queue: queue.url,
    };
  },
});
