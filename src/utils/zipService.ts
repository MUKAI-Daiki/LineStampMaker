import JSZip from 'jszip';
import { ASSET_DEFS, slotIndex } from '../characterAssets';
import type { Variation } from './variationDb';

const UNSAFE_CHARS = /[\\/:*?"<>|\s]+/g;

export function safeFileName(name: string): string {
  return name.replace(UNSAFE_CHARS, '_').replace(/^_+|_+$/g, '') || 'image';
}

export function variationFileName(v: Variation, indexInGroup: number): string {
  const idx = slotIndex(v.assetType, v.slotKey);
  const num = String((idx === Number.MAX_SAFE_INTEGER ? indexInGroup : idx) + 1).padStart(2, '0');
  return `${v.assetType}_${num}_${safeFileName(v.label)}.png`;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64Part = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const bin = atob(base64Part);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function triggerDownload(href: string, fileName: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadDataUrl(dataUrl: string, fileName: string) {
  triggerDownload(dataUrl, fileName);
}

export async function downloadVariationsZip(
  zipName: string,
  variations: Variation[],
  extras: { name: string; dataUrl: string }[] = []
): Promise<void> {
  const zip = new JSZip();
  extras.forEach(e => zip.file(e.name, dataUrlToBytes(e.dataUrl)));

  const counters = new Map<string, number>();
  variations.forEach(v => {
    const i = counters.get(v.assetType) ?? 0;
    counters.set(v.assetType, i + 1);
    zip.folder(safeFileName(ASSET_DEFS[v.assetType].label))?.file(variationFileName(v, i), dataUrlToBytes(v.image));
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, `${safeFileName(zipName)}.zip`);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
