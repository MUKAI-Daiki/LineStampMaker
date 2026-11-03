import { ensureBase64PngData, processCharacterImage } from './imageProcessing';
import { supabase } from './supabaseClient';
import { isLocalDev } from './isLocalDev';

export const MODEL_STANDARD = 'gemini-3.1-flash-image';
export const MODEL_LITE = 'gemini-3.1-flash-lite-image';
export type ModelName = typeof MODEL_STANDARD | typeof MODEL_LITE;

export const MAX_REFERENCE_IMAGES = 4;

export const NEGATIVE_PROMPT = `

## 除外・絶対禁止事項
- 【絶対完全厳禁】絵画の額縁、飾り枠、四方の外枠・枠線・ボーダー、黒枠、白枠、ボックス線、二重枠の描画。画像の外周四方には一切の枠線やフレームを描かず、100%均一な単色紫色（#FF00FF）のみとすること
- 文字・ロゴ・ラベル・番号・吹き出しなど、指示以外のテキスト
- 写真のようなリアルな質感
- 地面・床・影・背景美術・エフェクト背景（キャラクター単体のみを描くこと）
- 複数キャラクターの同時描画、1枚の中への複数ポーズの並列描画（1枚につき1体・1ポーズのみ）
- キャラクターの見切れ（頭頂・足先・武器などが画像の外にはみ出さないよう、周囲に余白を空けること）
- 背景への影・グラデーション・白背景・柄（背景は単色のどぎつい鮮やかな濃い紫色・クロマキーマゼンタ #FF00FF のみとすること）`;

const GEMINI_DIRECT_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 60000;

export interface GenerateImageOptions {
  model: ModelName;
  prompt: string;
  /** data URLs. 1枚目が主参照。 */
  images: string[];
  /** 1枚目が手描き線画のとき true（白黒化前処理を行う） */
  isLineArt?: boolean;
  /** true のとき背景透過などの後処理をせず、生成画像をそのまま返す */
  rawOutput?: boolean;
  /** 429などの再試行不可エラー時に true が設定される（generateImageWithRetry が使用） */
  nonRetryableRef?: { current: boolean };
  abortControllerRef: React.RefObject<AbortController | null>;
  isCancelledRef: React.RefObject<boolean>;
  onError?: (msg: string) => void;
}

function buildGeminiRequestBody(prompt: string, imagesBase64: string[]) {
  return {
    contents: [
      {
        role: 'user',
        parts: [
          ...imagesBase64.map(data => ({ inlineData: { mimeType: 'image/png', data } })),
          { text: prompt },
        ],
      },
    ],
    generationConfig: { seed: 42 },
  };
}

function describeHttpError(status: number, local: boolean): string {
  if (status === 429) return 'Gemini APIの無料枠の利用上限に達しました。大约15時間後にリセットされます。付费プランのAPIキーを使用するか、「自動抽出（端末内処理）」をご利用ください。';
  if (!local && status === 402) return 'スタミナが足りません。時間をおくと回復します（1時間に1回復）';
  if (status === 401 || status === 403) {
    return local
      ? 'APIキーが無効です。.envファイルの VITE_GEMINI_API_KEY を確認してください。'
      : 'この機能を利用する権限がありません。大学（nua.ac.jp）のアカウントでログインしてください。';
  }
  if (status === 413) return '参照画像のサイズが大きすぎます。参照画像の枚数を減らしてください。';
  if (status === 503) return 'サーバー側の画像生成キーが未設定です。管理者に連絡してください。';
  if (status >= 500) return '画像生成サーバーで問題が発生しています。再度お試しください。';
  return `画像生成エラー (${status})`;
}

