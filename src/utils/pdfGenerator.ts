import { PDFDocument } from 'pdf-lib';
import QRCode from 'qrcode';
import { applyAlphaTransparency } from './imageTransparency';

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64Part = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const binaryString = atob(base64Part);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// 描画コンテンツの実体領域（非透過ピクセル）を自動検出してタイトクロップし、背景（#FF00FF）を透明化するユーティリティ
async function processImageForPdf(
  dataUrl: string,
  makeBgTransparent: boolean = true,
  marginPercent: number = 0.04
): Promise<string> {
  const transparentUrl = makeBgTransparent ? await applyAlphaTransparency(dataUrl) : dataUrl;

  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !transparentUrl) return resolve(transparentUrl);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(transparentUrl);

        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, img.width, img.height);
        const data = imgData.data;

        let minX = img.width;
        let minY = img.height;
        let maxX = 0;
        let maxY = 0;

        for (let y = 0; y < img.height; y++) {
          for (let x = 0; x < img.width; x++) {
            const idx = (y * img.width + x) * 4;
            const a = data[idx + 3];

            if (a > 10) { // アルファ透過エリア以外（不透明コンテンツ領域）
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        ctx.putImageData(imgData, 0, 0);

        if (minX >= maxX || minY >= maxY) {
          return resolve(canvas.toDataURL('image/png'));
        }

        const contentW = maxX - minX + 1;
        const contentH = maxY - minY + 1;

        const marginX = Math.round(contentW * marginPercent);
        const marginY = Math.round(contentH * marginPercent);

        const cropX = Math.max(0, minX - marginX);
        const cropY = Math.max(0, minY - marginY);
        const cropW = Math.min(img.width - cropX, contentW + marginX * 2);
        const cropH = Math.min(img.height - cropY, contentH + marginY * 2);

        const outCanvas = document.createElement('canvas');
        outCanvas.width = cropW;
        outCanvas.height = cropH;
        const outCtx = outCanvas.getContext('2d');
        if (!outCtx) return resolve(canvas.toDataURL('image/png'));

        outCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        resolve(outCanvas.toDataURL('image/png'));
      } catch (e) {
        console.warn("Image processing for PDF failed, using original:", e);
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export async function generatePdfBytes(
  mainImage: string | null,
  capturedLineArt: string | null,
  savedStamps: string[],
  customQrDataUrl?: string | null
): Promise<Uint8Array> {
  // 1. 公式テンプレートPDFをそのまま読み込み
  const existingPdfBytes = await fetch('/OC_LINEスタンプ印刷フォーマット.pdf').then(res => res.arrayBuffer());
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const pages = pdfDoc.getPages();
  const firstPage = pages[0];

  // PDF Page size is A4: 595.28 x 841.89 pt
  // Origin (0,0) in pdf-lib is at BOTTOM-LEFT of the page.

  // 最終調整位置（メイン・線画・QRコードは左へ20pxシフト配置）
  const boxMain = { x: 58.83 - 20, y: 658.05, w: 148.04, h: 148.04 };
  const boxLine = { x: 58.83 - 20, y: 438.19, w: 148.04, h: 148.04 };
  const boxQr = { x: 83.83 - 20, y: 260.19, w: 98.04, h: 98.04 };
  const boxStamps = { x: 253.67, y: 126.19, w: 282.78, h: 679.90 };

  // 画像を枠の中央へ配置描画するヘルパー関数（枠線の描画や白塗り描画は一切行わない）
  const embedAndDrawCentered = async (
    dataUrl: string | null,
    boxX: number,
    boxY: number,
    boxW: number,
    boxH: number,
    padding: number = 8,
    makeWhiteTransparent: boolean = true
  ) => {
    if (!dataUrl) return;
    try {
      const processedUrl = await processImageForPdf(dataUrl, makeWhiteTransparent);
      const bytes = dataUrlToUint8Array(processedUrl);
      const image = await pdfDoc.embedPng(bytes);

      const imgW = image.width;
      const imgH = image.height;

      const maxW = boxW - 2 * padding;
      const maxH = boxH - 2 * padding;
      const scale = Math.min(maxW / imgW, maxH / imgH);

      const drawW = imgW * scale;
      const drawH = imgH * scale;

      const drawX = boxX + (boxW - drawW) / 2;
      const drawY = boxY + (boxH - drawH) / 2;

      firstPage.drawImage(image, {
        x: drawX,
        y: drawY,
        width: drawW,
        height: drawH,
      });
    } catch (e) {
      console.warn("PDF Image Drawing Error:", e);
    }
  };

  // 1. メイン画像 (透過処理なし)
  if (mainImage) {
    await embedAndDrawCentered(mainImage, boxMain.x, boxMain.y, boxMain.w, boxMain.h, 8, false);
  }

  // 2. 手描き線画 (透過処理なし)
  if (capturedLineArt) {
    await embedAndDrawCentered(capturedLineArt, boxLine.x, boxLine.y, boxLine.w, boxLine.h, 8, false);
  }

  // 3. QRコード (透過処理なし)
  try {
    const qrDataUrl = customQrDataUrl || await QRCode.toDataURL('https://example.com/download/stamp-xyz', {
      margin: 1,
      width: 300,
    });
    await embedAndDrawCentered(qrDataUrl, boxQr.x, boxQr.y, boxQr.w, boxQr.h, 4, false);
  } catch (e) {
    console.warn("QR Code Generation Error:", e);
  }

  // 4. バリエーション8点配置
  const cellW = boxStamps.w / 2;
  const cellH = boxStamps.h / 4;

  for (let idx = 0; idx < Math.min(8, savedStamps.length); idx++) {
    const stamp = savedStamps[idx];
    if (!stamp) continue;
    const col = idx % 2;
    const row = Math.floor(idx / 2); // 0 (top) to 3 (bottom)

    const cellX = boxStamps.x + col * cellW;
    const cellY = boxStamps.y + (3 - row) * cellH; // pdf-lib y increases upwards from bottom

    await embedAndDrawCentered(stamp, cellX, cellY, cellW, cellH, 8, true);
  }

  return await pdfDoc.save();
}

export async function generatePdfBlobUrl(
  mainImage: string | null,
  capturedLineArt: string | null,
  savedStamps: string[],
  customQrDataUrl?: string | null
): Promise<string> {
  const pdfBytes = await generatePdfBytes(mainImage, capturedLineArt, savedStamps, customQrDataUrl);
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
}
