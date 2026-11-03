export type Mode = 'easy' | 'default' | 'expert';

export type AssetType = 'rpg' | 'slg' | 'act' | 'novel' | 'custom';
export type BulkAssetType = Exclude<AssetType, 'custom'>;

export interface AssetSlot {
  key: string;
  label: string;
  prompt: string;
  /** 同じ値を持つスロットはアニメーションのコマとして連続再生できる */
  animGroup?: string;
}

export interface AssetDef {
  type: AssetType;
  label: string;
  description: string;
  viewPrompt: string;
  slots: AssetSlot[];
}

const DIRECTIONS = [
  { key: 's', label: '正面', prompt: '正面向き（体と顔がこちら＝画面手前を向いている）' },
  { key: 'se', label: '右斜め前', prompt: '右斜め前向き（画面右下方向へ体を向け、顔と体の正面が4分の3見える）' },
  { key: 'e', label: '右向き', prompt: '完全な右向き（画面右方向を向いた真横のシルエット）' },
  { key: 'ne', label: '右斜め後ろ', prompt: '右斜め後ろ向き（画面右上方向＝奥へ向かって体を向け、背中側が4分の3見える）' },
  { key: 'n', label: '背面', prompt: '背面向き（画面奥を向き、後頭部と背中が見える）' },
  { key: 'nw', label: '左斜め後ろ', prompt: '左斜め後ろ向き（画面左上方向＝奥へ向かって体を向け、背中側が4分の3見える）' },
  { key: 'w', label: '左向き', prompt: '完全な左向き（画面左方向を向いた真横のシルエット）' },
  { key: 'sw', label: '左斜め前', prompt: '左斜め前向き（画面左下方向へ体を向け、顔と体の正面が4分の3見える）' },
];

function directionalSlots(): AssetSlot[] {
  return DIRECTIONS.flatMap(d => [
    {
      key: `${d.key}_stand`,
      label: `${d.label}・立ち`,
      prompt: `${d.prompt}で、両足をそろえて自然に立っている待機ポーズ`,
      animGroup: d.key,
    },
    {
      key: `${d.key}_walk`,
      label: `${d.label}・歩き`,
      prompt: `${d.prompt}で、その向きへ歩いている途中のポーズ（片足を前へ踏み出し、腕を交互に振っている）`,
      animGroup: d.key,
    },
  ]);
}

const ACT_FACING = 'やや右斜め前を向いた横スクロールアクションゲーム用の構図（画面右側へ進む向き）';

