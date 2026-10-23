export async function createBarcodeReader() {
  const [{ BrowserMultiFormatOneDReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'), import('@zxing/library'),
  ]);
  return new BrowserMultiFormatOneDReader(new Map([
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]],
    [DecodeHintType.TRY_HARDER, true],
  ]));
}

export async function decodeBarcodePhoto(file) {
  const reader = await createBarcodeReader();
  const { BitArray, Code128Reader } = await import('@zxing/library');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    // Bound phone photos before decoding, then try a larger high-contrast
    // sample for small labels. No images or camera frames leave the device.
    const canvas = document.createElement('canvas');
    const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
    for (const scale of [Math.min(1, 2000 / longestSide), 2000 / longestSide]) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      try { return reader.decodeFromCanvas(canvas).getText(); } catch { /* Try the larger sample. */ }
      // Very small screen captures can have two-pixel bars. Read a few raw
      // thresholded rows too: the general camera binarizer sharpens those thin
      // spaces away. Code128Reader still checks the complete symbol/checksum.
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (const fraction of [0.5, 0.35, 0.65]) {
        const rowIndex = Math.min(canvas.height - 1, Math.floor(canvas.height * fraction));
        for (const threshold of [128, 96, 160, 192]) {
          const row = new BitArray(canvas.width);
          for (let x = 0; x < canvas.width; x++) {
            const offset = (rowIndex * canvas.width + x) * 4;
            if ((pixels[offset] + 2 * pixels[offset + 1] + pixels[offset + 2]) / 4 < threshold) row.set(x);
          }
          for (let direction = 0; direction < 2; direction++) {
            try { return new Code128Reader().decodeRow(rowIndex, row).getText(); } catch { row.reverse(); }
          }
        }
      }
    }
    throw new Error('No readable Code 128 barcode found');
  } finally { URL.revokeObjectURL(url); }
}