/** 成功時は透過処理済みの PNG data URL、失敗時は null */
export async function generateImage(opts: GenerateImageOptions): Promise<string | null> {
  const { model, prompt, images, isLineArt = false, rawOutput = false, nonRetryableRef, abortControllerRef, isCancelledRef, onError } = opts;
  const local = isLocalDev();
  const refs = images.slice(0, MAX_REFERENCE_IMAGES);
  if (refs.length === 0) {
    onError?.('参照画像がありません。');
    return null;
  }
  const cleanImages = await Promise.all(refs.map((img, i) => ensureBase64PngData(img, isLineArt && i === 0)));
  const fullPrompt = prompt + NEGATIVE_PROMPT;

  console.groupCollapsed(`[画像生成] ${model} / 参照${cleanImages.length}枚`);
  console.log(fullPrompt);
  console.groupEnd();

  const controller = new AbortController();
  abortControllerRef.current = controller;
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let apiUrl: string;
    let headers: Record<string, string>;
    let body: string;

    if (local) {
      // Vite inlines this at build time; restricting to DEV keeps the key out of production bundles.
      const apiKey = import.meta.env.DEV ? import.meta.env.VITE_GEMINI_API_KEY : undefined;
      if (!apiKey) {
        onError?.('.envファイルに VITE_GEMINI_API_KEY が設定されていません。APIキーを記入してください。');
        return null;
      }
      apiUrl = `${GEMINI_DIRECT_URL}/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
      headers = { 'Content-Type': 'application/json' };
      body = JSON.stringify(buildGeminiRequestBody(fullPrompt, cleanImages));
    } else {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        onError?.('ログインの有効期限が切れました。再度ログインしてください。');
        return null;
      }
      apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini-image`;
      headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` };
      body = JSON.stringify({ model, prompt: fullPrompt, imagesBase64: cleanImages });
    }

    const response = await fetch(apiUrl, { method: 'POST', headers, signal: controller.signal, body });

    if (!response.ok) {
      console.error('画像生成エラー応答:', response.status, await response.text());
      if (response.status === 429 && nonRetryableRef) {
        nonRetryableRef.current = true;
      }
      onError?.(describeHttpError(response.status, local));
      return null;
    }

    const data = await response.json();
    const parts: { inlineData?: { data?: string; mimeType?: string } }[] = data?.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find(p => p?.inlineData?.data);
    if (imagePart?.inlineData?.data) {
      const mime = imagePart.inlineData.mimeType || 'image/png';
      const dataUrl = `data:${mime};base64,${imagePart.inlineData.data}`;
      return rawOutput ? dataUrl : await processCharacterImage(dataUrl, model);
    }

    console.warn('画像データなし:', data?.candidates?.[0]);
    onError?.('APIから画像データが返却されませんでした。');
    return null;
  } catch (err: unknown) {
    let errMsg = '画像生成中にエラーが発生しました。';
    if (err instanceof Error && err.name === 'AbortError') {
      errMsg = isCancelledRef.current
        ? '画像の生成を中止しました。'
        : '生成処理がタイムアウトしました（60秒）。通信環境を確認し再度お試しください。';
    }
    console.error('Gemini API 呼び出しエラー:', err);
    onError?.(errMsg);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function generateImageWithRetry(opts: GenerateImageOptions, maxRetries = 2): Promise<string | null> {
  const nonRetryable = opts.nonRetryableRef ?? { current: false };
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (opts.isCancelledRef.current) break;
    nonRetryable.current = false;
    const res = await generateImage({
      ...opts,
      nonRetryableRef: nonRetryable,
      // 最終試行、または429等の再試行不可エラーの場合のみエラーを表示
      onError: attempt === maxRetries
        ? opts.onError
        : (msg: string) => { if (nonRetryable.current) opts.onError?.(msg); },
    });
    if (res) return res;
    if (nonRetryable.current) break;
    if (attempt < maxRetries && !opts.isCancelledRef.current) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  return null;
}

export interface GenerationRequest {
  model: ModelName;
  prompt: string;
  images: string[];
  rawOutput?: boolean;
}

export type GenerationResult =
  | { ok: true; image: string }
  | { ok: false; reason: 'stamina' | 'cancelled' | 'failed' };

/** 画面側から画像生成を呼ぶための窓口（スタミナ確認・中止・エラー表示込み） */
export interface GenerationRunner {
  begin: () => void;
  cancel: () => void;
  isCancelled: () => boolean;
  run: (req: GenerationRequest) => Promise<GenerationResult>;
}
