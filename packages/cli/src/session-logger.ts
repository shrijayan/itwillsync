import { createWriteStream, mkdirSync, unlinkSync, type WriteStream } from "node:fs";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { getItwillsyncHomeDir } from "@itwillsync/shared/paths";

const FLUSH_INTERVAL_MS = 100;
const BUFFER_SIZE = 4096;

function getLogsDir(): string {
  return join(getItwillsyncHomeDir(), "logs");
}

export class SessionLogger {
  private buffer = "";
  private stream: WriteStream;
  private logPath: string;
  private flushTimer: ReturnType<typeof setInterval>;
  private closed = false;

  constructor(sessionId: string) {
    const logsDir = getLogsDir();
    // 0o700: only owner can traverse/read the logs directory
    mkdirSync(logsDir, { recursive: true, mode: 0o700 });

    this.logPath = join(logsDir, `${sessionId}.log`);
    // 0o600: only owner can read the log file (contains PTY transcripts with potential secrets)
    this.stream = createWriteStream(this.logPath, { flags: "a", mode: 0o600 });

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

    // Compress to gzip (owner-only permissions preserved)
    try {
      const gzPath = this.logPath + ".gz";
      const source = createReadStream(this.logPath);
      const gzip = createGzip();
      // 0o600: same owner-only restriction on the compressed archive
      const dest = createWriteStream(gzPath, { mode: 0o600 });

      await pipeline(source, gzip, dest);

      // Remove uncompressed log, keep only .gz
      try { unlinkSync(this.logPath); } catch { /* ignore cleanup */ }
    } catch {
      // If compression fails, keep the uncompressed log
    }
  }
}
