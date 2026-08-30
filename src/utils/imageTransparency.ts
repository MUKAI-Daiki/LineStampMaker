/**
 * LINEスタンプ用クロマキーアルファチャンネル透過ユーティリティ (PNG-32対応)
 *
 * どぎつい鮮やかな濃い紫色（#FF00FF マゼンタ）の背景色を自動検出してアルファチャンネル (0~255) に変換し、
 * キャラクター内部の「白」「淡い色（水彩など）」「肌色」は100%不透明のまま完全に保護します。
 */

export interface TransparencyOptions {
  magentaMinScore?: number; // 不透明度100%を維持する下限スコア (デフォルト: 15)
  magentaMaxScore?: number; // 完全透明(Alpha=0)にする上限スコア (デフォルト: 90)
}

/**
 * 画像の指定クロマキー（どぎつい紫色・マゼンタ #FF00FF）領域をアルファチャンネルでフェードアウト透過処理します。
 */
export async function applyAlphaTransparency(
  dataUrl: string,
  options: TransparencyOptions = {}
): Promise<string> {
  // エッジのわずかな紫フチも確実に補正するためアルファ設定幅を拡大 (15 ~ 90)
  const minScore = options.magentaMinScore ?? 15;
  const maxScore = options.magentaMaxScore ?? 90;

  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !dataUrl) return resolve(dataUrl);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(dataUrl);

        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, img.width, img.height);
        const data = imgData.data;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];

          if (a === 0) continue;

          // 赤成分と青成分が高く、緑成分が低い領域を「どぎつい紫色（#FF00FF）」の背景として抽出
          const minRB = Math.min(r, b);
          const score = minRB - g;

          // 白（R=255, G=255, B=255）や淡い肌色は score <= 0 となるため100%保護される
          if (minRB > 50 && score >= maxScore) {
            data[i + 3] = 0; // 完全透明
          } else if (minRB > 50 && score > minScore) {
            // スムーズなアルファ値補間（0-255）
            const alphaFactor = (maxScore - score) / (maxScore - minScore);
            const newAlpha = Math.round(a * alphaFactor);
            data[i + 3] = newAlpha;

            // 境界の紫フチ・ジャギーを除去するデマッティング (De-matting)
            // 紫(#FF00FF: R=255, G=0, B=255) が乗算されたアンチエイリアス色から元の描画色を復元
            if (newAlpha > 0 && newAlpha < 255) {
              const alphaNorm = newAlpha / 255;
              const bgR = 255;
              const bgG = 0;
              const bgB = 255;
              const unblendR = Math.min(255, Math.max(0, Math.round((r - (1 - alphaNorm) * bgR) / alphaNorm)));
              const unblendG = Math.min(255, Math.max(0, Math.round((g - (1 - alphaNorm) * bgG) / alphaNorm)));
              const unblendB = Math.min(255, Math.max(0, Math.round((b - (1 - alphaNorm) * bgB) / alphaNorm)));
              data[i] = unblendR;
              data[i + 1] = unblendG;
              data[i + 2] = unblendB;
            }
          }
        }

        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        console.warn("Chroma key alpha transparency processing failed:", e);
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
