// ── フォント定義 ──────────────────────────────────────────────
// ゴシック体・明朝体はシステム搭載フォントを OS ごとに優先度付きで並べる
export const FONT_OPTIONS = {
  // ゴシック体（システム）
  biz:     '"BIZ UDPGothic","BIZ UDPゴシック","Noto Sans JP","Yu Gothic","Meiryo",sans-serif',
  hira:    '"Hiragino Sans","ヒラギノ角ゴ ProN W3","BIZ UDPGothic","Yu Gothic",sans-serif',
  yu:      '"Yu Gothic","游ゴシック","Meiryo","Noto Sans JP",sans-serif',
  me:      '"Meiryo","メイリオ","Yu Gothic","Noto Sans JP",sans-serif',
  noto:    '"Noto Sans JP","Hiragino Sans","Yu Gothic","Meiryo",sans-serif',
  sans:    'sans-serif',
  // 明朝体（システム）
  hiraMin: '"Hiragino Mincho ProN","ヒラギノ明朝 ProN W3","Yu Mincho","Noto Serif JP",serif',
  yumin:   '"Yu Mincho","游明朝","YuMincho","Hiragino Mincho ProN","Noto Serif JP",serif',
  notoser: '"Noto Serif JP","Hiragino Mincho ProN","Yu Mincho",serif',
  serif:   'serif',
  // 等幅
  mono:    '"Courier New",monospace',
  // カスタム（端末フォント）
  custom:  null
};
