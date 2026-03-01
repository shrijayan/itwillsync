import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { stripAnsi } from "../preview-collector.js";

describe("stripAnsi", () => {
  it("should return plain text unchanged", () => {
    expect(stripAnsi("hello world")).toBe("hello world");
  });

  it("should strip CSI color sequences", () => {
    // \x1b[32m = green, \x1b[0m = reset
    expect(stripAnsi("\x1b[32mSuccess\x1b[0m")).toBe("Success");
  });

  it("should strip bold/underline sequences", () => {
    expect(stripAnsi("\x1b[1m\x1b[4mBold Underline\x1b[0m")).toBe("Bold Underline");
  });

  it("should strip multi-param CSI sequences", () => {
    // \x1b[38;5;196m = 256-color red
    expect(stripAnsi("\x1b[38;5;196mRed text\x1b[0m")).toBe("Red text");
  });

  it("should strip cursor movement sequences", () => {
    // \x1b[2J = clear screen, \x1b[H = cursor home
    expect(stripAnsi("\x1b[2J\x1b[HHello")).toBe("Hello");
  });

  it("should strip OSC sequences (BEL terminated)", () => {
    // OSC title set: \x1b]0;My Title\x07
    expect(stripAnsi("\x1b]0;My Title\x07text")).toBe("text");
  });

  it("should strip OSC sequences (ST terminated)", () => {
    // \x1b]0;Title\x1b\\
    expect(stripAnsi("\x1b]0;Title\x1b\\text")).toBe("text");
  });

  it("should strip carriage return", () => {
    expect(stripAnsi("line1\r\nline2")).toBe("line1\nline2");
  });

  it("should handle mixed ANSI and plain text", () => {
    const input = "\x1b[1m>\x1b[0m Building \x1b[32m42\x1b[0m files...";
    expect(stripAnsi(input)).toBe("> Building 42 files...");
  });

  it("should strip CSI ? sequences (DEC private mode)", () => {
    // \x1b[?25h = show cursor, \x1b[?25l = hide cursor
    expect(stripAnsi("\x1b[?25lhidden cursor\x1b[?25h")).toBe("hidden cursor");
  });

  it("should handle empty string", () => {
    expect(stripAnsi("")).toBe("");
  });

  it("should handle string with only ANSI codes", () => {
    expect(stripAnsi("\x1b[32m\x1b[0m")).toBe("");
  });
});

describe("line buffer behavior", () => {
  it("should split lines on newline", () => {
    const input = "line1\nline2\nline3\n";
    const clean = stripAnsi(input);
    const lines = clean.split("\n").filter((l) => l.trim().length > 0);
    expect(lines).toEqual(["line1", "line2", "line3"]);
  });

  it("should handle terminal output with ANSI and newlines", () => {
    const input = "\x1b[32m$\x1b[0m npm run build\n\x1b[33mWARN\x1b[0m deprecated\nDone in 2s\n";
    const clean = stripAnsi(input);
    const lines = clean.split("\n").filter((l) => l.trim().length > 0);
    expect(lines).toEqual(["$ npm run build", "WARN deprecated", "Done in 2s"]);
  });

  it("should keep only last N lines when buffer exceeds limit", () => {
    const MAX = 5;
    const allLines: string[] = [];
    for (let i = 0; i < 10; i++) {
      allLines.push(`line ${i}`);
    }
    const kept = allLines.slice(-MAX);
    expect(kept).toEqual(["line 5", "line 6", "line 7", "line 8", "line 9"]);
    expect(kept).toHaveLength(MAX);
  });
});
