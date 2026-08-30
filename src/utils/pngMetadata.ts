const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function calculateCrc32(buf: Uint8Array): number {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ -1) >>> 0;
}

function createPngChunk(typeStr: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(typeStr);
  const len = data.length;
  const chunk = new Uint8Array(4 + 4 + len + 4);
  const view = new DataView(chunk.buffer);

  view.setUint32(0, len, false);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);

  const crcTarget = new Uint8Array(4 + len);
  crcTarget.set(typeBytes, 0);
  crcTarget.set(data, 4);
  const crcVal = calculateCrc32(crcTarget);
  view.setUint32(8 + len, crcVal, false);

  return chunk;
}

function createTextChunk(keyword: string, text: string): Uint8Array {
  const keyBytes = new TextEncoder().encode(keyword);
  const textBytes = new TextEncoder().encode(text);
  const data = new Uint8Array(keyBytes.length + 1 + textBytes.length);
  data.set(keyBytes, 0);
  data[keyBytes.length] = 0;
  data.set(textBytes, keyBytes.length + 1);
  return createPngChunk('tEXt', data);
}

function createPhysChunk(dpi: number = 100): Uint8Array {
  const ppm = Math.round(dpi / 0.0254);
  const data = new Uint8Array(9);
  const view = new DataView(data.buffer);
  view.setUint32(0, ppm, false);
  view.setUint32(4, ppm, false);
  data[8] = 1;
  return createPngChunk('pHYs', data);
}

export function embedPngMetadata(dataUrl: string, modelName: string = 'gemini-3.1-flash-image'): string {
  try {
    const base64Str = dataUrl.replace(/^data:image\/png;base64,/, '');
    const binaryStr = atob(base64Str);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4E || bytes[3] !== 0x47) {
      return dataUrl;
    }

    const ihdrEndOffset = 33;
    const timestamp = new Date().toISOString();

    const physChunk = createPhysChunk(100);
    const softwareChunk = createTextChunk('Software', 'RiTan Lab. 手描きでスタンプメーカー');
    const timeChunk = createTextChunk('Creation Time', timestamp);
    const aiChunk = createTextChunk('Comment', `Generative AI Model: ${modelName}`);

    const newChunksTotalLen = physChunk.length + softwareChunk.length + timeChunk.length + aiChunk.length;
    const resultBytes = new Uint8Array(bytes.length + newChunksTotalLen);

    resultBytes.set(bytes.subarray(0, ihdrEndOffset), 0);

    let offset = ihdrEndOffset;
    resultBytes.set(physChunk, offset); offset += physChunk.length;
    resultBytes.set(softwareChunk, offset); offset += softwareChunk.length;
    resultBytes.set(timeChunk, offset); offset += timeChunk.length;
    resultBytes.set(aiChunk, offset); offset += aiChunk.length;

    resultBytes.set(bytes.subarray(ihdrEndOffset), offset);

    let binary = '';
    const len = resultBytes.byteLength;
    const chunkSize = 8192;
    for (let i = 0; i < len; i += chunkSize) {
      binary += String.fromCharCode.apply(null, Array.from(resultBytes.subarray(i, i + chunkSize)));
    }
    return `data:image/png;base64,${btoa(binary)}`;
  } catch (err) {
    console.warn("PNG メタデータ埋め込みエラー:", err);
    return dataUrl;
  }
}
