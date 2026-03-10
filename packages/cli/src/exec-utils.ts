import { execFile } from "node:child_process";

/**
 * Promise wrapper around `execFile` with a default 5s timeout.
 */
export function execFileAsync(
  cmd: string,
  args: string[],
  opts?: { timeout?: number }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { timeout: opts?.timeout ?? 5000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
        }
      }
    );
  });
}
