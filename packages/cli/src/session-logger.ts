import { createWriteStream, mkdirSync, unlinkSync, type WriteStream } from "node:fs";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "./config.js";

const FLUSH_INTERVAL_MS = 100;
const BUFFER_SIZE = 4096;

function getLogsDir(): string {
  return join(getConfigDir(), "logs");
}

export class SessionLogger {
  private buffer = "";
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

    if (this.buffer.length >= BUFFER_SIZE) {
      this.flush();
    }
  }

  private flush(): void {
    if (this.buffer.length === 0 || this.closed) return;

    this.stream.write(this.buffer);
    this.buffer = "";
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
      try { unlinkSync(this.logPath); } catch { /* ignore cleanup */ }
    } catch {
      // If compression fails, keep the uncompressed log
    }
  }
}
