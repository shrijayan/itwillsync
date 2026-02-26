declare module "qrcode-terminal" {
  interface QRCodeOptions {
    small?: boolean;
  }

  function generate(
    text: string,
    opts?: QRCodeOptions,
    callback?: (qrcode: string) => void,
  ): void;

  function generate(text: string, callback?: (qrcode: string) => void): void;

  const error: number;

  export default { generate, error };
  export { generate, error };
}
