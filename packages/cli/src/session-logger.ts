import { createWriteStream, mkdirSync, renameSync, type WriteStream } from "node:fs";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { createReadStream } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const FLUSH_INTERVAL_MS = 100;
const BUFFER_SIZE = 4096;

function getLogsDir(): string {
  const dir = process.env.ITWILLSYNC_CONFIG_DIR || join(homedir(), ".itwillsync");
  return join(dir, "logs");
}

export class SessionLogger {
  private buffer = "";
  private bufferBytes = 0;
  private stream: WriteStream;
  private logPath: string;
  private flushTimer: ReturnType<typeof setInterval>;
  private closed = false;

  constructor(sessionId: string) {
    const logsDir = getLogsDir();
    mkdirSync(logsDir, { recursive: true });

    this.logPath = join(logsDir, `${sessionId}.log`);
    this.stream = createWriteStream(this.logPath, { flags: "a" });

    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  write(data: string): void {
    if (this.closed) return;

    this.buffer += data;
    this.bufferBytes += Buffer.byteLength(data, "utf-8");

    if (this.bufferBytes >= BUFFER_SIZE) {
      this.flush();
    }
  }

  private flush(): void {
    if (this.buffer.length === 0 || this.closed) return;

    this.stream.write(this.buffer);
    this.buffer = "";
    this.bufferBytes = 0;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    clearInterval(this.flushTimer);
    this.flush();

    // End the write stream and wait for it to finish
    await new Promise<void>((resolve) => {
      this.stream.end(() => resolve());
    });

    // Compress to gzip
    try {
      const gzPath = this.logPath + ".gz";
      const source = createReadStream(this.logPath);
      const gzip = createGzip();
      const dest = createWriteStream(gzPath);

      await pipeline(source, gzip, dest);

      // Remove uncompressed log, keep only .gz
      const { unlinkSync } = await import("node:fs");
      try { unlinkSync(this.logPath); } catch {}
    } catch {
      // If compression fails, keep the uncompressed log
    }
  }
}
