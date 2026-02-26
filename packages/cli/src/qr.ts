import qrcode from "qrcode-terminal";

/**
 * Displays a QR code in the terminal for the given URL,
 * along with the URL as plain text for easy copy-paste.
 */
export function displayQR(url: string): void {
  const separator = "─".repeat(48);

  console.log("");
  console.log(separator);
  console.log("");
  console.log("  Scan this QR code on your phone to connect:");
  console.log("");

  qrcode.generate(url, { small: true }, (code: string) => {
    console.log(code);
    console.log(`  ${url}`);
    console.log("");
    console.log(separator);
    console.log("");
  });
}
