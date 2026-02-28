export const DEFAULT_PORT = 3456;

export interface CliOptions {
  port: number;
  localhost: boolean;
  noQr: boolean;
  command: string[];
  subcommand: "setup" | null;
  tailscale: boolean;
  local: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    port: DEFAULT_PORT,
    localhost: false,
    noQr: false,
    command: [],
    subcommand: null,
    tailscale: false,
    local: false,
  };

  const args = argv.slice(2);

  // Check for subcommand first
  if (args.length > 0 && args[0] === "setup") {
    options.subcommand = "setup";
    return options;
  }

  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    if (arg === "--") {
      // Everything after -- is the command
      options.command = args.slice(i + 1);
      break;
    } else if (arg === "--port" && i + 1 < args.length) {
      options.port = parseInt(args[i + 1], 10);
      i += 2;
    } else if (arg === "--localhost") {
      options.localhost = true;
      i++;
    } else if (arg === "--tailscale") {
      options.tailscale = true;
      i++;
    } else if (arg === "--local") {
      options.local = true;
      i++;
    } else if (arg === "--no-qr") {
      options.noQr = true;
      i++;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--version" || arg === "-v") {
      console.log("itwillsync v0.1.0");
      process.exit(0);
    } else {
      // If no -- separator, treat remaining args as the command
      options.command = args.slice(i);
      break;
    }
  }

  return options;
}

export function printHelp(): void {
  console.log(`
itwillsync — Sync any terminal agent to your phone

Usage:
  itwillsync [options] -- <command> [args...]
  itwillsync [options] <command> [args...]
  itwillsync setup

Examples:
  itwillsync -- claude
  itwillsync -- aider --model gpt-4
  itwillsync bash
  itwillsync --port 8080 -- claude
  itwillsync --tailscale -- claude
  itwillsync setup

Commands:
  setup              Run the setup wizard (configure networking mode)

Options:
  --port <number>    Port to listen on (default: ${DEFAULT_PORT})
  --localhost         Bind to 127.0.0.1 only (no LAN access)
  --tailscale         Use Tailscale IP for this session
  --local             Use local network IP for this session
  --no-qr            Don't display QR code
  -h, --help         Show this help
  -v, --version      Show version
`);
}
