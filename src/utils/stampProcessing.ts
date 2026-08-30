import { applyAlphaTransparency } from './imageTransparency';
import { embedPngMetadata } from './pngMetadata';

export function ensureBase64PngData(imageDataUrl: string, isLineArt: boolean = false): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const width = img.naturalWidth || 600;
      const height = img.naturalHeight || 600;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0);

        if (isLineArt) {
          const imgData = ctx.getImageData(0, 0, width, height);
          const data = imgData.data;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const avg = (r + g + b) / 3;
            if (avg < 220) {
              data[i] = 0;
              data[i + 1] = 0;
              data[i + 2] = 0;
            } else {
              data[i] = 255;
              data[i + 1] = 255;
              data[i + 2] = 255;
            }
          }
          ctx.putImageData(imgData, 0, 0);
        }

        const pngDataUrl = canvas.toDataURL("image/png");
        resolve(pngDataUrl.replace(/^data:image\/png;base64,/, ''));
      } else {
        resolve('');
      }
    };
    img.onerror = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 600;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, 600, 600);
      }
      resolve(canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, ''));
    };
    img.src = imageDataUrl;
  });
}

function processImageWithChromaKey(
  dataUrl: string,
  width: number,
  height: number,
  padding: number,
  modelName: string
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#FF00FF";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, padding, padding, width - padding * 2, height - padding * 2);
        const filledUrl = canvas.toDataURL("image/png");
        const transparentPng = await applyAlphaTransparency(filledUrl);
        resolve(embedPngMetadata(transparentPng, modelName));
      } else {
        resolve(embedPngMetadata(dataUrl, modelName));
      }
    };
    img.onerror = () => resolve(embedPngMetadata(dataUrl, modelName));
    img.src = dataUrl;
  });
}

export function processStampImage(dataUrl: string, modelName: string = 'gemini-3.1-flash-image'): Promise<string> {
  return processImageWithChromaKey(dataUrl, 370, 320, 10, modelName);
}

export function processMainImage(dataUrl: string, modelName: string = 'gemini-3.1-flash-image'): Promise<string> {
  return processImageWithChromaKey(dataUrl, 240, 240, 10, modelName);
}

export function processTabImage(dataUrl: string, modelName: string = 'gemini-3.1-flash-image'): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 74;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#FF00FF";
        ctx.fillRect(0, 0, 96, 74);
        ctx.drawImage(img, 0, 0, 96, 74);
        const filledUrl = canvas.toDataURL("image/png");
        const transparentPng = await applyAlphaTransparency(filledUrl);
        resolve(embedPngMetadata(transparentPng, modelName));
      } else {
        resolve(embedPngMetadata(dataUrl, modelName));
      }
    };
    img.onerror = () => resolve(embedPngMetadata(dataUrl, modelName));
    img.src = dataUrl;
  });
}
