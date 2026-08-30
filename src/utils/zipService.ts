import JSZip from 'jszip';
import QRCode from 'qrcode';

// 英数ランダム8文字を生成（暗号論的に安全な乱数を使用）
export function generateRandomCode(length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);
  // 剰余バイアスを避けるため、文字数の倍数を超える値は切り捨てて再抽選する
  const limit = Math.floor(4294967296 / chars.length) * chars.length;
  let result = '';
  for (let i = 0; i < length; i++) {
    let v = randomValues[i];
    while (v >= limit) {
      const retry = new Uint32Array(1);
      crypto.getRandomValues(retry);
      v = retry[0];
    }
    result += chars.charAt(v % chars.length);
  }
  return result;
}

import { applyAlphaTransparency } from './imageTransparency';

// クロマキー背景(#FF00FF)をアルファチャンネル(0~255)でスムーズに透過処理
export async function makeBackgroundTransparent(dataUrl: string): Promise<string> {
  return applyAlphaTransparency(dataUrl);
}
// 下位互換用エイリアス
export const makeWhiteTransparent = makeBackgroundTransparent;

// DataURL (PNG base64) から Uint8Array バイト配列へ変換
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64Part = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const binaryString = atob(base64Part);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * 9個の画像（メイン画像1個、スタンプ8個、トークルームタブ画像1個）および印刷用PDF (sample.pdf) を
 * クロマキー透過処理したうえでZip化し、Cloudflare Worker/R2にアップロードしてQRコード（DataURL）を返却する
 */
export async function prepareStampZipAndGenerateQr(
  mainImage: string | null,
  tabImage: string | null,
  savedStamps: string[],
  pdfBytesGetter?: (qrDataUrl: string) => Promise<Uint8Array>
): Promise<{ downloadUrl: string; qrDataUrl: string }> {
  const zip = new JSZip();

  // 1. メイン画像 (main.png)
  if (mainImage) {
    const transparentMain = await makeBackgroundTransparent(mainImage);
    zip.file('main.png', dataUrlToBytes(transparentMain));
  }

  // 2. スタンプ画像8個 (01.png ～ 08.png)
  for (let i = 0; i < 8; i++) {
    const stampUrl = savedStamps[i];
    if (stampUrl) {
      const transparentStamp = await makeBackgroundTransparent(stampUrl);
      const filename = `${String(i + 1).padStart(2, '0')}.png`;
      zip.file(filename, dataUrlToBytes(transparentStamp));
    }
  }

  // 3. トークルームタブ画像 (tab.png)
  const tabImageBase = tabImage || mainImage || savedStamps[0];
  if (tabImageBase) {
    const transparentTab = await makeBackgroundTransparent(tabImageBase);
    zip.file('tab.png', dataUrlToBytes(transparentTab));
  }

  // 8文字ランダムID
  const code8 = generateRandomCode(8);
  const filename = `${code8}.zip`;

  // Cloudflare Worker API URL (.envから取得、フォールバックあり)
  const workerEndpoint = import.meta.env.VITE_CLOUDFLARE_WORKER_URL || 'https://line-stamp-uploader.workers.dev';

  // 100%Webページとしてブラウザ認識させるため末尾に.zipを付けないURL
  let downloadUrl = `${workerEndpoint}/p/${code8}`;

  // QRコード生成
  const qrDataUrl = await QRCode.toDataURL(downloadUrl, {
    margin: 1,
    width: 300,
  });

  // 4. 印刷用PDFを "sample.pdf" の名称でZipへ格納
  if (pdfBytesGetter) {
    try {
      const pdfBytes = await pdfBytesGetter(qrDataUrl);
      zip.file('sample.pdf', pdfBytes);
    } catch (e) {
      console.warn("Could not include sample.pdf in Zip:", e);
    }
  }

  // Zipファイル生成
  const zipBlob = await zip.generateAsync({ type: 'blob' });

  try {
    const uploadRes = await fetch(`${workerEndpoint}/upload?filename=${filename}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/zip',
      },
      body: zipBlob,
    });

    if (uploadRes.ok) {
      const resJson = await uploadRes.json();
      if (resJson.downloadUrl) {
        downloadUrl = resJson.downloadUrl;
      }
    } else {
      console.warn("Cloudflare Worker upload returned non-200 response, using fallback URL format");
    }
  } catch (err) {
    console.warn("Could not reach Cloudflare Worker endpoint, generating QR code with fallback URL:", err);
  }

  return { downloadUrl, qrDataUrl };
}
