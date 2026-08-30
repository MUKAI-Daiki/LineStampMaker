export type Mode = 'easy' | 'default' | 'expert';

export interface PromptKeyword {
  id: string;
  category: string;
  label: string;
  hiragana?: string;
  prompt: string;
  emoji?: string;
}

export const promptKeywords: PromptKeyword[] = [
  // 1-11 文字 (絵文字なし)
  { id: '1', category: '文字', label: 'おはよう', hiragana: 'おはよう', prompt: '「おはよう」の文字, 朝の挨拶' },
  { id: '2', category: '文字', label: 'こんにちは', hiragana: 'こんにちは', prompt: '「こんにちは」の文字, 手を振る' },
  { id: '3', category: '文字', label: 'こんばんは', hiragana: 'こんばんは', prompt: '「こんばんは」の文字, 夜の挨拶をする' },
  { id: '4', category: '文字', label: 'ありがとう', hiragana: 'ありがとう', prompt: '「ありがとう！」の文字, 感謝を伝える' },
  { id: '5', category: '文字', label: 'ごめんなさい', hiragana: 'ごめんなさい', prompt: '「ごめんなさい」の文字, ペコリと謝る' },
  { id: '6', category: '文字', label: 'おやすみ', hiragana: 'おやすみ', prompt: '「おやすみ」の文字, すやすや眠る' },
  { id: '7', category: '文字', label: 'いってきます', hiragana: 'いってきます', prompt: '「いってきます」の文字, 元気に外出する' },
  { id: '8', category: '文字', label: 'ただいま', hiragana: 'ただいま', prompt: '「ただいま」の文字, 帰宅する' },
  { id: '9', category: '文字', label: 'お疲れ様', hiragana: 'おつかれさま', prompt: '「お疲れ様！」の文字, 労う' },
  { id: '10', category: '文字', label: 'よろしく', hiragana: 'よろしく', prompt: '「よろしくね」の文字, お辞儀をする' },
  { id: '11', category: '文字', label: '*', hiragana: '*', prompt: '「*」の文字' },

  // 12-21 感情(喜)
  { id: '12', category: '感情(喜)', label: '嬉しい', hiragana: 'うれしい', prompt: '明るい表情', emoji: '😄' },
  { id: '13', category: '感情(喜)', label: '楽しい', hiragana: 'たのしい', prompt: 'ご機嫌でダンスする', emoji: '🎵' },
  { id: '14', category: '感情(喜)', label: '大好き', hiragana: 'だいすき', prompt: '目がハート', emoji: '❤️' },
  { id: '15', category: '感情(喜)', label: '最高', hiragana: 'さいこう', prompt: '親指を立てる', emoji: '👍' },
  { id: '16', category: '感情(喜)', label: 'わくわく', hiragana: 'わくわく', prompt: '目を輝かせる', emoji: '✨' },
  { id: '17', category: '感情(喜)', label: 'ほっとした', hiragana: 'ほっとした', prompt: '安心した様子', emoji: '☺️' },
  { id: '18', category: '感情(喜)', label: 'やったー', hiragana: 'やったー', prompt: '両手を挙げて大喜び', emoji: '🙌' },
  { id: '19', category: '感情(喜)', label: 'すごい', hiragana: 'すごい', prompt: '拍手', emoji: '👏' },
  { id: '20', category: '感情(喜)', label: 'いいね', hiragana: 'いいね', prompt: '笑顔', emoji: '👌' },
  { id: '21', category: '感情(喜)', label: '笑', hiragana: 'わら', prompt: '大爆笑', emoji: '🤣' },

  // 22-31 感情(悲・怒)
  { id: '22', category: '感情(悲・怒)', label: '悲しい', hiragana: 'かなしい', prompt: '涙を流す', emoji: '😭' },
  { id: '23', category: '感情(悲・怒)', label: '怒る', hiragana: 'おこる', prompt: 'プンプン怒っている', emoji: '💢' },
  { id: '24', category: '感情(悲・怒)', label: '疲れた', hiragana: 'つかれた', prompt: 'クタクタになっている', emoji: '😫' },
  { id: '25', category: '感情(悲・怒)', label: 'しょんぼり', hiragana: 'しょんぼり', prompt: 'うなだれている', emoji: '😞' },
  { id: '26', category: '感情(悲・怒)', label: 'むむむ', hiragana: 'むむむ', prompt: '腕組みして悩む', emoji: '🤔' },
  { id: '27', category: '感情(悲・怒)', label: 'ぴえん', hiragana: 'ぴえん', prompt: 'うるうるした目', emoji: '🥺' },
  { id: '28', category: '感情(悲・怒)', label: 'ショック', hiragana: 'しょっく', prompt: '青ざめている', emoji: '😱' },
  { id: '29', category: '感情(悲・怒)', label: '焦る', hiragana: 'あせる', prompt: '汗をかいて焦る', emoji: '💦' },
  { id: '30', category: '感情(悲・怒)', label: 'ため息', hiragana: 'ためいき', prompt: 'ため息をつく', emoji: '😮‍💨' },
  { id: '31', category: '感情(悲・怒)', label: 'がーん', hiragana: 'がーん', prompt: '落ち込んでいる', emoji: '🗿' },

  // 32-41 行動
  { id: '32', category: '行動', label: 'OK', hiragana: 'おーけー', prompt: '手でOKサインを作る', emoji: '🙆‍♂️' },
  { id: '33', category: '行動', label: 'NG', hiragana: 'えぬじー', prompt: '腕でバツ印を作る', emoji: '🙅‍♂️' },
  { id: '34', category: '行動', label: 'お願い', hiragana: 'おねがい', prompt: '手を合わせる', emoji: '🙏' },
  { id: '35', category: '行動', label: '待って', hiragana: 'まって', prompt: '手を前に出す', emoji: '✋' },
  { id: '36', category: '行動', label: '行くね', hiragana: 'いくね', prompt: 'ダッシュする', emoji: '🏃‍♂️' },
  { id: '37', category: '行動', label: '食べる', hiragana: 'たべる', prompt: 'もぐもぐ食べている', emoji: '🍚' },
  { id: '38', category: '行動', label: '飲む', hiragana: 'のむ', prompt: 'ドリンクを飲む', emoji: '🥤' },
  { id: '39', category: '行動', label: '見る', hiragana: 'みる', prompt: '物陰から覗く', emoji: '👀' },
  { id: '40', category: '行動', label: '聞く', hiragana: 'きく', prompt: '耳を澄ます', emoji: '👂' },
  { id: '41', category: '行動', label: '走る', hiragana: 'はしる', prompt: '疾走する', emoji: '💨' },

  // 42-51 状況
  { id: '42', category: '状況', label: '電話中', hiragana: 'でんわちゅう', prompt: 'スマホで電話する', emoji: '📱' },
  { id: '43', category: '状況', label: 'PC作業', hiragana: 'ぱそこん', prompt: 'パソコンを打つ', emoji: '💻' },
  { id: '44', category: '状況', label: '移動中', hiragana: 'いどうちゅう', prompt: '歩いている', emoji: '🚶‍♂️' },
  { id: '45', category: '状況', label: '勉強中', hiragana: 'べんきょうちゅう', prompt: '本を読む', emoji: '📖' },
  { id: '46', category: '状況', label: '考え中', hiragana: 'かんがえちゅう', prompt: '「？」のマークと思案する', emoji: '❓' },
  { id: '47', category: '状況', label: '睡眠中', hiragana: 'すいみんちゅう', prompt: 'ぐっすり眠る', emoji: '😴' },
  { id: '48', category: '状況', label: 'ゲーム中', hiragana: 'げーむちゅう', prompt: 'コントローラーを握る', emoji: '🎮' },
  { id: '49', category: '状況', label: '料理中', hiragana: 'りょうりちゅう', prompt: 'お料理する', emoji: '🍳' },
  { id: '50', category: '状況', label: 'お風呂', hiragana: 'おふろ', prompt: 'お風呂に浸かる', emoji: '♨️' },
  { id: '51', category: '状況', label: '音楽', hiragana: 'おんがく', prompt: 'ヘッドホンでノリノリ', emoji: '🎧' },

  // 52-60 行事
  { id: '52', category: '行事', label: 'お祝い', hiragana: 'おいわい', prompt: 'クラッカーを鳴らす', emoji: '🎉' },
  { id: '53', category: '行事', label: '誕生日', hiragana: 'たんじょうび', prompt: 'ケーキを持つ, 「Happy Birthday」の文字', emoji: '🎂' },
  { id: '54', category: '行事', label: 'あけおめ', hiragana: 'あけおめ', prompt: 'お正月衣装', emoji: '🎍' },
  { id: '55', category: '行事', label: '節分', hiragana: 'せつぶん', prompt: '節分豆を持つ, 頭に鬼のお面', emoji: '👹' },
  { id: '56', category: '行事', label: 'ひな祭り', hiragana: 'ひなまつり', prompt: 'お雛様の恰好', emoji: '🎎' },
  { id: '57', category: '行事', label: '花見', hiragana: 'おはなみ', prompt: '桜の花を見る', emoji: '🌸' },
  { id: '58', category: '行事', label: 'こどもの日', hiragana: 'こどものひ', prompt: '折り紙の兜をかぶる, こいのぼり', emoji: '🎏' },
  { id: '59', category: '行事', label: 'ハロウィン', hiragana: 'はろうぃん', prompt: 'ハロウィン風の衣装', emoji: '🎃' },
  { id: '60', category: '行事', label: 'クリスマス', hiragana: 'くりすます', prompt: 'サンタ帽とクリスマスツリー', emoji: '🎄' },

  // 61-76 飾り
  { id: '61', category: '飾り', label: 'ハート', hiragana: 'ほし', prompt: '背景に星マーク', emoji: '💖' },
  { id: '62', category: '飾り', label: '怒り', hiragana: 'おんぷ', prompt: '顔に怒りマーク', emoji: '💢' },
  { id: '63', category: '飾り', label: '汗', hiragana: 'おんせん', prompt: '顔に汗マーク', emoji: '💦' },
  { id: '64', category: '飾り', label: 'キラキラ', hiragana: 'きらきら', prompt: '全体にキラキラマーク', emoji: '✨' },
  { id: '65', category: '飾り', label: '花びら', hiragana: 'はなびら', prompt: '全体に花びらマーク', emoji: '🌸' },
  { id: '66', category: '飾り', label: '風', hiragana: 'かぜ', prompt: 'キャラの横に風マーク', emoji: '🍃' },
  { id: '67', category: '飾り', label: '音符', hiragana: 'おんぷ', prompt: '顔の周りに音符マーク', emoji: '🎵' },
  { id: '68', category: '飾り', label: '爆発', hiragana: 'ばくはつ', prompt: '背景に大爆発', emoji: '💥' },
  { id: '69', category: '飾り', label: 'Zzz', hiragana: 'ねむい', prompt: '顔の横にZzzマーク', emoji: '💤' },
  { id: '70', category: '飾り', label: 'メラメラ', hiragana: 'めらめら', prompt: '背景にメラメラマーク', emoji: '🔥' },
  { id: '71', category: '飾り', label: '吹き出し', hiragana: 'ふきだし', prompt: '顔の横に吹き出しマーク', emoji: '💬' },
  { id: '72', category: '飾り', label: 'ひらめき', hiragana: 'ひらめき', prompt: '頭の上に電球マーク', emoji: '💡' },
  { id: '73', category: '飾り', label: 'ぐるぐるの渦巻き', hiragana: 'うずまき', prompt: '背景にぐるぐるの渦巻きマーク', emoji: '🌀' },
  { id: '74', category: '飾り', label: 'サムズアップ', hiragana: 'いいね', prompt: '背景にサムズアップマーク', emoji: '👍' },
  { id: '75', category: '飾り', label: '温泉', hiragana: 'おんせん', prompt: '背景に温泉マーク', emoji: '♨️' },
  { id: '76', category: '飾り', label: '肉球', hiragana: 'ねこのて', prompt: '肉球マーク', emoji: '🐾' },
];
