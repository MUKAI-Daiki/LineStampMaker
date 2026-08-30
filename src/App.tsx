import { useState, useRef, useEffect } from 'react';
import { Camera, Pen, Eraser, Undo, ArrowRight, Image as ImageIcon, Download, Printer, Check, Shuffle, Trash2, X, Square, Hand, FolderOpen, Plus, LogOut, Crop, RotateCcw } from 'lucide-react';
import { promptKeywords, type Mode, type PromptKeyword } from './promptKeywords';
import { generatePdfBlobUrl, generatePdfBytes } from './utils/pdfGenerator';
import { prepareStampZipAndGenerateQr } from './utils/zipService';
import { callGeminiImageApi, callGeminiImageApiWithRetry, NEGATIVE_PROMPT } from './utils/geminiApi';
import { processMainImage, processTabImage } from './utils/stampProcessing';
import { CHECKER_BG, PLACEHOLDER_IMG } from './utils/constants';
import { listProjects, createProject, updateProject, deleteProject, loadProject, saveProjectImages, type ProjectRow } from './utils/projectDb';
import { signOut } from './utils/useAuth';
import { useStamina } from './utils/useStamina';
import { Zap } from 'lucide-react';

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
}

export default function App({ userId, isAdmin }: AppProps) {
  const [step, setStep] = useState<number>(1);
  const [mode, setMode] = useState<Mode>('default');

  // デバッグ用設定 (デフォルトOFF)
  const [isDebugMode, setIsDebugMode] = useState<boolean>(false);
  const [selectedModel, setSelectedModel] = useState<'gemini-3.1-flash-image' | 'gemini-3.1-flash-lite-image'>('gemini-3.1-flash-image');

  // スタミナ管理
  const { stamina, maxStamina, isLoading: isStaminaLoading, consumeStamina, canAfford, getStaminaCost } = useStamina(userId, isAdmin);
  const [staminaError, setStaminaError] = useState<string | null>(null);

  const [isRestored, setIsRestored] = useState<boolean>(false);

  // プロジェクト管理
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectList, setProjectList] = useState<ProjectRow[]>([]);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  const [newProjectName, setNewProjectName] = useState('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // キャンバス・画像各種ステート宣言 (最上部に集約)
  const [capturedLineArt, setCapturedLineArt] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<string>('copic');
  const [lineRetention, setLineRetention] = useState<number>(70);
  const [charDesc, setCharDesc] = useState<string>('');
  const [baseFreeText, setBaseFreeText] = useState<string>('');
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [showBaseConfirm, setShowBaseConfirm] = useState(false);

  const [selectedPrompts, setSelectedPrompts] = useState<PromptKeyword[]>([]);
  const [isBulkMode, setIsBulkMode] = useState<boolean>(false);
  const [isGeneratingBulk, setIsGeneratingBulk] = useState<boolean>(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; currentLabel: string } | null>(null);
  const [customCharText, setCustomCharText] = useState<string>('');
  const [stampFreeText, setStampFreeText] = useState<string>('');
  const [currentStampResult, setCurrentStampResult] = useState<string | null>(null);
  const [savedStamps, setSavedStamps] = useState<string[]>([]);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);
  const [isGeneratingBase, setIsGeneratingBase] = useState(false);
  const [isGeneratingStamp, setIsGeneratingStamp] = useState(false);
  const [enlargedStamp, setEnlargedStamp] = useState<string | null>(null);
  const [previewBg, setPreviewBg] = useState<'checker' | 'line' | 'dark' | 'white'>('line');
  const [apiErrorMessage, setApiErrorMessage] = useState<string | null>(null);

  const [mainImage, setMainImage] = useState<string | null>(null);
  const [tabImage, setTabImage] = useState<string | null>(null);
  const [selectedMainSource, setSelectedMainSource] = useState<string | null>(null);
  const [mainPromptText, setMainPromptText] = useState<string>('');
  const [tabPromptText, setTabPromptText] = useState<string>('');
  const [isGeneratingMain, setIsGeneratingMain] = useState<boolean>(false);
  const [isGeneratingTab, setIsGeneratingTab] = useState<boolean>(false);

  // PDF ビューア用ステート
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 生成キャンセル制御
  const abortControllerRef = useRef<AbortController | null>(null);
  const isCancelledRef = useRef<boolean>(false);

  const cancelGeneration = () => {
    isCancelledRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGeneratingBase(false);
    setIsGeneratingStamp(false);
    setIsGeneratingBulk(false);
    setBulkProgress(null);
    setApiErrorMessage("画像の生成を中止しました。");
  };

  // ドラッグ＆ドロップおよびタッチ操作による画像並び替え用ステート＆ハンドラー
  const dragItemIndex = useRef<number | null>(null);
  const touchDragIndex = useRef<number | null>(null);

  const moveStamp = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= savedStamps.length) return;
    setSavedStamps(prev => {
      const copy = [...prev];
      const [moved] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, moved);
      if (copy.length > 0) {
        setSelectedMainSource(copy[0]);
      }
      return copy;
    });
  };

  const requestDeleteSavedStamp = (index: number) => {
    setDeleteConfirmIndex(index);
  };

  const confirmDeleteSavedStamp = () => {
    if (deleteConfirmIndex === null) return;
    const targetIdx = deleteConfirmIndex;
    setSavedStamps(prev => {
      const copy = [...prev];
      copy.splice(targetIdx, 1);
      if (copy.length > 0 && targetIdx === 0) {
        setSelectedMainSource(copy[0]);
      }
      return copy;
    });
    setDeleteConfirmIndex(null);
  };

  const handleDragStart = (index: number) => {
    dragItemIndex.current = index;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetIndex: number) => {
    if (dragItemIndex.current !== null && dragItemIndex.current !== targetIndex) {
      setSavedStamps(prev => {
        const copy = [...prev];
        const [moved] = copy.splice(dragItemIndex.current!, 1);
        copy.splice(targetIndex, 0, moved);
        if (copy.length > 0) {
          setSelectedMainSource(copy[0]);
        }
        return copy;
      });
    }
    dragItemIndex.current = null;
  };

  const handleTouchStartStamp = (index: number) => {
    touchDragIndex.current = index;
  };

  const handleTouchMoveStamp = (e: React.TouchEvent) => {
    if (touchDragIndex.current === null) return;
    if (e.cancelable) e.preventDefault();
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const stampElem = target?.closest('[data-stamp-index]');
    if (stampElem) {
      const targetIndex = Number(stampElem.getAttribute('data-stamp-index'));
      if (!isNaN(targetIndex) && targetIndex !== touchDragIndex.current) {
        const fromIdx = touchDragIndex.current;
        setSavedStamps(prev => {
          const copy = [...prev];
          const [moved] = copy.splice(fromIdx, 1);
          copy.splice(targetIndex, 0, moved);
          if (copy.length > 0) {
            setSelectedMainSource(copy[0]);
          }
          return copy;
        });
        touchDragIndex.current = targetIndex;
      }
    }
  };

  const handleTouchEndStamp = () => {
    touchDragIndex.current = null;
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

  // 画像調整モーダル関連State
  const [adjustRawImage, setAdjustRawImage] = useState<string | null>(null);
  const [adjustContrast, setAdjustContrast] = useState<number>(150);
  const [adjustBrightness, setAdjustBrightness] = useState<number>(120);
  const [lastRawImage, setLastRawImage] = useState<string | null>(null);

  // トリミング関連State
  const [cropBox, setCropBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [cropDragStart, setCropDragStart] = useState<{ x: number; y: number } | null>(null);
  const adjustContainerRef = useRef<HTMLDivElement>(null);
  const adjustImgRef = useRef<HTMLImageElement>(null);

  // 共通のドキュメントスキャナ処理 (コントラスト・明度のCSSフィルタ適用後 → 適応的白黒化)
  const processImageToCanvas = (img: HTMLImageElement, contrast: number = 150, brightness: number = 120) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // CSSフィルタで明度・コントラストを適用して描画
    ctx.save();
    ctx.filter = `contrast(${contrast}%) brightness(${brightness}%)`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const drawX = (canvas.width - drawW) / 2;
    const drawY = (canvas.height - drawH) / 2;

    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();

    // 適応的白黒化 (線画抽出)
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    let minLum = 255;
    let maxLum = 0;
    const luminances = new Float32Array(canvas.width * canvas.height);

    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const pxIdx = i / 4;
      luminances[pxIdx] = lum;
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
    }

    const lumRange = Math.max(1, maxLum - minLum);

    for (let i = 0; i < data.length; i += 4) {
      const pxIdx = i / 4;
      const normLum = (luminances[pxIdx] - minLum) / lumRange;

      const threshold = 0.68;
      let val = 255;
      if (normLum < threshold) {
        val = Math.max(0, Math.round((normLum / threshold) * 200 - 50));
      } else {
        val = 255;
      }

      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
      data[i + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);
    setHistory(prev => [...prev, canvas.toDataURL()]);
  };

  const openAdjustModal = (dataUrl: string) => {
    setAdjustContrast(150);
    setAdjustBrightness(120);
    setCropBox(null);
    setIsDraggingCrop(false);
    setCropDragStart(null);
    setLastRawImage(dataUrl);
    setAdjustRawImage(dataUrl);
  };

  const confirmAdjust = () => {
    if (!adjustRawImage) return;
    const img = new Image();
    img.onload = () => {
      if (cropBox) {
        const sx = Math.round(Math.min(cropBox.x1, cropBox.x2) * img.naturalWidth);
        const sy = Math.round(Math.min(cropBox.y1, cropBox.y2) * img.naturalHeight);
        const sw = Math.round(Math.abs(cropBox.x2 - cropBox.x1) * img.naturalWidth);
        const sh = Math.round(Math.abs(cropBox.y2 - cropBox.y1) * img.naturalHeight);
        if (sw > 10 && sh > 10) {
          const cropCanvas = document.createElement('canvas');
          cropCanvas.width = sw;
          cropCanvas.height = sh;
          const cropCtx = cropCanvas.getContext('2d');
          if (cropCtx) {
            cropCtx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
            const croppedImg = new Image();
            croppedImg.onload = () => {
              processImageToCanvas(croppedImg, adjustContrast, adjustBrightness);
              setAdjustRawImage(null);
              setCropBox(null);
            };
            croppedImg.src = cropCanvas.toDataURL('image/png');
            return;
          }
        }
      }
      processImageToCanvas(img, adjustContrast, adjustBrightness);
      setAdjustRawImage(null);
      setCropBox(null);
    };
    img.src = adjustRawImage;
  };

  const cancelAdjust = () => {
    setAdjustRawImage(null);
    setCropBox(null);
  };

  const getImageBoundsInContainer = (container: HTMLElement, natW: number, natH: number) => {
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const scale = Math.min(cw / natW, ch / natH);
    const w = natW * scale;
    const h = natH * scale;
    return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
  };

  const screenToImageCoords = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const container = adjustContainerRef.current;
    const imgEl = adjustImgRef.current;
    if (!container || !imgEl) return null;
    const rect = container.getBoundingClientRect();
    const bounds = getImageBoundsInContainer(container, imgEl.naturalWidth, imgEl.naturalHeight);
    const rx = clientX - rect.left - bounds.x;
    const ry = clientY - rect.top - bounds.y;
    return { x: Math.max(0, Math.min(1, rx / bounds.w)), y: Math.max(0, Math.min(1, ry / bounds.h)) };
  };

  const handleCropPointerDown = (e: React.PointerEvent) => {
    const coords = screenToImageCoords(e.clientX, e.clientY);
    if (!coords) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDraggingCrop(true);
    setCropDragStart(coords);
    setCropBox({ x1: coords.x, y1: coords.y, x2: coords.x, y2: coords.y });
  };

  const handleCropPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingCrop || !cropDragStart) return;
    const coords = screenToImageCoords(e.clientX, e.clientY);
    if (!coords) return;
    setCropBox({ x1: cropDragStart.x, y1: cropDragStart.y, x2: coords.x, y2: coords.y });
  };

  const handleCropPointerUp = () => {
    setIsDraggingCrop(false);
    setCropDragStart(null);
    if (cropBox) {
      const w = Math.abs(cropBox.x2 - cropBox.x1);
      const h = Math.abs(cropBox.y2 - cropBox.y1);
      if (w < 0.03 || h < 0.03) setCropBox(null);
    }
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
        openAdjustModal(dataUrl);
      }
    }
  };

  const handleCameraUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (dataUrl) openAdjustModal(dataUrl);
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
    if (!canAfford(baseModel)) {
      setStaminaError(`スタミナが足りません（必要: ${getStaminaCost(baseModel)}、残り: ${stamina}）。時間をおくと回復します（1時間に1回復）`);
      return;
    }
    const consumed = await consumeStamina(baseModel);
    if (!consumed) {
      setStaminaError('スタミナの消費に失敗しました。');
      return;
    }
    isCancelledRef.current = false;
    setIsGeneratingBase(true);
    setApiErrorMessage(null);
    const styleObj = STYLES.find(s => s.id === selectedStyle) || STYLES[0];
    const retentionInstruction = getLineRetentionInstruction(lineRetention);

    const charDescriptionText = charDesc.trim()
      ? charDesc
      : '添付線画画像の中央に描かれているオリジナルの動物・架空のキャラクター（人間や一般的な人間キャラクターではなく、添付スケッチの被写体の形そのもの）';

    let prompt = "";
    if (selectedStyle === 'original') {
      prompt = `【重要指示】添付された1枚目の画像は「加工元の手描き線画イラスト」です。添付画像のポーズ・輪郭・シルエット・頭身を厳密なベースガイドラインとしてそのまま直接追従し、LINEスタンプ用画像を生成してください。

## 描画条件
${retentionInstruction}
- 添付線画と無関係な要素の勝手な生成厳禁
- 画像サイズ: 横370px × 縦320px (外枠と描画コンテンツの間に上下左右10pxの余白をあけること)
- 着色はせず、元の線画を活かしながら途切れている線を補正・清書
- 背景は完全に単一のどぎつい鮮やかな濃い紫色・クロマキーマゼンタ（#FF00FF）。背景への影・グラデーション・模様・額縁・フレーム・枠線は一切描画せず、100%均一な鮮やかで濃いマゼンタ紫色（#FF00FF）のみで描画すること
- 【絶対完全厳禁】絵画の額縁、飾り枠、四方の外枠・枠線・ボーダー、黒枠、ボックス線の描画は完全に厳禁（画像の外周・四方には枠線やフレームを絶対に描かないこと）
- 【重要】背景のどぎついマゼンタ紫色（#FF00FF）はクロマキー透過用の領域です。キャラクター本体の内側（服・目・白髪・肌・文字・水彩の淡い塗りなど）はどんな色（白や薄い色も含む）で自由に着色してください

## キャラクターの説明
- ${charDescriptionText}
${baseFreeText ? `\n## 追加指示\n- ${baseFreeText}` : ''}`;
    } else {
      prompt = `【重要指示】添付された1枚目の画像は「加工元の手描き線画イラスト」です。添付画像のポーズ・輪郭・シルエット・頭身を厳密なベースガイドラインとしてそのまま直接追従し、LINEスタンプ用画像を生成してください。

## 描画条件
${retentionInstruction}
- 選択した画風・タッチに基づいて、線の質感やタッチ（線の境界消し・太さの強弱・滲み・グラデーション表現等）を自由にアレンジ・最適化して描画することを許可する
- 添付線画と無関係な人間の男性・女性・人物キャラクターを勝手に描画・自動追加することは絶対に厳禁
- 画像サイズ: 横370px × 縦320px (外枠と描画コンテンツの間に上下左右10pxの余白をあけること)
- キャラクターの全身に部分的な塗り残しがないように着色
- 背景は完全に単一のどぎつい鮮やかな濃い紫色・クロマキーマゼンタ（#FF00FF）。背景への影・グラデーション・模様・額縁・フレーム・枠線は一切描画せず、100%均一な鮮やかで濃いマゼンタ紫色（#FF00FF）のみで描画すること
- 【絶対完全厳禁】絵画の額縁、飾り枠、四方の外枠・枠線・ボーダー、黒枠、ボックス線の描画は完全に厳禁（画像の外周・四方には枠線やフレームを絶対に描かないこと）
- 【重要】背景のどぎついマゼンタ紫色（#FF00FF）はクロマキー透過用の領域です。キャラクター本体の内側（服・目・白髪・肌・文字・水彩の淡い塗りなど）はどんな色（白や薄い色も含む）で自由に着色してください

## 画風・タッチ
- ${styleObj.prompt}

## キャラクターの説明
- ${charDescriptionText}
${baseFreeText ? `\n## 追加指示\n- ${baseFreeText}` : ''}`;
    }
    console.log("【生成プロンプト (gemini-3.1-flash-image / 固定seed: 42)】:\n", prompt + NEGATIVE_PROMPT);

    const inputCanvasData = capturedLineArt
      || (canvasRef.current ? canvasRef.current.toDataURL('image/png') : null)
      || (history.length > 0 ? history[history.length - 1] : PLACEHOLDER_IMG);

    const resultImg = await callGeminiImageApi(selectedModel, prompt, inputCanvasData, abortControllerRef, isCancelledRef, (msg) => setApiErrorMessage(msg), true);
    setBaseImage(resultImg);
    setIsGeneratingBase(false);
    setShowBaseConfirm(true);
  };

  // Step 3: Stamps
  const categories = Array.from(new Set(promptKeywords.map(k => k.category)));
  const [selectedCategory, setSelectedCategory] = useState<string>(categories[0] || '文字');

  const togglePrompt = (p: PromptKeyword) => {
    const isAlreadySelected = selectedPrompts.some(x => x.id === p.id);
    let newSelected: PromptKeyword[];

    if (isBulkMode) {
      if (isAlreadySelected) {
        newSelected = selectedPrompts.filter(x => x.id !== p.id);
      } else {
        if (selectedPrompts.length >= 8) {
          alert("一括作成モードで選択できるプロンプトは最大8個までです。");
          return;
        }
        newSelected = [...selectedPrompts, p];
      }
    } else {
      if (isAlreadySelected) {
        newSelected = selectedPrompts.filter(x => x.id !== p.id);
      } else {
        // 各グループ（カテゴリ）につき1つまで制限: 同一カテゴリの選択を入れ替え
        newSelected = [
          ...selectedPrompts.filter(x => x.category !== p.category),
          p
        ];
      }
    }
    setSelectedPrompts(newSelected);

    if (mode === 'expert') {
      setStampFreeText(newSelected.map(x => x.prompt).join(', '));
    }
  };

  const generateStamp = async () => {
    setStaminaError(null);
    const stampModel = selectedModel;
    if (!canAfford(stampModel)) {
      setStaminaError(`スタミナが足りません（必要: ${getStaminaCost(stampModel)}、残り: ${stamina}）。時間をおくと回復します（1時間に1回復）`);
      return;
    }
    const consumed = await consumeStamina(stampModel);
    if (!consumed) {
      setStaminaError('スタミナの消費に失敗しました。');
      return;
    }
    isCancelledRef.current = false;
    setIsGeneratingStamp(true);
    setApiErrorMessage(null);
    const styleObj = STYLES.find(s => s.id === selectedStyle) || STYLES[0];
    const selectedPromptTexts = selectedPrompts.map(p => {
      if (p.id === '11') {
        const text = customCharText.trim() || '文字';
        return `「${text}」の文字`;
      }
      return p.prompt;
    }).join(', ');

    let promptToUse = "";
    if (mode === 'expert') {
      promptToUse = stampFreeText;
    } else {
      promptToUse = `添付基本イラストをもとに、LINEスタンプ用画像を生成。

## 描画条件
- 画像サイズ: 横370px × 縦320px (LINEスタンプ公式規約に従い、外枠とイラストコンテンツの間に上下左右10pxの余白を空ける)
- 添付基本イラストのキャラクターデザイン・色彩・塗り・質感を100%そのまま継承し、カラフルに着色すること
- 背景は完全に単一のどぎつい鮮やかな濃い紫色・クロマキーマゼンタ（#FF00FF）。背景への影・グラデーション・模様・額縁・フレーム・枠線は一切描画しないこと
- 【絶対完全厳禁】絵画の額縁、飾り枠、四方の外枠・枠線・ボーダー、黒枠、ボックス線の描画は完全に厳禁（画像の外周・四方には枠線やフレームを絶対に描かないこと）
- 【重要】背景のどぎついマゼンタ紫色（#FF00FF）はクロマキー透過用の領域です。キャラクター本体の内側（服・目・白髪・肌・文字・水彩の淡い塗りなど）はどんな色（白や薄い色も含む）で自由に着色してください

## 画風・タッチ
- ${styleObj.prompt}
${charDesc ? `\n## キャラクターの説明\n- ${charDesc}` : ''}
${selectedPromptTexts ? `\n## スタンプのポーズ・感情・文字指示\n- ${selectedPromptTexts}` : ''}
${stampFreeText ? `\n## 追加指示\n- ${stampFreeText}` : ''}`;
    }

    console.log(`【スタンプ生成プロンプト (${selectedModel} / 固定seed: 42)】:\n`, promptToUse + NEGATIVE_PROMPT);

    const inputCanvasData = baseImage || (canvasRef.current ? canvasRef.current.toDataURL('image/png') : PLACEHOLDER_IMG);
    const resultImg = await callGeminiImageApiWithRetry(selectedModel, promptToUse, inputCanvasData, abortControllerRef, isCancelledRef, (msg) => setApiErrorMessage(msg));

    if (resultImg && resultImg !== PLACEHOLDER_IMG) {
      setCurrentStampResult(resultImg);
      // 明示的に削除しない限り破棄せず、生成バリエーションを全保持
      setSavedStamps(prev => [...prev, resultImg]);
    }
    setIsGeneratingStamp(false);
  };

  const autoGenerateStep4Images = async (sourceImg: string) => {
    if (!sourceImg || isGeneratingMain || isGeneratingTab) return;
    setStaminaError(null);
    const modelToUse = (!isDebugMode) ? 'gemini-3.1-flash-lite-image' : selectedModel;
    const totalCost = getStaminaCost(modelToUse) * 2;
    if (!isAdmin && stamina < totalCost) {
      setStaminaError(`スタミナが足りません（必要: ${totalCost}、残り: ${stamina}）。時間をおくと回復します（1時間に1回復）`);
      return;
    }
    const consumed1 = await consumeStamina(modelToUse);
    if (!consumed1) {
      setStaminaError('スタミナの消費に失敗しました。');
      return;
    }
    isCancelledRef.current = false;
    setIsGeneratingMain(true);
    setIsGeneratingTab(true);
    setApiErrorMessage(null);

    // 1. AIでメイン画像（240x240）を生成
    const mainPrompt = `添付された基本イラストをもとに、LINEスタンプ公式規格のメイン画像（横240px × 縦240px）を生成。
## 描画条件
- 画像サイズ: 横240px × 縦240px（画像の外枠とイラストコンテンツの間に上下左右10pxの余白を空ける）
- 添付画像のキャラクターデザイン・色彩・表情・質感を100%そのまま忠実に継承する
- 背景は完全に単一のどぎつい鮮やかな濃い紫色・クロマキーマゼンタ（#FF00FF）。影やグラデーションは含めないこと
- 【絶対完全厳禁】絵画の額縁、飾り枠、四方の外枠・枠線・ボーダー、黒枠、ボックス線の描画は完全に厳禁（画像の外周・四方には枠線やフレームを絶対に描かないこと）
- 【重要】背景のどぎついマゼンタ紫色（#FF00FF）はクロマキー透過用です。キャラクター本体の内側は本来の色彩（白や淡い色も含む）で自由に着色してください
${mainPromptText ? `\n## 追加指示\n- ${mainPromptText}` : ''}`;

    console.log(`【Step4進入時 メイン画像 AI自動生成 (${modelToUse})】`);
    const rawMain = await callGeminiImageApi(selectedModel, mainPrompt, sourceImg, abortControllerRef, isCancelledRef, (msg) => setApiErrorMessage(msg), false, modelToUse);
    let finalMain = sourceImg;
    if (rawMain && rawMain !== PLACEHOLDER_IMG) {
      finalMain = await processMainImage(rawMain, modelToUse);
      setMainImage(finalMain);
    } else {
      finalMain = await processMainImage(sourceImg, modelToUse);
      setMainImage(finalMain);
    }
    setIsGeneratingMain(false);

    // 2. AIでトークルームタブ画像（96x74）を生成 — consume stamina for 2nd call
    const consumed2 = await consumeStamina(modelToUse);
    if (!consumed2 && !isAdmin) {
      setStaminaError('タブ画像生成のスタミナが不足しました。');
      setIsGeneratingTab(false);
      return;
    }
    const tabPrompt = `添付されたメイン画像をもとに、LINEスタンプ公式規格のトークルームタブ用画像（横96px × 縦74px）を生成。
## 描画条件
- 画像サイズ: 横96px × 縦74px
- 添付イラストのキャラクターの顔部分（または表情・顔がわかる部分）を中央に拡大クロップ配置し、96px × 74px の極小アイコンサイズでも一目でキャラクターの表情が判別できるよう視認性を最大限に高めて生成
- 背景は完全に単一のどぎつい鮮やかな濃い紫色・クロマキーマゼンタ（#FF00FF）。影やグラデーションは含めないこと
- 【絶対完全厳禁】絵画の額縁、飾り枠、四方の外枠・枠線・ボーダー、黒枠、ボックス線の描画は完全に厳禁（画像の外周・四方には枠線やフレームを絶対に描かないこと）
- 【重要】背景のどぎついマゼンタ紫色（#FF00FF）はクロマキー透過用です。キャラクター本体の内側は本来の色彩（白や淡い色も含む）で自由に着色してください
${tabPromptText ? `\n## 追加指示\n- ${tabPromptText}` : ''}`;

    console.log(`【Step4進入時 トークルームタブ画像 AI自動生成 (${modelToUse})】`);
    const rawTab = await callGeminiImageApi(selectedModel, tabPrompt, finalMain, abortControllerRef, isCancelledRef, (msg) => setApiErrorMessage(msg), false, modelToUse);
    if (rawTab && rawTab !== PLACEHOLDER_IMG) {
      const finalTab = await processTabImage(rawTab, modelToUse);
      setTabImage(finalTab);
    } else {
      const finalTab = await processTabImage(finalMain, modelToUse);
      setTabImage(finalTab);
    }
    setIsGeneratingTab(false);
  };

  // Step 5 進入時または画像更新時に Zip準備(sample.pdf同梱) + QR発行を行った上で PDF を描画生成
  useEffect(() => {
    if (step === 5) {
      setIsGeneratingPdf(true);
      (async () => {
        try {
          const pdfMainImage = baseImage || mainImage;
          // 1. sample.pdf を Zip 内に含めて Cloudflare アップロード + QRコード発行
          const { qrDataUrl } = await prepareStampZipAndGenerateQr(
            mainImage,
            tabImage,
            savedStamps,
            (qrUrl) => generatePdfBytes(pdfMainImage, capturedLineArt, savedStamps, qrUrl)
          );
          // 2. 印刷レイアウトPDF生成 (画面プレビュー用)
          const url = await generatePdfBlobUrl(pdfMainImage, capturedLineArt, savedStamps, qrDataUrl);
          setPdfBlobUrl(url);
        } catch (err) {
          console.error("PDF / Zip / QR generation error:", err);
        } finally {
          setIsGeneratingPdf(false);
        }
      })();
    }
  }, [step, baseImage, mainImage, tabImage, capturedLineArt, savedStamps]);

  const regeneratePdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const pdfMainImage = baseImage || mainImage;
      const { qrDataUrl } = await prepareStampZipAndGenerateQr(
        mainImage,
        tabImage,
        savedStamps,
        (qrUrl) => generatePdfBytes(pdfMainImage, capturedLineArt, savedStamps, qrUrl)
      );
      const url = await generatePdfBlobUrl(pdfMainImage, capturedLineArt, savedStamps, qrDataUrl);
      setPdfBlobUrl(url);
    } catch (err) {
      console.error("PDF generation error:", err);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const downloadPdf = () => {
    if (!pdfBlobUrl) return;
    const a = document.createElement('a');
    a.href = pdfBlobUrl;
    a.download = 'LINEスタンプ_OC公式印刷フォーマット.pdf';
    a.click();
  };

  const printPdf = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.print();
    } else {
      window.print();
    }
  };

  const generateBulkStamps = async () => {
    if (selectedPrompts.length === 0) return;

    isCancelledRef.current = false;
    setIsGeneratingBulk(true);
    setApiErrorMessage(null);
    const styleObj = STYLES.find(s => s.id === selectedStyle) || STYLES[0];
    const inputCanvasData = baseImage || (canvasRef.current ? canvasRef.current.toDataURL('image/png') : PLACEHOLDER_IMG);

    const promptsToGenerate = selectedPrompts.slice(0, 8);
    const newSaved: string[] = [];

    for (let i = 0; i < promptsToGenerate.length; i++) {
      if (isCancelledRef.current) break;

      const p = promptsToGenerate[i];
      const pLabel = p.id === '11' ? (customCharText.trim() ? `「${customCharText}」` : '「文字」') : p.label;
      const singlePromptText = p.id === '11'
        ? `「${customCharText.trim() || '文字'}」の文字`
        : p.prompt;

      setBulkProgress({
        current: i + 1,
        total: promptsToGenerate.length,
        currentLabel: pLabel,
      });

      let promptToUse = "";
      if (mode === 'expert') {
        promptToUse = singlePromptText + (stampFreeText.trim() ? `, ${stampFreeText}` : '');
      } else {
        promptToUse = `添付基本イラストをもとに、LINEスタンプ用画像を生成。

## 描画条件
- 画像サイズ: 横370px × 縦320px (LINEスタンプ公式規約に従い、外枠とイラストコンテンツの間に上下左右10pxの余白を空ける)
- 添付基本イラストのキャラクターデザイン・色彩・塗り・質感を100%そのまま継承し、カラフルに着色すること
- 背景は完全に単一のどぎつい鮮やかな濃い紫色・クロマキーマゼンタ（#FF00FF）。背景への影・グラデーション・模様・額縁・フレーム・枠線は一切描画しないこと
- 【絶対完全厳禁】絵画の額縁、飾り枠、四方の外枠・枠線・ボーダー、黒枠、ボックス線の描画は完全に厳禁（画像の外周・四方には枠線やフレームを絶対に描かないこと）
- 【重要】背景のどぎついマゼンタ紫色（#FF00FF）はクロマキー透過用の領域です。キャラクター本体の内側（服・目・白髪・肌・文字・水彩の淡い塗りなど）はどんな色（白や薄い色も含む）で自由に着色してください

## 画風・タッチ
- ${styleObj.prompt}
${charDesc ? `\n## キャラクターの説明\n- ${charDesc}` : ''}
\n## スタンプのポーズ・感情・文字指示\n- ${singlePromptText}
${stampFreeText ? `\n## 追加指示\n- ${stampFreeText}` : ''}`;
      }

      const modelForBatch = (!isDebugMode) ? 'gemini-3.1-flash-lite-image' : selectedModel;

      // Stamina check for each batch item
      if (!canAfford(modelForBatch)) {
        setStaminaError(`スタミナ不足のため ${i + 1}個目で停止しました（残り: ${stamina}）`);
        break;
      }
      const batchConsumed = await consumeStamina(modelForBatch);
      if (!batchConsumed) {
        setStaminaError(`スタミナ不足のため ${i + 1}個目で停止しました（残り: ${stamina}）`);
        break;
      }

      console.log(`【一括作成 [${i + 1}/${promptsToGenerate.length}] (${modelForBatch}) プロンプト: ${pLabel}】:\n`, promptToUse + NEGATIVE_PROMPT);

      const resultImg = await callGeminiImageApiWithRetry(
        selectedModel,
        promptToUse,
        inputCanvasData,
        abortControllerRef,
        isCancelledRef,
        (msg) => setApiErrorMessage(msg),
        false,
        modelForBatch
      );
      if (isCancelledRef.current) break;

      if (resultImg && resultImg !== PLACEHOLDER_IMG) {
        newSaved.push(resultImg);
        setSavedStamps(prev => [...prev, resultImg]);
        setCurrentStampResult(resultImg);
      }
    }

    setIsGeneratingBulk(false);
    setBulkProgress(null);
  };

  const discardStamp = () => {
    if (currentStampResult) {
      setSavedStamps(prev => prev.filter(img => img !== currentStampResult));
      setCurrentStampResult(null);
    }
  };

  // Step 4: Main Image & Tab Image States


  // 初回表示時にデータベースからプロジェクトを復元
  useEffect(() => {
    (async () => {
      try {
        const savedId = localStorage.getItem('current_project_id');
        const projects = await listProjects();
        setProjectList(projects);

        if (savedId) {
          const exists = projects.find(p => p.id === savedId);
          if (exists) {
            await restoreProjectFromDb(savedId);
            setIsLoadingProject(false);
            return;
          }
        }

        if (projects.length > 0) {
          await restoreProjectFromDb(projects[0].id);
        } else {
          const newProj = await createProject();
          setCurrentProjectId(newProj.id);
          localStorage.setItem('current_project_id', newProj.id);
          setProjectList([newProj]);
        }
      } catch (e) {
        console.warn('プロジェクト復元に失敗しました:', e);
      } finally {
        setIsRestored(true);
        setIsLoadingProject(false);
      }
    })();
  }, []);

  const restoreProjectFromDb = async (projectId: string) => {
    const full = await loadProject(projectId);
    const d = full.project;
    setCurrentProjectId(d.id);
    localStorage.setItem('current_project_id', d.id);
    if (d.step !== undefined) setStep(d.step);
    if (d.is_debug_mode !== undefined) setIsDebugMode(d.is_debug_mode);
    if (d.selected_model) setSelectedModel(d.selected_model as any);
    if (d.selected_style) setSelectedStyle(d.selected_style);
    if (d.line_retention !== undefined) setLineRetention(d.line_retention);
    if (d.char_desc !== undefined) setCharDesc(d.char_desc);
    if (d.base_free_text !== undefined) setBaseFreeText(d.base_free_text);
    if (d.selected_prompts) setSelectedPrompts(d.selected_prompts);
    if (d.custom_char_text !== undefined) setCustomCharText(d.custom_char_text);
    if (d.stamp_free_text !== undefined) setStampFreeText(d.stamp_free_text);
    if (d.main_prompt_text !== undefined) setMainPromptText(d.main_prompt_text);
    if (d.tab_prompt_text !== undefined) setTabPromptText(d.tab_prompt_text);
    if (d.mode) setMode(d.mode as Mode);
    if (full.lineArt) {
      setCapturedLineArt(full.lineArt);
      setHistory([full.lineArt]);
    }
    if (full.baseImage) setBaseImage(full.baseImage);
    if (full.stamps.length > 0) {
      setSavedStamps(full.stamps);
      setCurrentStampResult(full.stamps[full.stamps.length - 1]);
    }
    if (full.mainImage) setMainImage(full.mainImage);
    if (full.tabImage) setTabImage(full.tabImage);
    if (full.stamps.length > 0) setSelectedMainSource(full.stamps[0]);
  };

  // 状態変更時にデータベースへ自動同期（デバウンス付き）
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
            selected_prompts: selectedPrompts,
            custom_char_text: customCharText,
            stamp_free_text: stampFreeText,
            main_prompt_text: mainPromptText,
            tab_prompt_text: tabPromptText,
            mode,
          });
          await saveProjectImages(currentProjectId, {
            lineArt: capturedLineArt,
            baseImage,
            mainImage,
            tabImage,
            stamps: savedStamps,
          });
        } catch (e) {
          console.warn('データベース保存エラー:', e);
        }
      })();
    }, 2000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [
    isRestored, currentProjectId, isDebugMode, step, selectedModel, capturedLineArt, selectedStyle,
    lineRetention, charDesc, baseFreeText, baseImage, selectedPrompts,
    customCharText, stampFreeText, savedStamps,
    mainImage, tabImage, mainPromptText, tabPromptText, mode
  ]);

  const goToStep4 = (customSource?: string) => {
    // 並び替え後の1番目のスタンプ(savedStamps[0])を最優先でメイン・タブ画像生成元にセット
    const source = customSource || (savedStamps.length > 0 ? savedStamps[0] : null) || baseImage || selectedMainSource;
    setStep(4);
    if (source) {
      setSelectedMainSource(source);
      autoGenerateStep4Images(source);
    }
  };

  useEffect(() => {
    if (step === 4 && !mainImage && !isGeneratingMain) {
      const source = selectedMainSource || baseImage || (savedStamps.length > 0 ? savedStamps[0] : null);
      if (source) {
        autoGenerateStep4Images(source);
      }
    }
  }, [step, selectedMainSource, baseImage, savedStamps]);

  useEffect(() => {
    if (step === 4 && mainImage && !tabImage && !isGeneratingTab) {
      processTabImage(mainImage).then(res => setTabImage(res));
    }
  }, [step, mainImage]);

  const generateMainImage = async () => {
    const source = selectedMainSource || baseImage || (savedStamps.length > 0 ? savedStamps[0] : PLACEHOLDER_IMG);
    setStaminaError(null);
    const mainModel = (!isDebugMode) ? 'gemini-3.1-flash-lite-image' : selectedModel;
    if (!canAfford(mainModel)) {
      setStaminaError(`スタミナが足りません（必要: ${getStaminaCost(mainModel)}、残り: ${stamina}）。時間をおくと回復します（1時間に1回復）`);
      return;
    }
    const consumed = await consumeStamina(mainModel);
    if (!consumed) {
      setStaminaError('スタミナの消費に失敗しました。');
      return;
    }
    isCancelledRef.current = false;
    setIsGeneratingMain(true);
    setApiErrorMessage(null);

    const prompt = `添付画像をもとに、LINEスタンプ公式規格のメイン画像（横240px × 縦240px）を生成。
## 描画条件
- 画像サイズ: 横240px × 縦240px（画像の外枠とイラストコンテンツの間に上下左右10pxの余白を空ける）
- 添付画像のキャラクターデザイン・色合い・質感を100%継承する
- 背景は完全に単一のどぎつい鮮やかな濃い紫色・クロマキーマゼンタ（#FF00FF）。影やグラデーションは含めないこと
- 【絶対完全厳禁】絵画の額縁、飾り枠、四方の外枠・枠線・ボーダー、黒枠、ボックス線の描画は完全に厳禁（画像の外周・四方には枠線やフレームを絶対に描かないこと）
- 【重要】背景のどぎついマゼンタ紫色（#FF00FF）はクロマキー透過用です。キャラクター本体の内側は本来の色彩（白や淡い色も含む）で自由に着色してください
${mainPromptText ? `\n## 追加指示\n- ${mainPromptText}` : ''}`;

    console.log(`【メイン画像生成プロンプト (${mainModel})】:\n`, prompt + NEGATIVE_PROMPT);

    const raw = await callGeminiImageApi(selectedModel, prompt, source, abortControllerRef, isCancelledRef, (msg) => setApiErrorMessage(msg), false, mainModel);
    if (raw && raw !== PLACEHOLDER_IMG) {
      const processed = await processMainImage(raw);
      setMainImage(processed);
      processTabImage(processed).then(res => setTabImage(res));
    }
    setIsGeneratingMain(false);
  };

  const generateTabImage = async () => {
    const source = mainImage || selectedMainSource || baseImage || PLACEHOLDER_IMG;
    setStaminaError(null);
    const tabModel = (!isDebugMode) ? 'gemini-3.1-flash-lite-image' : selectedModel;
    if (!canAfford(tabModel)) {
      setStaminaError(`スタミナが足りません（必要: ${getStaminaCost(tabModel)}、残り: ${stamina}）。時間をおくと回復します（1時間に1回復）`);
      return;
    }
    const consumed = await consumeStamina(tabModel);
    if (!consumed) {
      setStaminaError('スタミナの消費に失敗しました。');
      return;
    }
    isCancelledRef.current = false;
    setIsGeneratingTab(true);
    setApiErrorMessage(null);

    const prompt = `添付されたメイン画像をもとに、LINEスタンプ公式規格のトークルームタブ用画像（横96px × 縦74px）を生成。
## 描画条件
- 画像サイズ: 横96px × 縦74px
- 添付イラストのキャラクターの顔部分（または表情・顔がわからない場合は全身）を中央に拡大クロップ配置し、96px × 74px の極小アイコンサイズでも一目で表情が判別できるよう視認性を最大限に高めて生成
- 背景は完全に単一のどぎつい鮮やかな濃い紫色・クロマキーマゼンタ（#FF00FF）。影やグラデーションは含めないこと
- 【絶対完全厳禁】絵画の額縁、飾り枠、四方の外枠・枠線・ボーダー、黒枠、ボックス線の描画は完全に厳禁（画像の外周・四方には枠線やフレームを絶対に描かないこと）
- 【重要】背景のどぎついマゼンタ紫色（#FF00FF）はクロマキー透過用です。キャラクター本体の内側は本来の色彩（白や淡い色も含む）で自由に着色してください
${tabPromptText ? `\n## 追加指示\n- ${tabPromptText}` : ''}`;

    console.log(`【トークルームタブ画像生成プロンプト (${tabModel})】:\n`, prompt + NEGATIVE_PROMPT);

    const raw = await callGeminiImageApi(selectedModel, prompt, source, abortControllerRef, isCancelledRef, (msg) => setApiErrorMessage(msg), false, tabModel);
    if (raw && raw !== PLACEHOLDER_IMG) {
      const processed = await processTabImage(raw);
      setTabImage(processed);
    }
    setIsGeneratingTab(false);
  };


  const resetAll = async () => {
    if (window.confirm("生成されたすべての画像と設定を破棄して、最初の線画作成（Step 1）からやり直しますか？")) {
      setHistory([]);
      setCapturedLineArt(null);
      setCharDesc('');
      setBaseFreeText('');
      setBaseImage(null);
      setSelectedPrompts([]);
      setStampFreeText('');
      setCurrentStampResult(null);
      setSavedStamps([]);
      setMainImage(null);
      setTabImage(null);
      setSelectedMainSource(null);
      setMainPromptText('');
      setTabPromptText('');
      setStep(1);
    }
  };

  const handleCreateProject = async () => {
    try {
      const name = newProjectName.trim() || undefined;
      const proj = await createProject(name);
      setProjectList(prev => [proj, ...prev]);
      setNewProjectName('');
      setShowProjectPicker(false);
      // Reset local state for new project
      setHistory([]);
      setCapturedLineArt(null);
      setCharDesc('');
      setBaseFreeText('');
      setBaseImage(null);
      setSelectedPrompts([]);
      setStampFreeText('');
      setCurrentStampResult(null);
      setSavedStamps([]);
      setMainImage(null);
      setTabImage(null);
      setSelectedMainSource(null);
      setMainPromptText('');
      setTabPromptText('');
      setStep(1);
      setCurrentProjectId(proj.id);
      localStorage.setItem('current_project_id', proj.id);
    } catch (e) {
      console.warn('プロジェクト作成エラー:', e);
    }
  };

  const handleSwitchProject = async (id: string) => {
    if (id === currentProjectId) {
      setShowProjectPicker(false);
      return;
    }
    try {
      setIsLoadingProject(true);
      // Reset state before loading
      setHistory([]);
      setCapturedLineArt(null);
      setBaseImage(null);
      setCurrentStampResult(null);
      setSavedStamps([]);
      setMainImage(null);
      setTabImage(null);
      setSelectedMainSource(null);
      await restoreProjectFromDb(id);
      setShowProjectPicker(false);
    } catch (e) {
      console.warn('プロジェクト読み込みエラー:', e);
    } finally {
      setIsLoadingProject(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!window.confirm('このプロジェクトを完全に削除しますか？')) return;
    try {
      await deleteProject(id);
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
    }
  };

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
          手描きでスタンプメーカー
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
            onChange={(e) => {
              setMode(e.target.value as Mode);
              if (e.target.value !== 'expert') {
                setStampFreeText(''); // clear sync when leaving expert mode
              }
            }}
          >
            <option value="easy">やさしいモード</option>
            <option value="default">通常モード</option>
            <option value="expert">エキスパートモード</option>
          </select>
          <button
            onClick={() => signOut()}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold border border-gray-200 transition-colors"
            title="ログアウト"
          >
            <LogOut size={14} /> ログアウト
          </button>
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

      <main className={`p-4 mx-auto pb-20 ${step === 3 ? 'max-w-7xl' : 'max-w-6xl'}`}>
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
            <div className="w-full text-center mb-1">
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
                      onClick={() => openAdjustModal(lastRawImage)}
                      className="p-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors border border-amber-200"
                      title="取り込み画像を再調整"
                    >
                      <RotateCcw size={16} /> {mode === 'easy' ? 'もういちど ちょうせい' : '取り込み再調整'}
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
                  {baseImage ? (mode === 'easy' ? 'つぎへ' : '次へ (スタンプ作成)') : (mode === 'easy' ? 'つぎへ' : '次のステップへ')} <ArrowRight size={20} />
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

        {step === 3 && (
          <div className="flex flex-col md:flex-row gap-4 md:h-[86vh] w-full animate-in slide-in-from-right duration-300">
            {/* Left Pane */}
            <div className="w-full md:w-[30%] shrink-0 bg-white rounded-xl shadow p-4 flex flex-col h-full border border-gray-200">
              {/* 基本イラスト (80%サイズに縮小) */}
              <div className="mb-3 shrink-0">
                <div className="flex justify-between items-center mb-1">
                  <h3 className="font-bold text-xs text-gray-500">基本イラスト (ベース)</h3>
                  <button
                    onClick={() => setStep(2)}
                    className="text-xs text-green-600 hover:text-green-800 font-semibold underline"
                  >
                    ← 画風変更
                  </button>
                </div>
                <div className="bg-gray-100 rounded-lg p-1 border w-[80%] max-w-[170px] mx-auto shadow-sm">
                  <img src={baseImage!} alt="Base" className="w-full aspect-square object-contain rounded" />
                </div>
              </div>

              {/* 保存したスタンプ一覧 (縦領域を最大化・表示を拡大) */}
              <div className="flex-1 overflow-y-auto mb-3 min-h-[200px] overflow-x-hidden pt-1 border-t">
                <h3 className="font-bold text-sm text-gray-600 mb-2 flex justify-between items-center sticky top-0 bg-white py-1 z-10">
                  <span>保存したスタンプ ({savedStamps.length})</span>
                  <span className="text-[10px] text-gray-400 font-normal">※タップ選択 / 移動</span>
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {savedStamps.map((stamp, i) => {
                    const isSelectedInPreview = currentStampResult === stamp;
                    return (
                      <div
                        key={i}
                        data-stamp-index={i}
                        draggable
                        onDragStart={() => handleDragStart(i)}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop(i)}
                        onTouchStart={() => handleTouchStartStamp(i)}
                        onTouchMove={handleTouchMoveStamp}
                        onTouchEnd={handleTouchEndStamp}
                        onClick={() => setCurrentStampResult(stamp)}
                        className={`relative aspect-square border rounded-xl overflow-hidden cursor-pointer bg-gray-50 transition-all select-none group ${isSelectedInPreview ? 'ring-4 ring-blue-500 border-blue-500 shadow-md scale-[1.02]' : 'hover:border-blue-300 hover:shadow-sm'
                          }`}
                        style={{ touchAction: 'none' }}
                        title="タップでプレビュー表示（ドラッグまたは矢印で順番変更）"
                      >
                        <img src={stamp} alt={`Stamp ${i + 1}`} className="w-full h-full object-contain pointer-events-none" />
                        <span className="absolute top-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded font-mono pointer-events-none shadow">
                          #{i + 1}
                        </span>

                        {/* 削除ボタン */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            requestDeleteSavedStamp(i);
                          }}
                          className="absolute top-1 right-1 bg-red-500 hover:bg-red-700 text-white rounded-full p-1 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow z-10"
                          title="このスタンプを削除"
                        >
                          <Trash2 size={12} />
                        </button>

                        {/* 順番前後移動ボタン（タッチ画面・パソコン双方で確実に操作可能） */}
                        <div className="absolute bottom-1 right-1 flex gap-1 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          {i > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                moveStamp(i, i - 1);
                              }}
                              className="bg-black/60 hover:bg-blue-600 text-white text-[10px] w-5 h-5 rounded flex items-center justify-center font-bold shadow"
                              title="前に移動"
                            >
                              ◀
                            </button>
                          )}
                          {i < savedStamps.length - 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                moveStamp(i, i + 1);
                              }}
                              className="bg-black/60 hover:bg-blue-600 text-white text-[10px] w-5 h-5 rounded flex items-center justify-center font-bold shadow"
                              title="後に移動"
                            >
                              ▶
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {savedStamps.length === 0 && (
                    <div className="col-span-2 text-center text-sm text-gray-400 py-8">
                      まだスタンプがありません
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => goToStep4()}
                disabled={savedStamps.length === 0}
                className="w-full py-3 rounded-xl font-bold text-white shadow-lg bg-green-500 hover:bg-green-600 disabled:opacity-50 transition-transform active:scale-95 flex justify-center items-center gap-2 mt-auto text-sm sm:text-base whitespace-nowrap"
              >
                次のステップへ <ArrowRight size={20} />
              </button>
            </div>

            {/* Center Pane */}
            <div className="w-full md:w-[35%] shrink-0 bg-slate-100 rounded-xl shadow p-4 flex flex-col h-full border-2 border-dashed border-gray-300">
              <div className="flex justify-between items-center mb-4">
                <h3 className={`font-bold text-gray-700 ${mode === 'easy' ? 'text-xl' : 'text-lg'}`}>
                  {mode === 'easy' ? 'みほん (プレビュー)' : 'スタンププレビュー'}
                </h3>
                {/* Background Preview Toggles */}
                <div className={`flex items-center gap-1 bg-white p-1 rounded-lg border shadow-sm font-semibold ${mode === 'easy' ? 'text-sm' : 'text-xs'}`}>
                  <span className="text-gray-400 px-1">{mode === 'easy' ? 'うしろ:' : '背景:'}</span>
                  <button
                    onClick={() => setPreviewBg('checker')}
                    className={`px-2 py-1 rounded transition-colors ${previewBg === 'checker' ? 'bg-slate-800 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                    title="透過チェック柄"
                  >
                    {mode === 'easy' ? 'すけ' : '透過'}
                  </button>
                  <button
                    onClick={() => setPreviewBg('line')}
                    className={`px-2 py-1 rounded transition-colors ${previewBg === 'line' ? 'bg-sky-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                    title="LINEトーク画面風"
                  >
                    LINE
                  </button>
                  <button
                    onClick={() => setPreviewBg('dark')}
                    className={`px-2 py-1 rounded transition-colors ${previewBg === 'dark' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                    title="ダークモード"
                  >
                    {mode === 'easy' ? 'くろ' : 'ダーク'}
                  </button>
                  <button
                    onClick={() => setPreviewBg('white')}
                    className={`px-2 py-1 rounded transition-colors ${previewBg === 'white' ? 'bg-gray-200 text-gray-800' : 'text-gray-600 hover:bg-gray-100'}`}
                    title="白背景"
                  >
                    {mode === 'easy' ? 'しろ' : '白'}
                  </button>
                </div>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center min-h-[300px]">
                {isGeneratingBulk ? (
                  <div className="flex flex-col items-center gap-4">
                    <Shuffle size={48} className="text-blue-500 animate-spin" />
                    <div className="flex items-center gap-3">
                      <p className={`font-bold text-gray-700 ${mode === 'easy' ? 'text-lg' : 'text-base'}`}>
                        {mode === 'easy' ? 'まとめてつくっているよ...' : 'イラストを一括生成中...'}
                      </p>
                      <button
                        onClick={cancelGeneration}
                        className={`bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg flex items-center gap-1.5 shadow transition-all active:scale-95 ${mode === 'easy' ? 'px-4 py-2 text-sm' : 'px-3 py-1.5 text-xs'}`}
                        title="以後の連続生成もすべて中止"
                      >
                        <Square size={14} fill="currentColor" /> {mode === 'easy' ? 'ストップ' : '中止'}
                      </button>
                    </div>
                    {bulkProgress && (
                      <div className="flex flex-col items-center gap-1.5 bg-white px-4 py-2 rounded-xl border border-blue-200 shadow-sm">
                        <span className={`font-bold text-blue-600 bg-blue-100 px-3 py-1 rounded-full ${mode === 'easy' ? 'text-sm' : 'text-xs'}`}>
                          {bulkProgress.current} / {bulkProgress.total} こめ
                        </span>
                        <span className={`text-gray-600 font-semibold ${mode === 'easy' ? 'text-sm' : 'text-xs'}`}>
                          「{bulkProgress.currentLabel}」
                        </span>
                      </div>
                    )}
                  </div>
                ) : isGeneratingStamp ? (
                  <div className="flex flex-col items-center gap-4">
                    <Shuffle size={48} className="text-blue-500 animate-spin" />
                    <div className="flex items-center gap-3">
                      <p className={`font-bold text-gray-600 ${mode === 'easy' ? 'text-lg' : 'text-base'}`}>
                        {mode === 'easy' ? 'えをつくっているよ...' : 'スタンプ生成中...'}
                      </p>
                      <button
                        onClick={cancelGeneration}
                        className={`bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg flex items-center gap-1.5 shadow transition-all active:scale-95 ${mode === 'easy' ? 'px-4 py-2 text-sm' : 'px-3 py-1.5 text-xs'}`}
                        title="生成を中止"
                      >
                        <Square size={14} fill="currentColor" /> {mode === 'easy' ? 'ストップ' : '中止'}
                      </button>
                    </div>
                  </div>
                ) : currentStampResult ? (
                  <div className="flex flex-col items-center w-full max-w-sm gap-6 animate-in zoom-in duration-300">
                    <div className={`w-full aspect-square rounded-xl shadow-lg border overflow-hidden transition-all ${previewBg === 'checker' ? CHECKER_BG :
                      previewBg === 'line' ? "bg-[#7293C2]" :
                        previewBg === 'dark' ? "bg-gray-900" : "bg-white"
                      }`}>
                      <img src={currentStampResult} className="w-full h-full object-contain" />
                    </div>
                    <div className="w-full">
                      <button onClick={discardStamp} className={`w-full bg-gray-200 text-gray-700 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-red-100 hover:text-red-600 transition-colors ${mode === 'easy' ? 'py-3 text-base' : 'py-2.5 text-sm'}`}>
                        <Trash2 size={18} /> {mode === 'easy' ? 'このスタンプをすてる' : 'このスタンプを破棄する'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-400 flex flex-col items-center gap-4 text-center px-4">
                    <div className="p-4 bg-gray-200 rounded-full">
                      <ImageIcon size={48} className="text-gray-500" />
                    </div>
                    <p className={`font-semibold text-gray-500 ${mode === 'easy' ? 'text-base' : 'text-sm'}`}>
                      {isBulkMode
                        ? <>みぎから えらんで<br />「まとめてつくる」をおしてね</>
                        : <>みぎから 言葉(ことば)をえらんで<br />「つくる！」ボタンをおしてね</>}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Pane */}
            <div className="w-full md:w-[35%] shrink-0 bg-white rounded-xl shadow p-4 flex flex-col h-full border border-gray-200 overflow-hidden">
              {mode === 'expert' ? (
                /* エキスパートモード: プロンプト選択無し（すべて自由記述） */
                <div className="flex-1 flex flex-col h-full">
                  <h3 className="font-bold text-base text-gray-800 mb-1 flex items-center gap-2">
                    プロンプト自由記述 (エキスパート専用)
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-semibold">全文フリー入力</span>
                  </h3>
                  <p className="text-xs text-gray-500 mb-3">
                    キーワード選択は無効です。生成したいスタンプのポーズ・表情・台詞・構図をすべて自由に文章で記述してください。
                  </p>
                  <textarea
                    value={stampFreeText}
                    onChange={(e) => setStampFreeText(e.target.value)}
                    placeholder="例: 両手を上げて大喜びしている姿。上に「やったー！」のカラフルな文字を描画。背景は透過でキャラクターが際立つように。"
                    className="w-full flex-1 border-2 border-gray-300 rounded-xl p-3 text-sm outline-none focus:border-purple-500 resize-none font-mono"
                  />
                </div>
              ) : (
                /* やさしい・通常モード: キーワードタグ選択UI */
                <>
                  <h3 className={`font-bold text-gray-600 mb-2 ${mode === 'easy' ? 'text-lg text-green-700' : 'text-sm text-gray-500'}`}>
                    {isBulkMode ? (mode === 'easy' ? 'えらぶ (さいだい8こ)' : 'プロンプト選択（最大8個）') : (mode === 'easy' ? 'ことばを えらぶ' : 'プロンプト選択（各グループ1つ）')}
                  </h3>

                  {/* Group / Category Tabs (Flex Wrap, No Scrollbar) */}
                  <div className="flex flex-wrap gap-1.5 mb-2.5 pb-2 border-b shrink-0">
                    {categories.map(cat => {
                      const easyCategoryMap: Record<string, string> = {
                        '文字': 'もじ',
                        '感情(喜)': 'うれしい',
                        '感情(悲・怒)': 'かなしい',
                        '行動': 'うごき',
                        '状況': 'ばめん',
                        '行事': 'イベント',
                        '飾り': 'かざり'
                      };
                      const catLabel = mode === 'easy' ? (easyCategoryMap[cat] || cat) : cat;
                      return (
                        <button
                          key={cat}
                          onClick={() => setSelectedCategory(cat)}
                          className={`font-semibold rounded-full whitespace-nowrap transition-colors ${mode === 'easy' ? 'px-3 py-1 text-sm' : 'px-2.5 py-1 text-xs'} ${selectedCategory === cat ? 'bg-blue-500 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                          {catLabel}
                        </button>
                      );
                    })}
                  </div>

                  {/* Filtered Prompt Keywords List */}
                  <div className="flex-1 overflow-y-auto mb-3 min-h-[120px]">
                    <div className="grid grid-cols-2 gap-1.5">
                      {promptKeywords.filter(k => k.category === selectedCategory).map(p => {
                        const isSelected = selectedPrompts.some(x => x.id === p.id);
                        return (
                          <button
                            key={p.id}
                            onClick={() => togglePrompt(p)}
                            className={`p-2 rounded-lg border text-left transition-colors flex justify-between items-center ${mode === 'easy' ? 'text-base font-bold py-2.5' : 'text-xs'} ${isSelected ? 'border-blue-500 bg-blue-50 text-blue-700 font-bold shadow-sm' : 'border-gray-200 hover:border-gray-300'}`}
                          >
                            <span className="truncate flex items-center gap-1">
                              {p.emoji && <span className="shrink-0">{p.emoji}</span>}
                              <span className="truncate">{mode === 'easy' ? (p.hiragana || p.label) : p.label}</span>
                            </span>
                            {isSelected && <Check size={mode === 'easy' ? 20 : 16} className="text-blue-500 shrink-0 ml-1" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Selected Prompts Badges Area */}
                  <div className="mb-3 p-2 bg-slate-50 border rounded-lg shrink-0">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className={`font-bold text-gray-700 ${mode === 'easy' ? 'text-sm' : 'text-xs'}`}>
                        {mode === 'easy' ? 'えらんだもの' : '選択中'} ({selectedPrompts.length}{isBulkMode ? '/8' : ''})
                      </span>
                      {selectedPrompts.length > 0 && (
                        <button
                          onClick={() => setSelectedPrompts([])}
                          className={`text-gray-400 hover:text-red-500 font-semibold ${mode === 'easy' ? 'text-xs' : 'text-[10px]'}`}
                        >
                          {mode === 'easy' ? 'けす' : 'クリア'}
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 max-h-[80px] overflow-y-auto">
                      {selectedPrompts.length === 0 ? (
                        <span className={`text-gray-400 italic ${mode === 'easy' ? 'text-sm' : 'text-xs'}`}>
                          {mode === 'easy' ? 'まだ えらんでないよ' : '未選択'}
                        </span>
                      ) : (
                        selectedPrompts.map(p => (
                          <span
                            key={p.id}
                            className={`inline-flex items-center gap-1 bg-blue-100 text-blue-800 rounded-full font-semibold ${mode === 'easy' ? 'px-2.5 py-1 text-sm' : 'px-2 py-0.5 text-xs'}`}
                          >
                            {p.id === '11' ? (customCharText.trim() ? `「${customCharText}」` : '「*」') : (mode === 'easy' ? (p.hiragana || p.label) : p.label)}
                            <button
                              onClick={() => togglePrompt(p)}
                              className="hover:text-red-600 font-bold ml-0.5 text-sm"
                            >
                              ×
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Custom text input for id: 11 (*) */}
                  {selectedPrompts.some(x => x.id === '11') && (
                    <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg shrink-0 animate-in fade-in duration-200">
                      <label className={`block font-bold text-blue-800 mb-1 flex justify-between items-center ${mode === 'easy' ? 'text-xs' : 'text-[11px]'}`}>
                        {mode === 'easy' ? '入れたい かんじ・もじ:' : '指定文字 (*):'}
                      </label>
                      <input
                        type="text"
                        value={customCharText}
                        onChange={(e) => setCustomCharText(e.target.value)}
                        placeholder={mode === 'easy' ? 'れい: がんばれ！' : '例: ファイト！'}
                        className={`w-full border border-blue-300 rounded bg-white outline-none focus:ring-1 focus:ring-blue-500 ${mode === 'easy' ? 'p-2 text-sm' : 'p-1.5 text-xs'}`}
                      />
                    </div>
                  )}

                  <div className="mb-3 shrink-0">
                    <h3 className={`font-bold text-gray-600 mb-1 ${mode === 'easy' ? 'text-sm' : 'text-xs'}`}>
                      {mode === 'easy' ? 'じゆうに書く (お好み)' : '自由記述'}
                    </h3>
                    <textarea
                      value={stampFreeText}
                      onChange={(e) => setStampFreeText(e.target.value)}
                      placeholder={mode === 'easy' ? 'つけくわえたい ことばを入力...' : '追加の指示を入力...'}
                      className={`w-full border border-gray-300 rounded-lg outline-none focus:border-blue-500 ${mode === 'easy' ? 'p-2.5 text-sm' : 'p-2 text-xs'}`}
                      rows={2}
                    />
                  </div>
                </>
              )}

              <div className="flex items-center gap-2 mt-auto shrink-0">
                {/* トグルスイッチ: イラスト一括作成モード（最大8個） */}
                <label className={`flex items-center gap-1.5 cursor-pointer select-none border border-gray-200 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors shrink-0 ${mode === 'easy' ? 'px-3 py-2.5' : 'px-2.5 py-2'}`} title="ONにすると最大8つのプロンプトを選択して一括連続生成・保存します">
                  <span className={`font-bold text-gray-700 whitespace-nowrap ${mode === 'easy' ? 'text-xs' : 'text-[11px]'}`}>
                    {mode === 'easy' ? 'まとめて作る' : '一括作成'}
                  </span>
                  <div className="relative inline-flex items-center">
                    <input
                      type="checkbox"
                      checked={isBulkMode}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setIsBulkMode(checked);
                        if (checked && selectedPrompts.length > 8) {
                          setSelectedPrompts(prev => prev.slice(0, 8));
                        }
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                  </div>
                </label>

                <button
                  onClick={isBulkMode ? generateBulkStamps : generateStamp}
                  disabled={
                    isGeneratingStamp ||
                    isGeneratingBulk ||
                    selectedPrompts.length === 0
                  }
                  className={`flex-1 rounded-xl font-bold text-white shadow bg-blue-500 hover:bg-blue-600 disabled:opacity-50 transition-transform active:scale-95 flex justify-center items-center gap-1.5 ${mode === 'easy' ? 'py-3.5 text-base sm:text-lg bg-orange-500 hover:bg-orange-600' : 'py-2.5 text-xs sm:text-sm'}`}
                >
                  <Shuffle size={mode === 'easy' ? 20 : 16} /> {isBulkMode ? (mode === 'easy' ? `まとめてつくる (${selectedPrompts.length}こ)` : `一括生成 (${selectedPrompts.length}個)`) : (mode === 'easy' ? 'つくる！' : '生成する')}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-6 animate-in slide-in-from-right duration-300 w-full max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b pb-3">
              <div>
                <h2 className={`font-bold text-gray-800 flex items-center gap-2 ${mode === 'easy' ? 'text-2xl' : 'text-xl'}`}>
                  {mode === 'easy' ? 'メインのえ ＆ タブのえ 作成' : 'メイン画像 ＆ トークルームタブ画像作成'}
                  <span className={`bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full font-semibold ${mode === 'easy' ? 'text-sm' : 'text-xs'}`}>
                    LINE公式規格
                  </span>
                </h2>
                <p className={`text-gray-500 mt-1 ${mode === 'easy' ? 'text-sm font-semibold' : 'text-xs'}`}>
                  {mode === 'easy' ? 'LINEでひょうじされる 一番大きな「メインの絵」と、したにでる小「タブの絵」をじどうで作成します。' : 'LINEストアで表示されるメイン画像（240×240px）とトーク画面のタブ画像（96×74px）を作成・調整します。'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Main Image Section (240x240) */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex flex-col items-center">
                <div className="w-full flex justify-between items-center mb-3">
                  <h3 className={`font-bold text-gray-700 flex items-center gap-1.5 ${mode === 'easy' ? 'text-lg text-green-700' : 'text-base'}`}>
                    {mode === 'easy' ? 'メインの絵' : 'メイン画像'} <span className={`text-gray-400 font-normal ${mode === 'easy' ? 'text-sm' : 'text-xs'}`}>(240 × 240px)</span>
                  </h3>
                </div>

                {/* 240x240 Preview Container */}
                <div className={`w-full aspect-square max-w-[240px] rounded-xl border-2 border-gray-300 shadow-inner ${CHECKER_BG} flex items-center justify-center p-1 relative mb-4`}>
                  {isGeneratingMain ? (
                    <div className="flex flex-col items-center gap-2">
                      <Shuffle size={36} className="text-blue-500 animate-spin" />
                      <span className={`font-bold text-gray-600 ${mode === 'easy' ? 'text-sm' : 'text-xs'}`}>
                        {mode === 'easy' ? 'メインの絵をつくっているよ...' : 'メイン画像生成中...'}
                      </span>
                    </div>
                  ) : mainImage ? (
                    <img src={mainImage} alt="Main Image" className="w-full h-full object-contain" />
                  ) : (
                    <span className={`text-gray-400 ${mode === 'easy' ? 'text-sm' : 'text-xs'}`}>
                      {mode === 'easy' ? 'まだできてないよ' : '画像未作成'}
                    </span>
                  )}
                </div>

                {/* Source Selection Thumbnails */}
                <div className="w-full mb-4">
                  <label className={`block font-bold text-gray-600 mb-1.5 ${mode === 'easy' ? 'text-sm' : 'text-xs'}`}>
                    {mode === 'easy' ? 'もとにする 絵をえらぶ:' : 'メイン画像の元画像を選択:'}
                  </label>
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                    {baseImage && (
                      <button
                        onClick={() => {
                          setSelectedMainSource(baseImage);
                          autoGenerateStep4Images(baseImage);
                        }}
                        className={`shrink-0 rounded-lg border-2 overflow-hidden bg-gray-50 transition-all ${selectedMainSource === baseImage ? 'border-blue-500 ring-2 ring-blue-300 scale-105' : 'border-gray-200 opacity-70 hover:opacity-100'} ${mode === 'easy' ? 'w-14 h-14' : 'w-12 h-12'}`}
                        title="基本イラストを使用"
                      >
                        <img src={baseImage} className="w-full h-full object-contain" />
                      </button>
                    )}
                    {savedStamps.map((src, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setSelectedMainSource(src);
                          autoGenerateStep4Images(src);
                        }}
                        className={`shrink-0 rounded-lg border-2 overflow-hidden bg-gray-50 transition-all ${selectedMainSource === src ? 'border-blue-500 ring-2 ring-blue-300 scale-105' : 'border-gray-200 opacity-70 hover:opacity-100'} ${mode === 'easy' ? 'w-14 h-14' : 'w-12 h-12'}`}
                        title={`スタンプバリエーション #${idx + 1} を使用`}
                      >
                        <img src={src} className="w-full h-full object-contain" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Prompt & Regenerate */}
                <div className="w-full">
                  <textarea
                    value={mainPromptText}
                    onChange={(e) => setMainPromptText(e.target.value)}
                    placeholder={mode === 'easy' ? 'なおしたいところ（れい: にっこり笑顔にする）' : 'メイン画像の修正指示（例: 表情を少し笑顔にする、帽子を足す等）'}
                    className={`w-full border border-gray-300 rounded-xl outline-none focus:border-blue-500 mb-2 ${mode === 'easy' ? 'p-3 text-sm' : 'p-2.5 text-xs'}`}
                    rows={2}
                  />
                  <button
                    onClick={generateMainImage}
                    disabled={isGeneratingMain || isGeneratingTab}
                    className={`w-full rounded-xl font-bold text-white shadow bg-blue-500 hover:bg-blue-600 disabled:opacity-50 transition-transform active:scale-95 flex justify-center items-center gap-1.5 ${mode === 'easy' ? 'py-3 text-base' : 'py-2.5 text-xs'}`}
                  >
                    <Shuffle size={16} /> {mode === 'easy' ? 'もういちど つくりなおす' : 'AIでメイン画像を修正・再生成'}
                  </button>
                </div>
              </div>

              {/* Talk Room Tab Image Section (96x74) */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex flex-col items-center">
                <div className="w-full flex justify-between items-center mb-3">
                  <h3 className={`font-bold text-gray-700 flex items-center gap-1.5 ${mode === 'easy' ? 'text-lg text-purple-700' : 'text-base'}`}>
                    {mode === 'easy' ? 'タブの絵' : 'トークルームタブ画像'} <span className={`text-gray-400 font-normal ${mode === 'easy' ? 'text-sm' : 'text-xs'}`}>(96 × 74px)</span>
                  </h3>
                </div>

                {/* 96x74 Preview Container */}
                <div className={`w-[192px] h-[148px] rounded-xl border-2 border-gray-300 shadow-inner ${CHECKER_BG} flex items-center justify-center p-1 relative mb-4`}>
                  {isGeneratingTab ? (
                    <div className="flex flex-col items-center gap-1">
                      <Shuffle size={28} className="text-purple-500 animate-spin" />
                      <span className={`font-bold text-gray-600 ${mode === 'easy' ? 'text-sm' : 'text-[10px]'}`}>
                        {mode === 'easy' ? 'タブの絵をつくっているよ...' : 'タブ画像生成中...'}
                      </span>
                    </div>
                  ) : tabImage ? (
                    <img src={tabImage} alt="Tab Image" className="w-full h-full object-contain" />
                  ) : (
                    <span className={`text-gray-400 ${mode === 'easy' ? 'text-sm' : 'text-xs'}`}>
                      {mode === 'easy' ? 'まだできてないよ' : '画像未作成'}
                    </span>
                  )}
                </div>
                <span className={`text-gray-400 mb-4 text-center ${mode === 'easy' ? 'text-xs' : 'text-[11px]'}`}>
                  ※ちいさいアイコン（かおのアップ）になるよ
                </span>

                {/* Prompt & Regenerate */}
                <div className="w-full mt-auto">
                  <textarea
                    value={tabPromptText}
                    onChange={(e) => setTabPromptText(e.target.value)}
                    placeholder={mode === 'easy' ? 'なおしたいところ（れい: かおを もっとアップにする）' : 'タブ画像の修正指示（例: 顔をもっとズームアップする、目の表情を強調等）'}
                    className={`w-full border border-gray-300 rounded-xl outline-none focus:border-purple-500 mb-2 ${mode === 'easy' ? 'p-3 text-sm' : 'p-2.5 text-xs'}`}
                    rows={2}
                  />
                  <button
                    onClick={generateTabImage}
                    disabled={isGeneratingTab || isGeneratingMain}
                    className={`w-full rounded-xl font-bold text-white shadow bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-transform active:scale-95 flex justify-center items-center gap-1.5 ${mode === 'easy' ? 'py-3 text-base' : 'py-2.5 text-xs'}`}
                  >
                    <Shuffle size={16} /> {mode === 'easy' ? 'もういちど つくりなおす' : 'AIでタブ画像を修正・再生成'}
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Navigation */}
            <div className="flex justify-between items-center pt-4 border-t">
              <button
                onClick={() => setStep(3)}
                className={`rounded-full font-bold text-gray-700 bg-gray-200 hover:bg-gray-300 transition-colors ${mode === 'easy' ? 'px-6 py-3 text-base' : 'px-6 py-2.5 text-sm'}`}
              >
                {mode === 'easy' ? '← もどる' : '← スタンプ作成に戻る'}
              </button>
              <button
                onClick={() => setStep(5)}
                disabled={!mainImage || !tabImage}
                className={`rounded-full font-bold text-white shadow-lg bg-green-500 hover:bg-green-600 disabled:opacity-50 transition-transform active:scale-95 flex items-center gap-2 ${mode === 'easy' ? 'px-10 py-3.5 text-xl' : 'px-8 py-3 text-base'}`}
              >
                {mode === 'easy' ? 'つぎへ (いんさつ・ほぞん)' : '次のステップへ'} <ArrowRight size={20} />
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="flex flex-col items-center gap-6 w-full max-w-5xl mx-auto animate-in slide-in-from-bottom duration-300">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 w-full border-b pb-3">
              <div>
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  {mode === 'easy' ? 'ほぞん ＆ いんさつ' : '保存 ＆ PDF印刷フォーマット'}
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  {mode === 'easy' ? 'つくったスタンプをいんさつしたり、ダウンロ―ドできるよ！' : '公式の「OC_LINEスタンプ印刷フォーマット.pdf」に全生成画像を自動埋め込んだPDFビューアです。レイアウト崩れなく高精細に印刷・保存できます。'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={regeneratePdf}
                  disabled={isGeneratingPdf}
                  className={`flex items-center gap-1.5 text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 font-bold transition-colors rounded-full shadow-sm active:scale-95 ${mode === 'easy' ? 'px-4 py-2.5 text-sm' : 'px-3.5 py-2 text-xs'}`}
                >
                  <Shuffle size={14} className={isGeneratingPdf ? 'animate-spin' : ''} /> {mode === 'easy' ? 'もういちどつくる' : 'PDFを再生成'}
                </button>
                <button
                  onClick={downloadPdf}
                  disabled={!pdfBlobUrl || isGeneratingPdf}
                  className={`flex items-center gap-1.5 text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 font-bold transition-colors rounded-full shadow-sm active:scale-95 ${mode === 'easy' ? 'px-5 py-2.5 text-sm' : 'px-4 py-2 text-xs'}`}
                >
                  <Download size={16} /> {mode === 'easy' ? 'ほぞんする (PDF)' : 'PDFをダウンロード'}
                </button>
                <button
                  onClick={printPdf}
                  disabled={!pdfBlobUrl || isGeneratingPdf}
                  className={`flex items-center gap-1.5 text-white font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-full shadow transition-colors active:scale-95 ${mode === 'easy' ? 'px-6 py-2.5 text-sm' : 'px-5 py-2 text-xs'}`}
                >
                  <Printer size={16} /> {mode === 'easy' ? 'いんさつする' : '印刷する (PDF直接印刷)'}
                </button>
              </div>
            </div>

            {/* Complete Package Contents Summary Bar & Drag Reordering */}
            <div className="w-full bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-3">
                <div className="flex items-center gap-4">
                  {mainImage && (
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-bold text-gray-500 mb-1">メイン (240x240)</span>
                      <div className="w-12 h-12 border rounded-lg overflow-hidden bg-gray-50 p-0.5 shadow-sm">
                        <img src={mainImage} className="w-full h-full object-contain" />
                      </div>
                    </div>
                  )}
                  {tabImage && (
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-bold text-gray-500 mb-1">タブ (96x74)</span>
                      <div className="w-12 h-12 border rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center p-0.5 shadow-sm">
                        <img src={tabImage} className="w-full h-full object-contain" />
                      </div>
                    </div>
                  )}
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-800">
                      {mode === 'easy' ? 'スタンプのならびじゅん' : 'LINEスタンプ印刷パッケージ (配置順)'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {mode === 'easy' ? 'ドラッグまたはタッチで 順番をチェンジできるよ！' : `メイン 1点 / タブ 1点 / スタンプ ${savedStamps.length}点 (タッチ＆ドラッグで並び順を自由に変更可能)`}
                    </span>
                  </div>
                </div>
              </div>

              {/* スタンプ画像 タッチ＆ドラッグ並び替えリスト */}
              {savedStamps.length > 0 && (
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                  {savedStamps.map((stamp, idx) => (
                    <div
                      key={idx}
                      data-stamp-index={idx}
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={handleDragOver}
                      onDrop={() => {
                        handleDrop(idx);
                        regeneratePdf();
                      }}
                      onTouchStart={() => handleTouchStartStamp(idx)}
                      onTouchMove={handleTouchMoveStamp}
                      onTouchEnd={() => {
                        handleTouchEndStamp();
                        regeneratePdf();
                      }}
                      className="shrink-0 flex flex-col items-center gap-1 group cursor-grab active:cursor-grabbing select-none"
                    >
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl border-2 border-gray-200 bg-gray-50 p-1 overflow-hidden shadow-sm group-hover:border-blue-500 group-hover:shadow transition-all relative" style={{ touchAction: 'none' }}>
                        <img src={stamp} alt={`Stamp ${idx + 1}`} className="w-full h-full object-contain pointer-events-none" />
                        <span className="absolute top-1 left-1 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold pointer-events-none shadow">
                          #{idx + 1}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            requestDeleteSavedStamp(idx);
                          }}
                          className="absolute top-1 right-1 bg-red-500 hover:bg-red-700 text-white rounded-full p-1 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow"
                          title="このスタンプを削除"
                        >
                          <Trash2 size={12} />
                        </button>
                        <div className="absolute bottom-1 right-1 flex gap-1 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          {idx > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                moveStamp(idx, idx - 1);
                                regeneratePdf();
                              }}
                              className="bg-black/60 hover:bg-blue-600 text-white text-[10px] w-5 h-5 rounded flex items-center justify-center font-bold shadow"
                              title="前に移動"
                            >
                              ◀
                            </button>
                          )}
                          {idx < savedStamps.length - 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                moveStamp(idx, idx + 1);
                                regeneratePdf();
                              }}
                              className="bg-black/60 hover:bg-blue-600 text-white text-[10px] w-5 h-5 rounded flex items-center justify-center font-bold shadow"
                              title="後に移動"
                            >
                              ▶
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Interactive Embedded PDF Viewer (100% Vector PDF Match) */}
            <div className="w-full flex flex-col items-center gap-3">
              {isGeneratingPdf ? (
                <div className="w-full h-[650px] flex flex-col items-center justify-center bg-white rounded-2xl border-2 border-gray-300 shadow-inner">
                  <Shuffle size={48} className="text-green-500 animate-spin mb-4" />
                  <p className="font-bold text-gray-700">公式フォーマットPDFビューアを生成中...</p>
                </div>
              ) : pdfBlobUrl ? (
                <div className="w-full flex flex-col items-center gap-2">
                  <iframe
                    ref={iframeRef}
                    src={pdfBlobUrl}
                    className="w-full h-[820px] border-2 border-gray-300 rounded-2xl shadow-2xl bg-white"
                    title="OC LINE Stamp PDF Viewer"
                  />
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500 bg-white rounded-2xl border w-full">
                  PDFビューアの生成に失敗しました。
                </div>
              )}
            </div>

            {/* Navigation & Reset */}
            <div className="flex flex-col sm:flex-row items-center gap-4 mt-2">
              <button
                onClick={() => setStep(4)}
                className="px-6 py-2.5 rounded-full font-bold text-gray-700 bg-gray-200 hover:bg-gray-300 transition-colors shadow-sm text-sm"
              >
                ← メイン・タブ画像作成に戻る
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Enlarged Stamp Modal */}
      {enlargedStamp && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setEnlargedStamp(null)}>
          <div className={`relative max-w-2xl w-full ${CHECKER_BG} rounded-2xl overflow-hidden shadow-2xl`} onClick={e => e.stopPropagation()}>
            <button
              className="absolute top-4 right-4 bg-black/50 hover:bg-black/80 text-white rounded-full p-2 transition-colors z-10"
              onClick={() => setEnlargedStamp(null)}
            >
              <X size={24} />
            </button>
            <img src={enlargedStamp} alt="Enlarged stamp" className="w-full h-auto object-contain" />
          </div>
        </div>
      )}

      {/* Base Image Confirmation Modal */}
      {showBaseConfirm && baseImage && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4 animate-in fade-in zoom-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl flex flex-col items-center gap-6 border text-center">
            <h3 className="text-xl font-bold text-gray-800">
              {mode === 'easy' ? 'このえでスタンプをつくる？' : 'この画像をもとにして、各スタンプを作成しますか？'}
            </h3>

            {/* 背景グレーの格子模様で大きく拡大表示 */}
            <div className={`w-full aspect-square max-w-[360px] rounded-2xl overflow-hidden border-2 border-gray-300 shadow-inner ${CHECKER_BG} flex items-center justify-center p-2`}>
              <img src={baseImage} alt="Base Illustration Preview" className="w-full h-full object-contain drop-shadow-md" />
            </div>

            <p className="text-xs text-gray-500">
              ※この基本イラストの画風・タッチを引き継いで各スタンプバリエーションを生成します。
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

      {/* 画像調整モーダル (トリミング・コントラスト・明度スライダー) */}
      {adjustRawImage && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl flex flex-col items-center relative border border-gray-100">
            <button
              onClick={cancelAdjust}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
              title="閉じる"
            >
              <X size={24} />
            </button>

            <h3 className={`font-bold text-gray-800 mb-1 flex items-center gap-2 ${mode === 'easy' ? 'text-xl' : 'text-lg'}`}>
              {mode === 'easy' ? 'えをちょうせい' : '線画の調整'}
            </h3>
            <p className={`text-gray-500 mb-3 ${mode === 'easy' ? 'text-sm' : 'text-xs'}`}>
              {mode === 'easy' ? 'ドラッグでトリミング、スライダーでちょうせい' : 'ドラッグで範囲を切り抜き、スライダーで濃さと明るさを調整'}
            </p>

            {/* トリミング＆プレビューエリア */}
            <div
              ref={adjustContainerRef}
              className="w-full aspect-square max-w-[360px] bg-white rounded-2xl overflow-hidden border-2 border-gray-200 shadow-inner mb-3 relative select-none"
              style={{ touchAction: 'none', cursor: 'crosshair' }}
              onPointerDown={handleCropPointerDown}
              onPointerMove={handleCropPointerMove}
              onPointerUp={handleCropPointerUp}
            >
              <img
                ref={adjustImgRef}
                src={adjustRawImage}
                alt="調整プレビュー"
                className="w-full h-full object-contain pointer-events-none"
                style={{ filter: `contrast(${adjustContrast}%) brightness(${adjustBrightness}%)` }}
              />
              {/* 切り抜き範囲のオーバーレイ */}
              {cropBox && adjustContainerRef.current && adjustImgRef.current && (() => {
                const container = adjustContainerRef.current!;
                const imgEl = adjustImgRef.current!;
                const bounds = getImageBoundsInContainer(container, imgEl.naturalWidth, imgEl.naturalHeight);
                const left = bounds.x + Math.min(cropBox.x1, cropBox.x2) * bounds.w;
                const top = bounds.y + Math.min(cropBox.y1, cropBox.y2) * bounds.h;
                const width = Math.abs(cropBox.x2 - cropBox.x1) * bounds.w;
                const height = Math.abs(cropBox.y2 - cropBox.y1) * bounds.h;
                return (
                  <>
                    {/* Dark overlay outside crop region */}
                    <div className="absolute inset-0 pointer-events-none" style={{
                      background: `linear-gradient(to right,
                        rgba(0,0,0,0.5) ${left}px,
                        transparent ${left}px,
                        transparent ${left + width}px,
                        rgba(0,0,0,0.5) ${left + width}px)`
                    }} />
                    <div className="absolute pointer-events-none" style={{
                      left: `${left}px`, top: 0, width: `${width}px`, height: `${top}px`,
                      background: 'rgba(0,0,0,0.5)'
                    }} />
                    <div className="absolute pointer-events-none" style={{
                      left: `${left}px`, top: `${top + height}px`, width: `${width}px`,
                      bottom: 0, background: 'rgba(0,0,0,0.5)'
                    }} />
                    {/* Crop border */}
                    <div className="absolute pointer-events-none border-2 border-white" style={{
                      left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`,
                      boxShadow: '0 0 0 1px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(255,255,255,0.3)'
                    }}>
                      {/* Corner handles */}
                      {[[0,0],[1,0],[0,1],[1,1]].map(([cx,cy]) => (
                        <div key={`${cx}-${cy}`} className="absolute w-3 h-3 bg-white border-2 border-green-500 rounded-sm pointer-events-none" style={{
                          left: cx ? 'auto' : '-6px', right: cx ? '-6px' : 'auto',
                          top: cy ? 'auto' : '-6px', bottom: cy ? '-6px' : 'auto'
                        }} />
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* トリミングリセットボタン */}
            <div className="w-full flex justify-between items-center mb-3">
              <span className={`font-bold text-gray-500 flex items-center gap-1 ${mode === 'easy' ? 'text-xs' : 'text-[11px]'}`}>
                <Crop size={13} /> {cropBox
                  ? (mode === 'easy' ? 'きりぬきON' : 'トリミング範囲あり')
                  : (mode === 'easy' ? 'ドラッグできりぬき' : 'ドラッグで範囲指定')}
              </span>
              {cropBox && (
                <button
                  onClick={() => setCropBox(null)}
                  className="text-xs font-bold text-red-500 hover:text-red-700 flex items-center gap-1 transition-colors"
                >
                  <X size={13} /> {mode === 'easy' ? 'リセット' : 'トリミング解除'}
                </button>
              )}
            </div>

            <div className="w-full space-y-4 mb-5">
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className={`font-bold text-gray-700 ${mode === 'easy' ? 'text-sm' : 'text-xs'}`}>
                    {mode === 'easy' ? 'せんの こさ (コントラスト)' : 'コントラスト'}
                  </span>
                  <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">{adjustContrast}%</span>
                </div>
                <div className="flex items-center gap-3 bg-gray-50 p-2.5 rounded-xl border border-gray-200">
                  <span className="text-xs text-gray-400 shrink-0">{mode === 'easy' ? 'うすい' : '低'}</span>
                  <input
                    type="range"
                    min="50"
                    max="300"
                    value={adjustContrast}
                    onChange={e => setAdjustContrast(Number(e.target.value))}
                    className="w-full accent-green-500 cursor-pointer"
                  />
                  <span className="text-xs text-gray-400 shrink-0">{mode === 'easy' ? 'こい' : '高'}</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className={`font-bold text-gray-700 ${mode === 'easy' ? 'text-sm' : 'text-xs'}`}>
                    {mode === 'easy' ? 'あかるさ (めいど)' : '明度'}
                  </span>
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{adjustBrightness}%</span>
                </div>
                <div className="flex items-center gap-3 bg-gray-50 p-2.5 rounded-xl border border-gray-200">
                  <span className="text-xs text-gray-400 shrink-0">{mode === 'easy' ? 'くらい' : '低'}</span>
                  <input
                    type="range"
                    min="50"
                    max="250"
                    value={adjustBrightness}
                    onChange={e => setAdjustBrightness(Number(e.target.value))}
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                  <span className="text-xs text-gray-400 shrink-0">{mode === 'easy' ? 'あかるい' : '高'}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 w-full">
              <button
                onClick={cancelAdjust}
                className={`flex-1 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors ${mode === 'easy' ? 'py-3.5 text-base' : 'py-3 text-sm'}`}
              >
                {mode === 'easy' ? 'やめる' : 'キャンセル'}
              </button>
              <button
                onClick={confirmAdjust}
                className={`flex-[2] rounded-xl font-bold text-white bg-green-500 hover:bg-green-600 shadow-lg shadow-green-500/30 transition-transform active:scale-95 flex items-center justify-center gap-2 ${mode === 'easy' ? 'py-3.5 text-lg' : 'py-3 text-sm'}`}
              >
                <Check size={18} /> {mode === 'easy' ? 'これでOK！' : '取り込む'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* スタンプ削除確認モーダル */}
      {deleteConfirmIndex !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center text-center gap-4 animate-in zoom-in-95 duration-200 border border-gray-100">
            <div className="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
              <Trash2 size={28} />
            </div>
            <div>
              <h3 className="font-bold text-lg text-gray-800">スタンプを削除しますか？</h3>
              <p className="text-xs text-gray-500 mt-1">
                保存したスタンプ #{deleteConfirmIndex + 1} をリストから削除します。この操作は取り消せません。
              </p>
            </div>

            {savedStamps[deleteConfirmIndex] && (
              <div className="w-24 h-24 border rounded-2xl overflow-hidden bg-gray-50 p-1 shadow-inner my-1">
                <img src={savedStamps[deleteConfirmIndex]} alt="Deleting Stamp" className="w-full h-full object-contain" />
              </div>
            )}

            <div className="flex gap-3 w-full mt-2">
              <button
                onClick={() => setDeleteConfirmIndex(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold hover:bg-gray-50 transition-colors text-sm"
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  confirmDeleteSavedStamp();
                  if (step === 5) regeneratePdf();
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold shadow-md transition-all text-sm"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
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
    </div>
  );
}
