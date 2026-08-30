import { ensureBase64PngData, processStampImage } from './stampProcessing';

const PLACEHOLDER_IMG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

export const NEGATIVE_PROMPT = `

## 除外・絶対禁止事項
- 【絶対完全厳禁】絵画の額縁、飾り枠、額（フレーム）、四方の外枠・枠線・ボーダー、黒枠、白枠、ボックス線、二重枠の描画。画像の外周四方には一切の枠線やフレームを描かず、100%均一な単色紫色（#FF00FF）のみとすること
- 指示以外のテキスト
- 写真のようなリアルな質感
- 枠線・フレーム・額縁・ボーダー全般
- 画像の外枠に密着した描画（※LINEスタンプ公式規約に従い、画像外枠とコンテンツの間に必ず10pxの余白を空けること）
- 背景への影・グラデーション・白背景・柄（背景は単色のどぎつい鮮やかな濃い紫色・クロマキーマゼンタ #FF00FF のみとすること）`;

export async function callGeminiImageApi(
  apiKey: string,
  selectedModel: string,
  prompt: string,
  inputImageBase64: string,
  abortControllerRef: React.RefObject<AbortController | null>,
  isCancelledRef: React.RefObject<boolean>,
  onError?: (msg: string) => void,
  isLineArt: boolean = false,
  overrideModel?: string
): Promise<string> {
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    const msg = "Gemini API Keyが未設定です。.env ファイルに有効な API Key を設定してください。";
    console.warn(msg);
    if (onError) onError(msg);
    return PLACEHOLDER_IMG;
  }

  const cleanBase64 = await ensureBase64PngData(inputImageBase64, isLineArt);
  const fullPrompt = prompt + NEGATIVE_PROMPT;

  const modelName = overrideModel || selectedModel;
  const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const requestPayload = {
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: cleanBase64,
            },
          },
          { text: fullPrompt },
        ],
      },
    ],
    generationConfig: {
      seed: 42,
    },
  };

  console.group("🚀 【Gemini API 送信リクエスト】");
  console.log("📌 送信モデル:", modelName);
  console.log("📄 送信プロンプト:\n", fullPrompt);
  console.log("📦 送信ペイロード (Request Payload):", requestPayload);
  console.groupEnd();

  const controller = new AbortController();
  abortControllerRef.current = controller;
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(
      apiEndpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify(requestPayload),
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = `APIエラー (${response.status})`;
      if (response.status === 429) {
        errorMsg = "API利用上限（レート制限）に達しました。しばらく時間をおいて再試行してください。";
      } else if (response.status >= 500) {
        errorMsg = "Google APIサーバーで問題が発生しています。再度お試しください。";
      }
      console.error("❌ Gemini API Error Response:", errorText);
      if (onError) onError(errorMsg);
      return PLACEHOLDER_IMG;
    }

    const data = await response.json();

    console.group("📥 【Gemini API 受信データ（AIから実際に取得した情報）】");
    console.log("🌐 ステータス:", response.status, response.statusText);
    console.log("🏷️ モデルバージョン (modelVersion):", data.modelVersion || modelName);
    console.log("📊 トークン消費・使用メタデータ (usageMetadata):", data.usageMetadata || "なし");
    console.log("🏁 終了理由 (finishReason):", data.candidates?.[0]?.finishReason || "UNKNOWN");
    console.log("📦 AIから実際に取得した全レスポンスデータ (Raw Response Data):", data);
    console.groupEnd();

    const parts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p: any) => p && p.inlineData && p.inlineData.data);
    if (imagePart?.inlineData?.data) {
      const mime = imagePart.inlineData.mimeType || 'image/png';
      const rawDataUrl = `data:${mime};base64,${imagePart.inlineData.data}`;
      return await processStampImage(rawDataUrl, modelName);
    }

    const noImgMsg = "APIから画像データが返却されませんでした。";
    console.warn("⚠️ candidates[0]内にinlineDataが含まれていません:", data.candidates?.[0]);
    if (onError) onError(noImgMsg);
    return PLACEHOLDER_IMG;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    let errMsg = "画像生成中にエラーが発生しました。";
    if (err instanceof Error && err.name === 'AbortError') {
      errMsg = isCancelledRef.current
        ? "画像の生成を中止しました。"
        : "生成処理がタイムアウトしました（30秒）。通信環境を確認し再度お試しください。";
    }
    console.error("Gemini API 呼び出しエラー:", err);
    if (onError) onError(errMsg);
    return PLACEHOLDER_IMG;
  }
}

export async function callGeminiImageApiWithRetry(
  apiKey: string,
  selectedModel: string,
  prompt: string,
  inputImageBase64: string,
  abortControllerRef: React.RefObject<AbortController | null>,
  isCancelledRef: React.RefObject<boolean>,
  onError?: (msg: string) => void,
  isLineArt: boolean = false,
  overrideModel?: string,
  maxRetries: number = 2
): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (isCancelledRef.current) break;
    const res = await callGeminiImageApi(
      apiKey,
      selectedModel,
      prompt,
      inputImageBase64,
      abortControllerRef,
      isCancelledRef,
      attempt === maxRetries ? onError : undefined,
      isLineArt,
      overrideModel
    );
    if (res && res !== PLACEHOLDER_IMG) {
      return res;
    }
    if (attempt < maxRetries && !isCancelledRef.current) {
      console.warn(`⚠️ 画像生成未完了のため、1.5秒後に自動再試行します... (試行 ${attempt}/${maxRetries})`);
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  return PLACEHOLDER_IMG;
}
