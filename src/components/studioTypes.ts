import type { Mode } from '../characterAssets';
import type { GenerationRunner, ModelName } from '../utils/geminiApi';
import type { VariationStore } from '../utils/useVariations';

export interface PromptContext {
  stylePrompt: string;
  charDesc: string;
  freeText: string;
}

export interface StaminaInfo {
  remaining: number;
  unlimited: boolean;
  cost: (model: ModelName) => number;
}

export interface StudioProps {
  baseImage: string;
  promptCtx: PromptContext;
  runner: GenerationRunner;
  store: VariationStore;
  mode: Mode;
  stamina: StaminaInfo;
}
