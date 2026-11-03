import { useState, useRef, useEffect } from 'react';
import { Camera, Pen, Eraser, Undo, ArrowRight, Image as ImageIcon, Check, Shuffle, Trash2, X, Square, Hand, FolderOpen, Plus, LogOut, RotateCcw, BookOpen, Zap, Users } from 'lucide-react';
import { BULK_ASSET_TYPES, type BulkAssetType, type Mode } from './characterAssets';
import { generateImage, generateImageWithRetry, MODEL_NANO_BANANA as MODEL_STANDARD, NEGATIVE_PROMPT, type GenerationRunner, type ModelName } from './utils/geminiApi';
import { CHECKER_BG, PLACEHOLDER_IMG } from './utils/constants';
import { listProjects, createProject, updateProject, deleteProject, loadProject, saveProjectImages, type ProjectRow } from './utils/projectDb';
import { signOut } from './utils/useAuth';
import { isLocalDev } from './utils/isLocalDev';
import { useStamina } from './utils/useStamina';
import { useVariations } from './utils/useVariations';
import { AssetGenerationStep } from './components/AssetGenerationStep';
import { AdjustmentStep } from './components/AdjustmentStep';
import { DownloadStep } from './components/DownloadStep';
import { LineArtExtractModal } from './components/LineArtExtractModal';
import { AdminUserModal } from './components/AdminUserModal';
import { supabase } from './utils/supabaseClient';
import type { StaminaInfo, StudioProps } from './components/studioTypes';

const LOCAL = isLocalDev();

const STEP_LABELS = ['線画', '基本イラスト', '一括生成', '微調整', '保存'];

interface StyleItem {
  id: string;
  label: string;
  easyLabel?: string;
  src: string;
  prompt: string;
  hideInEasy?: boolean;
}

const STYLES: StyleItem[] = [
  { id: 'copic', label: 'コピック', easyLabel: 'コピック', src: '/samples/copic.jpg', prompt: '手描きコピック風の、温かみのあるマーカー画風' },
  { id: 'anime', label: 'アニメ', easyLabel: 'アニメ', src: '/samples/anime.jpg', prompt: 'くっきりとしたアニメセル画風のカラーイラスト' },
  { id: 'watercolor', label: '水彩', easyLabel: 'すいさい', src: '/samples/watercolor.jpg', prompt: '優しく淡い色滲みがある水彩画風のタッチ、境界線は消す' },
  { id: 'clay', label: 'クレイ', easyLabel: '粘土(ねんど)', src: '/samples/clay.jpg', prompt: '3Dのプラスチックフィギュア風（背景の影は無し）' },
  { id: 'retro', label: 'レトロ', easyLabel: 'レトロ', src: '/samples/retro.jpg', prompt: '80年代昭和レトロなポップアート風（ハーフトーン・ドット柄）' },
  { id: 'coloredPencil', label: '色鉛筆', easyLabel: 'いろえんぴつ', src: '/samples/colored_pencil.jpg', prompt: '素朴な鉛筆の描き込みとハッチング質感の色鉛筆風' },
  { id: '3dFigure', label: '3Dフィギュア', easyLabel: '3Dフィギュア', src: '/samples/clay_figure.jpg', prompt: 'プラスチック玩具のような3Dフィギュア風（本体のみ立体光沢、背景の影はなし）', hideInEasy: true },
  { id: 'picasso', label: '芸術（ピカソ風）', easyLabel: 'ピカソ風', src: '/samples/picasso.jpg', prompt: 'ピカソのキュビスムのような前衛的・幾何学的な配色アート風', hideInEasy: true },
  { id: 'original', label: 'オリジナル', easyLabel: 'そのまま', src: '/samples/original.jpg', prompt: '着色はせず、元線画のタッチを活かしたまま線の補正・清書と背景の白色処理を行う（表情は変化させない）' },
];

interface AppProps {
  userId?: string;
  isAdmin: boolean;
  onShowGuide?: () => void;
}

