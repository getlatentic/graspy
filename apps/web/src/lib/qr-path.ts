// The quiet zone a scanner needs around the code, in modules.
const QUIET_MODULES = 4;

export interface QrDrawing {
  path: string;
  size: number;
}

/** The dark modules of the QR code for `value`, as one SVG path, and the code's size in modules. */
export async function qrPath(value: string): Promise<QrDrawing> {
  const { default: qrcode } = await import("qrcode-generator");
  // Type 0 picks the smallest that holds the text; M recovers from 15% of the code being hidden.
  const code = qrcode(0, "M");
  code.addData(value);
  code.make();
  const size = code.getModuleCount();
  let path = "";
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (code.isDark(row, column)) {
        path += `M${column + QUIET_MODULES} ${row + QUIET_MODULES}h1v1h-1z`;
      }
    }
  }
  return { path, size: size + 2 * QUIET_MODULES };
}