export const ASSET_DEFS: Record<AssetType, AssetDef> = {
  rpg: {
    type: 'rpg',
    label: '2D RPGアセット',
    description: '目線の高さから見た8方向の立ち・歩き',
    viewPrompt: '2D RPGのキャラクタースプライト用。カメラはキャラクターと同じ目線の高さから水平に見た視点（見下ろさない）。全身を描く。頭身はゲームキャラクターとして読みやすい頭身を保つ',
    slots: directionalSlots(),
  },
  slg: {
    type: 'slg',
    label: '2D SLGアセット',
    description: '斜め45°上から見下ろした8方向の立ち・歩き',
    viewPrompt: '2D シミュレーション（タクティクス）ゲームのユニット用。カメラは斜め上45°から見下ろした俯瞰視点（クォータービュー）。頭頂部と肩がやや見え、足元はすぼまるパースで全身を描く',
    slots: directionalSlots(),
  },
  act: {
    type: 'act',
    label: '2D ACTアセット',
    description: 'やや右向きのアクションポーズ15種',
    viewPrompt: `2D アクションゲームのキャラクタースプライト用。${ACT_FACING}。全身を描き、全コマでキャラクターの大きさ・頭身・足元の高さをそろえる`,
    slots: [
      { key: 'idle', label: '立ち', prompt: '自然に立っている待機ポーズ' },
      { key: 'walk1', label: '歩き1', prompt: '歩行アニメーションの1コマ目：右足を前に出し、左腕を前に振った接地の瞬間', animGroup: 'walk' },
      { key: 'walk2', label: '歩き2', prompt: '歩行アニメーションの2コマ目：両足が体の真下で交差し、腕が体側にある中間姿勢', animGroup: 'walk' },
      { key: 'walk3', label: '歩き3', prompt: '歩行アニメーションの3コマ目：左足を前に出し、右腕を前に振った接地の瞬間', animGroup: 'walk' },
      { key: 'run1', label: '走り1', prompt: '走行アニメーションの1コマ目：前傾姿勢で右足を大きく前へ踏み込み、腕を大きく振る', animGroup: 'run' },
      { key: 'run2', label: '走り2', prompt: '走行アニメーションの2コマ目：両足が地面から離れた空中姿勢（脚を前後に開いている）', animGroup: 'run' },
      { key: 'run3', label: '走り3', prompt: '走行アニメーションの3コマ目：前傾姿勢で左足を大きく前へ踏み込み、腕を大きく振る', animGroup: 'run' },
      { key: 'guard', label: '構え', prompt: '戦闘の構え（腰を落とし、拳を前に構えたファイティングポーズ）' },
      { key: 'punch', label: 'パンチ', prompt: '前方（画面右）へ拳を突き出したパンチ' },
      { key: 'kick', label: 'キック', prompt: '前方（画面右）へ脚を高く蹴り出したキック' },
      { key: 'jump', label: 'ジャンプ', prompt: '膝を曲げて空中に跳び上がったジャンプ（足元は地面から離れている）' },
      { key: 'crouch', label: 'しゃがみ', prompt: 'その場で低くしゃがみ込んだ姿勢' },
      { key: 'damage', label: 'ダメージ', prompt: '前方から攻撃を受けてのけぞるダメージ姿勢（痛がる表情）' },
      { key: 'down', label: 'ダウン', prompt: '倒れて地面に横たわったダウン姿勢（目を回している）' },
      { key: 'win', label: '勝利', prompt: '拳を突き上げて喜ぶ勝利ポーズ' },
    ],
  },
  novel: {
    type: 'novel',
    label: '2D ノベルアセット',
    description: '上半身の表情10種＋全身画',
    viewPrompt: 'ノベルゲーム（ADV）の立ち絵用。正面からやや斜めを向き、全コマで同じ体の向き・構図・大きさをそろえる',
    slots: [
      ...[
        { key: 'neutral', label: '平常', prompt: '落ち着いた平常の表情' },
        { key: 'smile', label: '笑み', prompt: '口角を上げた穏やかな笑み' },
        { key: 'laugh', label: '爆笑', prompt: '口を大きく開けて目を細めた大笑い' },
        { key: 'happy', label: '幸せ', prompt: '頬を染めてうっとりとした幸せそうな表情' },
        { key: 'angry', label: '怒り', prompt: '眉をつり上げて歯を食いしばった怒りの表情' },
        { key: 'anxious', label: '不安', prompt: '眉を下げて視線をそらした不安そうな表情' },
        { key: 'fear', label: '恐怖', prompt: '目を見開き青ざめておびえた恐怖の表情' },
        { key: 'surprise', label: '驚き', prompt: '目と口を丸く開いた驚きの表情' },
        { key: 'cry', label: '泣き', prompt: '涙をこぼして泣いている表情' },
        { key: 'grief', label: '悲壮', prompt: 'うつむき加減で悲しみに打ちひしがれた悲壮な表情' },
      ].map(e => ({
        ...e,
        prompt: `頭から胸元までの上半身を大きく描いたバストアップ。表情は「${e.prompt}」。表情以外（髪型・服・体の向き・構図・大きさ）は他の表情差分と完全に同一に保つ`,
      })),
      { key: 'full', label: '全身', prompt: '頭からつま先までの全身立ち絵。平常の表情で自然に立っている' },
    ],
  },
  custom: {
    type: 'custom',
    label: '追加バリエーション',
    description: '調整画面で追加した画像',
    viewPrompt: '',
    slots: [],
  },
};

