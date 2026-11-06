import fs from "node:fs/promises";
import path from "node:path";

/**
 * Persist a recording's audio on local disk. Returns a locator string of the
 * form `local:<absolute-path>`.
 */
export async function uploadAudio(
  recordingId: string,
  data: Buffer
): Promise<string> {
  const dir = path.join(process.cwd(), ".audio");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${recordingId}.wav`);
  await fs.writeFile(file, data);
  return `local:${file}`;
}

/** Read audio bytes for a stored local locator. */
export async function readLocalAudio(audioPath: string): Promise<Buffer | null> {
  if (!audioPath.startsWith("local:")) {
    return null;
  }
  return fs.readFile(audioPath.slice("local:".length));
}
