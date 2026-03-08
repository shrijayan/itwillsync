import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

interface ToolEntry {
  name: string;
  lastUsed: number;
}

interface ToolHistoryFile {
  tools: ToolEntry[];
}

const MAX_ENTRIES = 20;

function getHistoryPath(): string {
  const dir = process.env.ITWILLSYNC_CONFIG_DIR || join(homedir(), ".itwillsync");
  return join(dir, "tool-history.json");
}

export class ToolHistory {
  private tools: ToolEntry[] = [];

  constructor() {
    this.load();
  }

  /** Get tool names sorted by most recently used. */
  getTools(): string[] {
    return this.tools
      .sort((a, b) => b.lastUsed - a.lastUsed)
      .map((t) => t.name);
  }

  /** Record a tool usage (add or update lastUsed). */
  recordUsage(toolName: string): void {
    const existing = this.tools.find((t) => t.name === toolName);
    if (existing) {
      existing.lastUsed = Date.now();
    } else {
      this.tools.push({ name: toolName, lastUsed: Date.now() });
    }

    // Prune to max entries (remove least recently used)
    if (this.tools.length > MAX_ENTRIES) {
      this.tools.sort((a, b) => b.lastUsed - a.lastUsed);
      this.tools = this.tools.slice(0, MAX_ENTRIES);
    }

    this.save();
  }

  private load(): void {
    const path = getHistoryPath();
    if (!existsSync(path)) return;

    try {
      const raw = readFileSync(path, "utf-8");
      const data: ToolHistoryFile = JSON.parse(raw);
      if (Array.isArray(data.tools)) {
        this.tools = data.tools;
      }
    } catch {
      // Ignore corrupt file
    }
  }

  private save(): void {
    const path = getHistoryPath();
    mkdirSync(dirname(path), { recursive: true });

    const data: ToolHistoryFile = { tools: this.tools };
    writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
  }
}