export const BULK_ASSET_TYPES: BulkAssetType[] = ['rpg', 'slg', 'act', 'novel'];
export const ASSET_ORDER: AssetType[] = [...BULK_ASSET_TYPES, 'custom'];

export function slotIndex(type: AssetType, slotKey: string): number {
  const idx = ASSET_DEFS[type].slots.findIndex(s => s.key === slotKey);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

const CHROMA_RULES = `- 背景は完全に単一のどぎつい鮮やかな濃い紫色・クロマキーマゼンタ（#FF00FF）。背景への影・グラデーション・模様・地面・枠線は一切描画しない
- 【重要】背景のマゼンタ（#FF00FF）はクロマキー透過用の領域。キャラクター本体の内側（服・目・髪・肌など）は白や淡い色も含めて本来の色で塗る
- キャラクター1体のみを画像の中央に配置し、上下左右に十分な余白を空ける`;

const CONSISTENCY_RULES = `- 添付1枚目はこのキャラクターの「基本イラスト（デザイン設定画）」。顔立ち・髪型・髪色・目の色・服装・装飾品・配色・体型・頭身・画風をすべて厳密に同一に保つ（別人化・衣装変更・色の変更は厳禁）`;

interface PromptContext {
  stylePrompt: string;
  charDesc: string;
  freeText: string;
}

function contextBlock(ctx: PromptContext): string {
  return [
    `\n## 画風・タッチ\n- ${ctx.stylePrompt}`,
    ctx.charDesc.trim() ? `\n## キャラクターの説明\n- ${ctx.charDesc.trim()}` : '',
    ctx.freeText.trim() ? `\n## 追加指示\n- ${ctx.freeText.trim()}` : '',
  ].join('\n');
}

export function buildSlotPrompt(type: BulkAssetType, slot: AssetSlot, ctx: PromptContext, hasPrevFrame: boolean): string {
  const def = ASSET_DEFS[type];
  return `添付の基本イラストのキャラクターで、ゲーム用キャラクターアセットの1枚を生成。

## 用途・視点
- ${def.viewPrompt}

## このコマのポーズ
- ${slot.prompt}

## 描画条件
${CONSISTENCY_RULES}
${hasPrevFrame ? '- 添付2枚目は同じアニメーションの直前のコマ。キャラクターの大きさ・位置・足元の高さ・線の太さ・塗りをこれに完全にそろえ、連続再生したときに自然につながるよう描く\n' : ''}${CHROMA_RULES}
${contextBlock(ctx)}`;
}

export function buildRefinePrompt(label: string, instruction: string, ctx: PromptContext): string {
  return `添付1枚目の画像（「${label}」）を修正して描き直す。

## 修正指示
- ${instruction.trim() || '全体の品質を上げ、崩れている部分を整える'}

## 描画条件
- 修正指示に関係しない部分（ポーズ・向き・視点・構図・大きさ）は添付1枚目をそのまま維持する
- 添付2枚目はこのキャラクターの基本イラスト（デザイン設定画）。顔立ち・髪型・服装・配色・画風はこれに厳密に合わせる
${CHROMA_RULES}
${contextBlock({ ...ctx, freeText: '' })}`;
}

export function buildNewVariationPrompt(instruction: string, referenceCount: number, ctx: PromptContext): string {
  const extra = referenceCount > 1
    ? `- 添付2枚目以降は追加の参照画像。指示に従ってポーズ・構図・表情・向き・アイテムなどの参考にする（キャラクターのデザインは1枚目を正とする）\n`
    : '';
  return `添付の画像を参照して、同じキャラクターの新しいバリエーション画像を1枚生成。

## 生成内容
- ${instruction.trim()}

## 描画条件
${CONSISTENCY_RULES}
${extra}${CHROMA_RULES}
${contextBlock(ctx)}`;
}
