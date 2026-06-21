// Minimal ambient types for the `qrcode` package. It ships no types and we only
// use toFile() in link.ts - this avoids pulling @types/qrcode over the network.
declare module 'qrcode' {
  interface QRCodeToFileOptions {
    width?: number
    margin?: number
    type?: string
  }
  export function toFile(path: string, text: string, options?: QRCodeToFileOptions): Promise<void>
  const qrcode: { toFile: typeof toFile }
  export default qrcode
}