export default function App({ userId, isAdmin, onShowGuide }: AppProps) {
  const [step, setStep] = useState<number>(1);
  const [mode, setMode] = useState<Mode>('default');

  const [isDebugMode, setIsDebugMode] = useState<boolean>(false);
  const [selectedModel, setSelectedModel] = useState<ModelName>(MODEL_STANDARD);

  const { stamina, maxStamina, isLoading: isStaminaLoading, consumeStamina, getStaminaCost, syncStamina } = useStamina(userId, isAdmin);
  const [staminaError, setStaminaError] = useState<string | null>(null);

  const [isRestored, setIsRestored] = useState<boolean>(false);

  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectList, setProjectList] = useState<ProjectRow[]>([]);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  const [newProjectName, setNewProjectName] = useState('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [capturedLineArt, setCapturedLineArt] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<string>('anime');
  const [lineRetention, setLineRetention] = useState<number>(70);
  const [charDesc, setCharDesc] = useState<string>('');
  const [baseFreeText, setBaseFreeText] = useState<string>('');
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [showBaseConfirm, setShowBaseConfirm] = useState(false);
  const [isGeneratingBase, setIsGeneratingBase] = useState(false);
  const [apiErrorMessage, setApiErrorMessage] = useState<string | null>(null);

  const [selectedAssets, setSelectedAssets] = useState<BulkAssetType[]>([...BULK_ASSET_TYPES]);
  const [variationFreeText, setVariationFreeText] = useState<string>('');

  const store = useVariations(userId, currentProjectId, setApiErrorMessage);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isCancelledRef = useRef<boolean>(false);

  const cancelGeneration = () => {
    isCancelledRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGeneratingBase(false);
    setApiErrorMessage('画像の生成を中止しました。');
  };

  const staminaShortMessage = (model: ModelName) =>
    `スタミナが足りません（必要: ${getStaminaCost(model)}）。時間をおくと回復します（1時間に1回復）`;

  const runner: GenerationRunner = {
    begin: () => {
      isCancelledRef.current = false;
      setApiErrorMessage(null);
      setStaminaError(null);
    },
    cancel: cancelGeneration,
    isCancelled: () => isCancelledRef.current,
    run: async ({ model, prompt, images, rawOutput }) => {
      if (isCancelledRef.current) return { ok: false, reason: 'cancelled' };
      if (!(await consumeStamina(model))) {
        setStaminaError(staminaShortMessage(model));
        return { ok: false, reason: 'stamina' };
      }
      const image = await generateImageWithRetry({
        model,
        prompt,
        images,
        rawOutput,
        abortControllerRef,
        isCancelledRef,
        onError: setApiErrorMessage,
      });
      if (!LOCAL) syncStamina();
      if (isCancelledRef.current) return { ok: false, reason: 'cancelled' };
      return image ? { ok: true, image } : { ok: false, reason: 'failed' };
    },
  };


  // Step 1: Canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(5);
  const [tool, setTool] = useState<'pen' | 'eraser' | 'hand'>('pen');
  const [history, setHistory] = useState<string[]>([]);
  const panStartPos = useRef<{ x: number; y: number } | null>(null);
  const panSnapshot = useRef<HTMLImageElement | null>(null);

  const loadDebugLineArt = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      setHistory(prev => [...prev, dataUrl]);
      setCapturedLineArt(dataUrl);
    };
    img.src = '/samples/debug_lineart.png';
  };

  useEffect(() => {
    if (step === 1 && canvasRef.current && isRestored) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (capturedLineArt) {
          const lastImg = new Image();
          lastImg.onload = () => {
            ctx.drawImage(lastImg, 0, 0, canvas.width, canvas.height);
          };
          lastImg.src = capturedLineArt;
        } else if (history.length > 0) {
          const lastImg = new Image();
          lastImg.onload = () => {
            ctx.drawImage(lastImg, 0, 0, canvas.width, canvas.height);
          };
          lastImg.src = history[history.length - 1];
        } else if (isDebugMode) {
          loadDebugLineArt();
        }
      }
    }
  }, [step, isRestored]);

  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    // キャンバス内での正確な物理座標変換 (600x600 解像度に対応)
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCanvasCoords(e);

    if (tool === 'hand') {
      panStartPos.current = { x, y };
      const img = new Image();
      img.src = canvas.toDataURL();
      panSnapshot.current = img;
      return;
    }

    ctx.beginPath();
    ctx.moveTo(x, y);

    // 単押しタップ・クリックでも点を打てるように初期描画
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.strokeStyle = tool === 'eraser' ? 'white' : 'black';
    ctx.fillStyle = tool === 'eraser' ? 'white' : 'black';
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.beginPath(); // パスをリセット
      setHistory(prev => [...prev, canvas.toDataURL()]);
    }
    panStartPos.current = null;
    panSnapshot.current = null;
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCanvasCoords(e);

    if (tool === 'hand') {
      if (!panStartPos.current || !panSnapshot.current || !panSnapshot.current.complete) return;
      const dx = x - panStartPos.current.x;
      const dy = y - panStartPos.current.y;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(panSnapshot.current, dx, dy);
      return;
    }

    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = tool === 'eraser' ? 'white' : 'black';

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const undo = () => {
    if (history.length === 0) return;
    const newHistory = [...history];
    newHistory.pop();
    setHistory(newHistory);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      if (newHistory.length === 0) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        const img = new Image();
        img.src = newHistory[newHistory.length - 1];
        img.onload = () => ctx.drawImage(img, 0, 0);
      }
    }
  };

  // Webカメラ撮影モーダル関連State
  const [isCameraModalOpen, setIsCameraModalOpen] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const [extractSource, setExtractSource] = useState<string | null>(null);
  const [lastRawImage, setLastRawImage] = useState<string | null>(null);
  const [showImportHint, setShowImportHint] = useState(false);

  useEffect(() => {
    if (!showImportHint) return;
    const t = setTimeout(() => setShowImportHint(false), 5000);
    return () => clearTimeout(t);
  }, [showImportHint]);

  const openExtractModal = (dataUrl: string) => {
    setLastRawImage(dataUrl);
    setExtractSource(dataUrl);
  };

  const applyLineArtToCanvas = (lineArt: string) => {
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      const snapshot = canvas.toDataURL('image/png');
      setHistory(prev => [...prev, snapshot]);
      setCapturedLineArt(snapshot);
      setTool('pen');
      setExtractSource(null);
      setShowImportHint(true);
    };
    img.src = lineArt;
  };

  // Webカメラの起動
  const startCamera = async () => {
    setCameraError(null);
    setIsCameraModalOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.warn("Camera access failed:", err);
      setCameraError("カメラへのアクセスが拒否されたか、有効なカメラが見つかりませんでした。");
    }
  };

  // Webカメラの停止
  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
    }
    setIsCameraModalOpen(false);
  };

  // Webカメラ映像からのシャッター撮影 → 調整モーダルへ
  const captureWebcam = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = video.videoWidth || 640;
      tempCanvas.height = video.videoHeight || 480;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
        const dataUrl = tempCanvas.toDataURL('image/png');
        stopCamera();
        openExtractModal(dataUrl);
      }
    }
  };

  const handleCameraUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (dataUrl) openExtractModal(dataUrl);
      };
      reader.readAsDataURL(file);
    }
    if (e.target) e.target.value = '';
  };

  const goToStep2 = () => {
    if (canvasRef.current) {
      setCapturedLineArt(canvasRef.current.toDataURL('image/png'));
    } else if (history.length > 0) {
      setCapturedLineArt(history[history.length - 1]);
    }
    if (baseImage) {
      setStep(3); // 基本イラストがローカルに残っている場合はStep2をスキップしてStep3へ
    } else {
      setStep(2);
    }
  };

  // Step 2: Base Image Gen

  const availableStyles = STYLES.filter(s => mode !== 'easy' || !s.hideInEasy);

  useEffect(() => {
    if (mode === 'easy') {
      const currentStyleObj = STYLES.find(s => s.id === selectedStyle);
      if (currentStyleObj?.hideInEasy) {
        setSelectedStyle('anime');
      }
    }
  }, [mode, selectedStyle]);



  // 線画維持率(%)に応じた自然な定性指示文の自動変換
  const getLineRetentionInstruction = (retention: number): string => {
    if (retention >= 80) {
      return `- 元の手描き線画の輪郭・シルエット・ポーズ・独特な頭身をそのまま100%維持しつつ、選択した画風・タッチに基づいて線の質感やタッチを適度に馴染ませる`;
    } else if (retention >= 50) {
      return `- 【手描き線の特徴を重視】添付された手描き線の独特なシルエットや表情・パーツ配置をしっかり残し、選択した画風・タッチに基づいて線の質感やタッチを自由にアレンジ・最適化して描画すること。`;
    } else {
      return `- 【線画をベースに清書】添付された線画のポーズや構図を参考にしつつ、選択した画風・タッチに合わせて線の質感やタッチを自由に補正・アレンジして綺麗に清書し着色すること。`;
    }
  };

  const generateBaseImage = async () => {
    setStaminaError(null);
    const baseModel = selectedModel;
    if (!(await consumeStamina(baseModel))) {
      setStaminaError(staminaShortMessage(baseModel));
      return;
    }
    isCancelledRef.current = false;
    setIsGeneratingBase(true);
    setApiErrorMessage(null);
    const styleObj = STYLES.find(s => s.id === selectedStyle) || STYLES[0];
    const retentionInstruction = getLineRetentionInstruction(lineRetention);

    const charDescriptionText = charDesc.trim()
      ? charDesc
      : '添付線画画像の中央に描かれているオリジナルキャラクター（添付スケッチの被写体の形そのもの）';

    const styleSection = selectedStyle === 'original'
      ? '- 着色はせず、元の線画を活かしながら途切れている線を補正・清書'
      : `- キャラクターの全身に部分的な塗り残しがないように着色\n\n## 画風・タッチ\n- ${styleObj.prompt}`;

    const prompt = `【重要指示】添付された1枚目の画像は「加工元の手描き線画イラスト」です。添付画像のキャラクターデザイン（顔・髪型・服装・持ち物・体型・頭身）を厳密なガイドラインとして直接追従し、ゲームやWebアプリで使うキャラクターの「基本設定画」を生成してください。この基本設定画は、後で様々な向き・ポーズ・表情のバリエーションを作る際の唯一の見本になります。

## 描画条件
${retentionInstruction}
- キャラクター1体のみを、頭からつま先まで全身が画面内に収まるように中央に配置する（四方に十分な余白を取る）
- 正面〜やや斜め前向きで自然に立った、デザインがはっきり分かるポーズ
- 正方形の画像
- 添付線画と無関係な人物・キャラクター・小物を勝手に追加することは厳禁
- 背景は完全に単一のどぎつい鮮やかな濃い紫色・クロマキーマゼンタ（#FF00FF）。背景への影・グラデーション・模様・額縁・フレーム・枠線・地面は一切描画せず、100%均一なマゼンタ（#FF00FF）のみで描画すること
- 【絶対厳禁】額縁、飾り枠、四方の外枠・枠線・ボーダー、文字、ロゴの描画は厳禁
- 【重要】背景のマゼンタ（#FF00FF）はクロマキー透過用の領域です。キャラクター本体の内側はどんな色（白や薄い色も含む）で自由に着色してください
${styleSection}

## キャラクターの説明
- ${charDescriptionText}
${baseFreeText ? `\n## 追加指示\n- ${baseFreeText}` : ''}`;
    if (isDebugMode) console.log(`【生成プロンプト (${baseModel})】:\n`, prompt + NEGATIVE_PROMPT);

    const inputCanvasData = capturedLineArt
      || (canvasRef.current ? canvasRef.current.toDataURL('image/png') : null)
      || (history.length > 0 ? history[history.length - 1] : PLACEHOLDER_IMG);

    const resultImg = await generateImage({
      model: baseModel,
      prompt,
      images: [inputCanvasData],
      isLineArt: true,
      abortControllerRef,
      isCancelledRef,
      onError: setApiErrorMessage,
    });
    setIsGeneratingBase(false);
    if (!LOCAL) syncStamina();
    if (resultImg) {
      setBaseImage(resultImg);
      setShowBaseConfirm(true);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const savedId = localStorage.getItem('current_project_id');
        const projects = await listProjects();
        setProjectList(projects);

        const target = (savedId && projects.find(p => p.id === savedId)) || projects[0];
        if (target) {
          await restoreProjectFromDb(target.id);
        } else {
          const newProj = await createProject();
          setCurrentProjectId(newProj.id);
          localStorage.setItem('current_project_id', newProj.id);
          setProjectList([newProj]);
        }
      } catch (e) {
        console.warn('プロジェクト復元に失敗しました:', e);
        setApiErrorMessage('保存済みのプロジェクトを読み込めませんでした。ページを再読み込みしてください。');
      } finally {
        setIsRestored(true);
        setIsLoadingProject(false);
      }
    })();
  }, []);

  const resetLocalState = () => {
    setHistory([]);
    setCapturedLineArt(null);
    setCharDesc('');
    setBaseFreeText('');
    setBaseImage(null);
    setSelectedAssets([...BULK_ASSET_TYPES]);
    setVariationFreeText('');
    store.clear();
    setStep(1);
  };

  useEffect(() => {
    if (LOCAL || !userId) return;
    void supabase.rpc('touch_last_seen');
  }, [userId, LOCAL]);

  const restoreProjectFromDb = async (projectId: string) => {
    const full = await loadProject(projectId);
    const d = full.project;
    setCurrentProjectId(d.id);
    localStorage.setItem('current_project_id', d.id);
    setStep(d.step ?? 1);
    setIsDebugMode(!!d.is_debug_mode);
    if (d.selected_model) setSelectedModel(d.selected_model as ModelName);
    if (d.selected_style) setSelectedStyle(d.selected_style);
    if (d.line_retention !== undefined) setLineRetention(d.line_retention);
    setCharDesc(d.char_desc ?? '');
    setBaseFreeText(d.base_free_text ?? '');
    const assets = (d.selected_assets ?? []).filter(a => BULK_ASSET_TYPES.includes(a));
    setSelectedAssets(assets.length > 0 ? assets : [...BULK_ASSET_TYPES]);
    setVariationFreeText(d.variation_free_text ?? '');
    if (d.mode) setMode(d.mode as Mode);
    setCapturedLineArt(full.lineArt);
    setHistory(full.lineArt ? [full.lineArt] : []);
    setBaseImage(full.baseImage);
    if (!full.baseImage && (d.step ?? 1) > 2) setStep(full.lineArt ? 2 : 1);
    await store.load(d.id);
  };

  useEffect(() => {
    if (!isRestored || !currentProjectId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      (async () => {
        try {
          await updateProject(currentProjectId, {
            step,
            is_debug_mode: isDebugMode,
            selected_model: selectedModel,
            selected_style: selectedStyle,
            line_retention: lineRetention,
            char_desc: charDesc,
            base_free_text: baseFreeText,
            selected_assets: selectedAssets,
            variation_free_text: variationFreeText,
            mode,
          });
          await saveProjectImages(currentProjectId, { lineArt: capturedLineArt, baseImage });
        } catch (e) {
          console.warn('データベース保存エラー:', e);
        }
      })();
    }, 2000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [
    isRestored, currentProjectId, isDebugMode, step, selectedModel, capturedLineArt, selectedStyle,
    lineRetention, charDesc, baseFreeText, baseImage, selectedAssets, variationFreeText, mode
  ]);

  const resetAll = () => {
    if (window.confirm('線画・基本イラスト・作成したバリエーションをすべて破棄して、最初の線画作成からやり直しますか？')) {
      void Promise.all(store.variations.map(v => store.remove(v.id)));
      resetLocalState();
      onShowGuide?.();
    }
  };

  const handleCreateProject = async () => {
    try {
      const name = newProjectName.trim() || undefined;
      const proj = await createProject(name);
      setProjectList(prev => [proj, ...prev]);
      setNewProjectName('');
      setShowProjectPicker(false);
      resetLocalState();
      setCurrentProjectId(proj.id);
      localStorage.setItem('current_project_id', proj.id);
    } catch (e) {
      console.warn('プロジェクト作成エラー:', e);
      setApiErrorMessage('新しいプロジェクトを作成できませんでした。');
    }
  };

  const handleSwitchProject = async (id: string) => {
    if (id === currentProjectId) {
      setShowProjectPicker(false);
      return;
    }
    try {
      setIsLoadingProject(true);
      resetLocalState();
      await restoreProjectFromDb(id);
      setShowProjectPicker(false);
    } catch (e) {
      console.warn('プロジェクト読み込みエラー:', e);
      setApiErrorMessage('プロジェクトを読み込めませんでした。');
    } finally {
      setIsLoadingProject(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!window.confirm('このプロジェクトと、その中の画像をすべて完全に削除しますか？')) return;
    try {
      await deleteProject(id, userId);
      const remaining = projectList.filter(p => p.id !== id);
      setProjectList(remaining);
      if (currentProjectId === id) {
        if (remaining.length > 0) {
          await handleSwitchProject(remaining[0].id);
        } else {
          await handleCreateProject();
        }
      }
    } catch (e) {
      console.warn('プロジェクト削除エラー:', e);
      setApiErrorMessage('プロジェクトを削除できませんでした。');
    }
  };

  const staminaInfo: StaminaInfo = { remaining: stamina, unlimited: LOCAL || isAdmin, cost: getStaminaCost };
  const studioProps: StudioProps | null = baseImage
    ? {
        baseImage,
        promptCtx: {
          stylePrompt: (STYLES.find(s => s.id === selectedStyle) || STYLES[0]).prompt,
          charDesc,
          freeText: variationFreeText,
        },
        runner,
        store,
        mode,
        stamina: staminaInfo,
      }
    : null;
  const currentProject = projectList.find(p => p.id === currentProjectId);


  if (isLoadingProject) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <Shuffle size={48} className="text-green-500 animate-spin" />
          <p className="font-bold text-gray-600 text-lg">プロジェクトを読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-slate-50 text-slate-800 transition-all ${mode === 'easy' ? 'font-ud-kyokasho text-[21px]' : 'font-biz-ud text-[14px]'
      }`}>
      <header className="bg-white shadow-sm p-4 flex flex-wrap justify-between items-center sticky top-0 z-10 gap-3">
        <h1 className="text-xl font-bold text-green-600 flex items-center gap-2">
          オリキャラメーカー
          {isDebugMode && (
            <span className="text-xs bg-purple-100 text-purple-700 border border-purple-300 font-mono font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1">
              🐛 デバッグモード
            </span>
          )}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => { setShowProjectPicker(true); listProjects().then(setProjectList).catch(() => {}); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 transition-colors"
            title="プロジェクト一覧"
          >
            <FolderOpen size={14} /> プロジェクト
          </button>

          {step > 1 && (
            <button
              onClick={resetAll}
              className={`font-bold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 flex items-center gap-1 transition-colors ${mode === 'easy' ? 'px-4 py-2 rounded-xl text-base' : 'px-3 py-1.5 rounded-lg text-xs'}`}
              title="すべての画像を破棄して最初から線画を描く"
            >
              <Trash2 size={mode === 'easy' ? 18 : 14} /> {mode === 'easy' ? 'ぜんぶやりなおす' : '今の画像を破棄 (最初から)'}
            </button>
          )}
          <select
            className="border rounded p-1 bg-white text-sm font-medium"
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
          >
            <option value="easy">やさしいモード</option>
            <option value="default">通常モード</option>
            <option value="expert">エキスパートモード</option>
          </select>
          {isAdmin && !LOCAL && (
            <button
              onClick={() => setShowAdminPanel(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-700 text-xs font-bold border border-amber-200 transition-colors"
              title="ユーザー管理"
            >
              <Users size={14} /> ユーザー管理
            </button>
          )}

          {!LOCAL && (
            <button
              onClick={() => signOut()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold border border-gray-200 transition-colors"
              title="ログアウト"
            >
              <LogOut size={14} /> ログアウト
            </button>
          )}
          {!isStaminaLoading && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${
              isAdmin
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : stamina <= 5
                  ? 'bg-red-50 border-red-300 text-red-600 animate-pulse'
                  : stamina <= 10
                    ? 'bg-yellow-50 border-yellow-300 text-yellow-700'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}>
              <Zap size={14} />
              {isAdmin
                ? (mode === 'easy' ? 'むげん' : '無制限')
                : mode === 'easy'
                  ? `のこり: ${stamina}かい`
                  : `${stamina} / ${maxStamina}`
              }
            </div>
          )}
        </div>
      </header>

      <main className={`p-4 mx-auto pb-20 ${step >= 3 ? 'max-w-7xl' : 'max-w-6xl'}`}>
        <nav className="mb-5 flex items-center justify-center gap-1 sm:gap-2 overflow-x-auto" aria-label="ステップ">
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            const reachable = n <= 2 ? n === 1 || !!capturedLineArt || !!baseImage : !!baseImage && (n !== 5 || store.variations.length > 0);
            const active = step === n;
            return (
              <div key={label} className="flex items-center gap-1 sm:gap-2 shrink-0">
                {i > 0 && <span className={`w-4 sm:w-8 h-0.5 rounded ${step >= n ? 'bg-green-400' : 'bg-slate-200'}`} />}
                <button
                  onClick={() => reachable && !isGeneratingBase && setStep(n)}
                  disabled={!reachable || isGeneratingBase}
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                    active ? 'bg-green-500 text-white shadow' : step > n ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-white text-slate-500 border border-slate-200'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${active ? 'bg-white/25' : step > n ? 'bg-green-500 text-white' : 'bg-slate-100'}`}>
                    {step > n ? <Check size={12} strokeWidth={3} /> : n}
                  </span>
                  <span className="hidden sm:inline">{label}</span>
                </button>
              </div>
            );
          })}
        </nav>
        {staminaError && (
          <div className="mb-4 p-3 bg-orange-100 border border-orange-300 text-orange-700 rounded-lg text-sm flex justify-between items-center">
            <span>⚡ {staminaError}</span>
            <button onClick={() => setStaminaError(null)} className="text-orange-500 hover:text-orange-700 font-bold ml-2">×</button>
          </div>
        )}
        {apiErrorMessage && (
          <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-lg text-sm flex justify-between items-center">
            <span>⚠️ {apiErrorMessage}</span>
            <button onClick={() => setApiErrorMessage(null)} className="text-red-500 hover:text-red-700 font-bold ml-2">×</button>
          </div>
        )}
        {step === 1 && (
          <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300 w-full max-w-7xl mx-auto">
            <div className="w-full text-center mb-1 relative">
              {onShowGuide && (
                <button
                  onClick={onShowGuide}
                  className={`mb-2 md:mb-0 md:absolute md:left-0 md:top-1/2 md:-translate-y-1/2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:text-green-700 hover:border-green-300 hover:bg-green-50 active:scale-[0.98] font-bold shadow-sm transition-all ${mode === 'easy' ? 'text-sm' : 'text-xs'}`}
                  title="つくり方の説明ページへ戻る"
                >
                  <BookOpen size={mode === 'easy' ? 16 : 14} /> {mode === 'easy' ? 'せつめいへもどる' : '説明へ戻る'}
                </button>
              )}
              <h2 className={`font-bold text-gray-800 ${mode === 'easy' ? 'text-2xl text-green-700' : 'text-xl'}`}>
                {mode === 'easy' ? 'えをかいてね' : '線画描画・取り込み'}
              </h2>
              <p className={`text-gray-500 mt-1 ${mode === 'easy' ? 'text-sm font-semibold' : 'text-xs'}`}>
                {mode === 'easy' ? 'キャンバスにえをかくか、カメラや画像でよみこんでね' : 'キャンバスに手描きイラストを描くか、カメラ撮影・画像ファイル選択から取り込みます。'}
              </p>
            </div>

            <div className="flex flex-col md:flex-row gap-6 items-start justify-center w-full">
              {/* サイド操作パネル (ツール類・操作ボタン) */}
              <div className="w-full md:w-84 bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex flex-col gap-4 shrink-0">
                <div className="flex flex-col gap-2">
                  <span className={`font-bold text-gray-600 ${mode === 'easy' ? 'text-sm' : 'text-xs'}`}>
                    {mode === 'easy' ? 'ツールをえらぶ' : '描画ツール'}
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setTool('pen')}
                      className={`p-3 rounded-xl flex flex-col items-center gap-1 font-bold transition-all ${tool === 'pen' ? 'bg-green-500 text-white shadow-md' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
                      title="ペン"
                    >
                      <Pen size={22} />
                      <span className="text-xs">{mode === 'easy' ? 'ペン' : 'ペン'}</span>
                    </button>
                    <button
                      onClick={() => setTool('eraser')}
                      className={`p-3 rounded-xl flex flex-col items-center gap-1 font-bold transition-all ${tool === 'eraser' ? 'bg-green-500 text-white shadow-md' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
                      title="消しゴム"
                    >
                      <Eraser size={22} />
                      <span className="text-xs">{mode === 'easy' ? 'けしごむ' : '消しゴム'}</span>
                    </button>
                    <button
                      onClick={() => setTool('hand')}
                      className={`p-3 rounded-xl flex flex-col items-center gap-1 font-bold transition-all ${tool === 'hand' ? 'bg-green-500 text-white shadow-md' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
                      title="キャンバス移動"
                    >
                      <Hand size={22} />
                      <span className="text-xs">{mode === 'easy' ? 'いどう' : '位置移動'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className={`font-bold text-gray-600 ${mode === 'easy' ? 'text-sm' : 'text-xs'}`}>
                      {mode === 'easy' ? 'ふとさ' : '線の太さ'}
                    </span>
                    <span className="text-xs font-bold text-green-600">{brushSize}px</span>
                  </div>
                  <div className="flex items-center gap-3 bg-gray-50 p-2.5 rounded-xl border border-gray-200">
                    <input
                      type="range"
                      min="1"
                      max="30"
                      value={brushSize}
                      onChange={e => setBrushSize(parseInt(e.target.value))}
                      className="w-full accent-green-500 cursor-pointer"
                    />
                    <div className="w-7 h-7 flex items-center justify-center shrink-0">
                      <div
                        className={`rounded-full transition-all ${tool === 'eraser' ? 'bg-white border-2 border-gray-400' : 'bg-black'}`}
                        style={{ width: `${Math.max(3, brushSize)}px`, height: `${Math.max(3, brushSize)}px` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 border-t pt-3">
                  <span className={`font-bold text-gray-600 ${mode === 'easy' ? 'text-sm' : 'text-xs'}`}>
                    {mode === 'easy' ? 'そうさ・よみこみ' : '操作・外部データ'}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={undo}
                      className="p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                      title="元に戻す"
                    >
                      <Undo size={16} /> {mode === 'easy' ? 'もどす' : '元に戻す'}
                    </button>
                    <button
                      type="button"
                      onClick={startCamera}
                      className="p-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                      title="Webカメラ起動"
                    >
                      <Camera size={16} /> {mode === 'easy' ? 'カメラ' : 'カメラ撮影'}
                    </button>
                  </div>
                  <label className="p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-gray-200">
                    <ImageIcon size={16} /> {mode === 'easy' ? 'がぞうをえらぶ' : '画像ファイル選択'}
                    <input type="file" accept="image/*" className="hidden" onChange={handleCameraUpload} />
                  </label>

                  {lastRawImage && history.length > 0 && (
                    <button
                      onClick={() => openExtractModal(lastRawImage)}
                      className="p-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors border border-amber-200"
                      title="取り込み画像から線画を抽出し直す"
                    >
                      <RotateCcw size={16} /> {mode === 'easy' ? 'もういちど とりだす' : '線画を再抽出'}
                    </button>
                  )}

                  {isDebugMode && (
                    <button
                      onClick={loadDebugLineArt}
                      className="p-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow"
                    >
                      🐛 サンプル線画セット
                    </button>
                  )}
                </div>

                <button
                  onClick={goToStep2}
                  className={`mt-2 py-3.5 px-6 rounded-xl font-bold text-white shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2 ${mode === 'easy' ? 'bg-orange-500 text-xl' : 'bg-green-500 hover:bg-green-600 text-base'}`}
                >
                  {baseImage ? (mode === 'easy' ? 'つぎへ' : '次へ (一括生成)') : (mode === 'easy' ? 'つぎへ' : '次のステップへ')} <ArrowRight size={20} />
                </button>
              </div>

              {/* 右側: さらに拡大した全画面キャンバス描画エリア (max-w-[820px]) */}
              <div
                className="flex-1 w-full max-w-[820px] aspect-square border-4 border-gray-300 rounded-3xl overflow-hidden shadow-2xl bg-white relative touch-none select-none"
                onContextMenu={(e) => e.preventDefault()}
                style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
              >
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={600}
                  onMouseDown={startDrawing}
                  onMouseUp={stopDrawing}
                  onMouseMove={draw}
                  onMouseOut={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchEnd={stopDrawing}
                  onTouchMove={draw}
                  onContextMenu={(e) => e.preventDefault()}
                  className={`w-full h-full block ${tool === 'hand'
                    ? (isDrawing ? 'cursor-grabbing' : 'cursor-grab')
                    : 'cursor-crosshair'
                    }`}
                  style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
                />
                {showImportHint && (
                  <div className="absolute top-3 inset-x-3 flex justify-center pointer-events-none animate-in fade-in slide-in-from-top-2 duration-300">
                    <span className={`bg-gray-900/85 text-white font-bold rounded-full shadow-lg flex items-center gap-2 ${mode === 'easy' ? 'text-sm px-4 py-2' : 'text-xs px-3.5 py-1.5'}`}>
                      <Check size={14} className="text-green-400" />
                      {mode === 'easy' ? 'せんを のせたよ。ペンや けしごむで なおしてね' : '線画を配置しました。ペン・消しゴムで細かく修正できます'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col items-center gap-4 animate-in slide-in-from-right duration-300">
            <h2 className="text-lg font-semibold">{mode === 'easy' ? 'どんなえにする？' : '基本イラストの画風と指示を設定'}</h2>

            {isGeneratingBase ? (
              <div className="flex flex-col items-center justify-center py-20 animate-pulse">
                <Shuffle size={64} className="text-green-500 animate-spin mb-4" />
                <div className="flex items-center gap-3">
                  <p className="font-bold text-lg text-gray-600">
                    {mode === 'easy' ? 'まほうをかけています…' : 'AIが基本イラストを生成中…'}
                  </p>
                  <button
                    onClick={cancelGeneration}
                    className="bg-red-500 hover:bg-red-600 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow transition-all active:scale-95 text-xs"
                    title="生成を中止"
                  >
                    <Square size={14} fill="currentColor" /> 中止
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">※生成に数秒〜数十秒かかります</p>
              </div>
            ) : (
              <div className="w-full max-w-6xl bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex flex-col md:flex-row gap-5">
                  {/* 左: 画風選択 (幅広) */}
                  <div className="md:w-[58%] shrink-0">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="font-bold text-gray-700 text-base sm:text-lg">画風スタイルを選択</h3>
                      {mode === 'easy' && (
                        <span className="text-xs font-semibold bg-orange-100 text-orange-600 px-3 py-1 rounded-full">
                          かんたんモード
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {availableStyles.map(s => {
                        const isSelected = selectedStyle === s.id;
                        return (
                          <div
                            key={s.id}
                            onClick={() => setSelectedStyle(s.id)}
                            className={`group cursor-pointer border-4 rounded-2xl overflow-hidden transition-all duration-200 bg-white relative ${isSelected ? 'border-green-500 shadow-xl scale-[1.03] ring-2 ring-green-400/50' : 'border-gray-200 opacity-80 hover:opacity-100 hover:border-gray-300 hover:shadow-md'}`}
                          >
                            {isSelected && (
                              <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1 shadow z-10">
                                <Check size={18} />
                              </div>
                            )}
                            <div className="aspect-[4/3] bg-gray-100 flex items-center justify-center overflow-hidden">
                              <img
                                src={s.src}
                                alt={s.label}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                onError={(e) => { e.currentTarget.src = PLACEHOLDER_IMG; }}
                              />
                            </div>
                            <div className={`text-center font-bold py-2 text-sm sm:text-base transition-colors ${isSelected ? 'bg-green-500 text-white' : 'bg-white text-gray-800'}`}>
                              {mode === 'easy' ? (s.easyLabel || s.label) : s.label}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 右: 調整項目 */}
                  <div className="md:w-[42%] flex flex-col gap-4">
                    {mode !== 'easy' && (
                      <div>
                        <h3 className="font-bold mb-2 text-gray-700 flex items-center gap-2">
                          線画の維持率
                          <span className="text-xs bg-green-100 text-green-700 font-bold px-2.5 py-0.5 rounded-full">
                            {lineRetention}%
                          </span>
                        </h3>

                        {mode === 'default' ? (
                          <div className="flex gap-4 items-center bg-gray-50 p-3 rounded-xl border border-gray-200">
                            {[40, 70, 90].map((val) => (
                              <label key={val} className="flex items-center gap-2 cursor-pointer font-medium text-sm text-gray-700 hover:text-green-600 transition-colors">
                                <input
                                  type="radio"
                                  name="lineRetention"
                                  value={val}
                                  checked={lineRetention === val}
                                  onChange={() => setLineRetention(val)}
                                  className="accent-green-500 w-4 h-4 cursor-pointer"
                                />
                                <span>{val}% {val === 70 && <span className="text-xs text-gray-400 font-normal">(デフォルト)</span>}</span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                            <div className="flex justify-between items-center mb-2 text-xs font-semibold text-gray-500">
                              <span>アレンジ (1%)</span>
                              <span className="text-green-600 font-bold text-base">{lineRetention}%</span>
                              <span>再現 (100%)</span>
                            </div>
                            <input
                              type="range"
                              min="1"
                              max="100"
                              value={lineRetention}
                              onChange={(e) => setLineRetention(Number(e.target.value))}
                              className="w-full accent-green-500 cursor-pointer"
                            />
                          </div>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                          ※小さいほどAIが自由に着色、大きいほど線画をそのまま残します。
                        </p>
                      </div>
                    )}

                    <div>
                      <h3 className="font-bold mb-1.5 text-gray-700 flex items-center gap-2">
                        {mode === 'easy' ? 'キャラのせつめい' : 'キャラクターの説明'}
                        <span className="text-xs bg-gray-100 text-gray-500 font-normal px-2 py-0.5 rounded">{mode === 'easy' ? '自由(じゆう)' : '任意入力'}</span>
                      </h3>
                      <input
                        type="text"
                        value={charDesc}
                        onChange={(e) => setCharDesc(e.target.value)}
                        placeholder={mode === 'easy' ? 'れい: くろいねこ、あかいぼうし' : '例: グレーの色の猫、赤いマントが右にチラみえしている。おなかは薄灰色'}
                        className="w-full border-2 border-gray-300 rounded-xl p-2.5 focus:border-green-500 outline-none text-sm"
                      />
                      <p className="text-xs text-gray-400 mt-1">{mode === 'easy' ? '※いろやとくちょうを書くとキレイになるよ' : '※色、服、特徴などを記述すると生成精度がアップします'}</p>
                    </div>

                    <div>
                      <h3 className="font-bold mb-1.5 text-gray-700 flex items-center gap-2">
                        {mode === 'easy' ? 'じゆうに書く（つけくわえる）' : '自由記述プロンプト（アレンジ指示）'}
                        <span className="text-xs bg-gray-100 text-gray-500 font-normal px-2 py-0.5 rounded">{mode === 'easy' ? '自由(じゆう)' : '任意入力'}</span>
                      </h3>
                      <textarea
                        value={baseFreeText}
                        onChange={(e) => setBaseFreeText(e.target.value)}
                        placeholder={mode === 'easy' ? 'れい: かわいいぼうしをかぶっている' : '例: かわいい帽子をかぶっている'}
                        className="w-full border-2 border-gray-300 rounded-xl p-2.5 focus:border-green-500 outline-none text-sm"
                        rows={2}
                      />
                    </div>

                    <div className="flex justify-between items-center gap-3 pt-1 mt-auto">
                      <button
                        onClick={() => setStep(1)}
                        className="px-4 py-2.5 rounded-full font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors text-sm"
                      >
                        {mode === 'easy' ? '← えをかきなおす' : '← 線画描きに戻る'}
                      </button>
                      <div className="flex gap-2">
                        {baseImage && (
                          <button
                            onClick={() => setStep(3)}
                            className="px-4 py-2.5 rounded-full font-bold text-gray-700 bg-gray-200 hover:bg-gray-300 transition-colors text-sm flex items-center gap-1.5"
                          >
                            {mode === 'easy' ? 'つぎへ' : '次のステップへ'} <ArrowRight size={16} />
                          </button>
                        )}
                        <button
                          onClick={generateBaseImage}
                          className={`px-6 py-2.5 rounded-full font-bold text-white shadow-lg transition-transform active:scale-95 flex items-center gap-2 ${mode === 'easy' ? 'bg-orange-500 text-xl' : 'bg-green-500 hover:bg-green-600'}`}
                        >
                          {mode === 'easy' ? 'つくる！' : '基本イラストを生成'} <ImageIcon size={20} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {step >= 3 && !studioProps && (
          <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-10 text-center flex flex-col items-center gap-4">
            <p className="text-slate-500 text-sm">先に基本イラストを作成してください。</p>
            <button onClick={() => setStep(2)} className="px-5 py-2.5 rounded-full font-bold text-white bg-green-500 hover:bg-green-600 text-sm">基本イラストへ</button>
          </div>
        )}

        {step === 3 && studioProps && (
          <AssetGenerationStep
            {...studioProps}
            selectedAssets={selectedAssets}
            onSelectedAssetsChange={setSelectedAssets}
            freeText={variationFreeText}
            onFreeTextChange={setVariationFreeText}
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
          />
        )}

        {step === 4 && studioProps && (
          <AdjustmentStep {...studioProps} onBack={() => setStep(3)} onNext={() => setStep(5)} />
        )}

        {step === 5 && studioProps && (
          <DownloadStep
            projectName={currentProject?.name || 'オリキャラ'}
            variations={store.variations}
            lineArt={capturedLineArt}
            baseImage={studioProps.baseImage}
            isCloudSaved={!LOCAL}
            onBack={() => setStep(4)}
          />
        )}
      </main>

      {/* Base Image Confirmation Modal */}
      {showBaseConfirm && baseImage && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4 animate-in fade-in zoom-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl flex flex-col items-center gap-6 border text-center">
            <h3 className="text-xl font-bold text-gray-800">
              {mode === 'easy' ? 'このえで いろんなポーズをつくる？' : 'この画像をもとに、キャラクターのバリエーションを作成しますか？'}
            </h3>

            {/* 背景グレーの格子模様で大きく拡大表示 */}
            <div className={`w-full aspect-square max-w-[360px] rounded-2xl overflow-hidden border-2 border-gray-300 shadow-inner ${CHECKER_BG} flex items-center justify-center p-2`}>
              <img src={baseImage} alt="Base Illustration Preview" className="w-full h-full object-contain drop-shadow-md" />
            </div>

            <p className="text-xs text-gray-500">
              ※この基本イラストの顔・服装・画風を見本にして、向き・ポーズ・表情のバリエーションを生成します。
            </p>

            <div className="flex gap-4 w-full justify-center pt-2">
              <button
                onClick={() => {
                  setShowBaseConfirm(false);
                  setStep(2); // 画風選択へ戻る
                }}
                className="flex-1 py-3 px-6 rounded-full font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-300 transition-all active:scale-95 text-sm sm:text-base"
              >
                {mode === 'easy' ? 'かんがえなおす' : '考え直す'}
              </button>
              <button
                onClick={() => {
                  setShowBaseConfirm(false);
                  setStep(3); // バリエーション生成へ進む
                }}
                className="flex-1 py-3 px-6 rounded-full font-bold text-white bg-green-500 hover:bg-green-600 shadow-lg transition-all active:scale-95 text-sm sm:text-base flex items-center justify-center gap-2"
              >
                {mode === 'easy' ? 'はい' : 'はい'} <ArrowRight size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Webカメラ撮影モーダル (PC/スマホ共通) */}
      {isCameraModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl flex flex-col items-center relative border border-gray-100">
            <button
              onClick={stopCamera}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
              title="閉じ閉じる"
            >
              <X size={24} />
            </button>

            <h3 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
              <Camera size={20} className="text-blue-500" /> Webカメラで手書きイラストを撮影
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              枠内に用紙をおさめて「シャッター」を押してください
            </p>

            {cameraError ? (
              <div className="w-full p-6 bg-red-50 text-red-600 text-sm font-semibold rounded-2xl border border-red-200 text-center mb-4">
                ⚠️ {cameraError}
              </div>
            ) : (
              <div className="w-full aspect-[4/3] bg-black rounded-2xl overflow-hidden relative shadow-inner mb-5 flex items-center justify-center border-2 border-gray-800">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* 撮影用ターゲットガイド枠 */}
                <div className="absolute inset-4 border-2 border-dashed border-white/60 rounded-xl pointer-events-none flex items-center justify-center">
                  <span className="text-xs text-white/80 bg-black/40 px-2 py-1 rounded">イラストを枠内におさめてください</span>
                </div>
              </div>
            )}

            <div className="flex gap-3 w-full">
              <button
                onClick={stopCamera}
                className="flex-1 py-3 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors text-sm"
              >
                キャンセル
              </button>
              {!cameraError && (
                <button
                  onClick={captureWebcam}
                  className="flex-2 py-3 px-6 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition-transform active:scale-95 text-sm flex items-center justify-center gap-2"
                >
                  <Camera size={18} /> 📸 シャッターを押す
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {extractSource && (
        <LineArtExtractModal
          source={extractSource}
          mode={mode}
          runner={runner}
          stamina={staminaInfo}
          onCancel={() => setExtractSource(null)}
          onConfirm={applyLineArtToCanvas}
        />
      )}

      {/* プロジェクト管理モーダル */}
      {showProjectPicker && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4 max-h-[80vh] border border-gray-100">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                <FolderOpen size={20} className="text-green-600" /> プロジェクト一覧
              </h3>
              <button
                onClick={() => setShowProjectPicker(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="新しいプロジェクト名..."
                className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm outline-none focus:border-green-500"
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateProject(); }}
              />
              <button
                onClick={handleCreateProject}
                className="px-4 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white font-bold text-sm flex items-center gap-1 transition-colors shadow-sm"
              >
                <Plus size={16} /> 新規
              </button>
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col gap-2 min-h-[120px]">
              {projectList.length === 0 ? (
                <div className="text-center text-gray-400 py-8 text-sm">
                  プロジェクトがありません
                </div>
              ) : (
                projectList.map(proj => (
                  <div
                    key={proj.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer group ${
                      currentProjectId === proj.id
                        ? 'border-green-500 bg-green-50 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                    onClick={() => handleSwitchProject(proj.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-gray-800 truncate flex items-center gap-2">
                        {proj.name || '無名プロジェクト'}
                        {currentProjectId === proj.id && (
                          <span className="text-[10px] bg-green-500 text-white px-1.5 py-0.5 rounded-full font-semibold shrink-0">
                            使用中
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        ステップ {proj.step} ・ {new Date(proj.updated_at).toLocaleString('ja-JP')}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteProject(proj.id); }}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                      title="削除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showAdminPanel && <AdminUserModal onClose={() => setShowAdminPanel(false)} />}
    </div>
  );
}
