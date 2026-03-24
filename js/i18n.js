const LOCALES = {
  ja: {
    // ── Static UI ──────────────────────────────────────────────
    preview:           'プレビュー',
    textCount:         'テキスト数',
    recording:         '録画',
    controlModal:      'プレビュー制御',
    settings:          '設定',
    save:              '保存',
    textLayers:        '文字レイヤー',
    textLayersHint:    '数字は自由入力。プレビュー上でドラッグして位置調整できます。',
    addText:           '文字を追加',
    close:             '閉じる',
    stopPreview:       'プレビュー停止',
    resumePreview:     'プレビュー再開',
    resetScroll:       'スクロール位置リセット',
    globalSettings:    '全体設定',
    canvasLED:         'キャンバス・LED',
    canvasLEDHint:     'サイズとLEDの大きさ',
    width:             '幅',
    height:            '高さ',
    bgColor:           '背景色',
    ledSize:           'LEDサイズ',
    ledGap:            'LED間隔',
    recordFps:         '録画FPS',
    recordDuration:    '録画秒数(自動)',
    saveModal:         '保存',
    saveImage:         '画像保存',
    savePng:           'PNG 保存',
    saveWebp:          'WebP 保存',
    saveVideo:         '動画保存',
    saveWebm:          'WebM 保存',
    saveMp4:           'MP4 保存',
    recordProgress:    '録画進捗',
    recordNote:        '録画中は開始から終了まで自動で進みます。MP4非対応ブラウザはWebMで保存されます。',
    // ── Status messages ────────────────────────────────────────
    statusPlaying:     'プレビュー再生中',
    statusPaused:      'プレビュー停止中',
    statusScrollReset: 'スクロール位置をリセットしました',
    statusLayerUpdated:    '設定を更新しました',
    statusLayerDeleted:    '文字を削除しました',
    statusLayerDuplicated: '文字を複製しました',
    statusLayerAdded:      '文字を追加しました',
    statusGlobalUpdated:   '全体設定を更新しました',
    statusDragging:        '文字をドラッグ中',
    statusPositionUpdated: '文字位置を更新しました',
    statusColorUpdated:    '色設定を更新しました',
    statusMovedFront:    '文字を最前面に移動しました',
    statusMovedBack:     '文字を最背面に移動しました',
    statusMovedForward:  '文字を一つ前へ移動しました',
    statusMovedBackward: '文字を一つ後ろへ移動しました',
    // ── Save / record ──────────────────────────────────────────
    generating:       '{0} を生成中...',
    generateFailed:   '{0} の生成に失敗しました。',
    saved:            '{0} を保存しました',
    recordingFor:     '{0} 用に {1} 秒録画中...',
    mp4Fallback:      'MP4非対応のため WebM で録画します...',
    saveFailed:       '保存に失敗しました',
    recordFailed:     '録画に失敗しました。',
    noMediaRecorder:  'このブラウザは MediaRecorder に対応していません。',
    noVideoRecord:    'このブラウザは動画録画に対応していません。',
    // ── Layer card ─────────────────────────────────────────────
    layerTitle:       '文字 {0}',
    layerOrder:       '表示順 {0}/{1}',
    toBack:           '最背面',
    backward:         '後ろへ',
    forward:          '前へ',
    toFront:          '最前面',
    duplicate:        '複製',
    delete:           '削除',
    textField:        'テキスト',
    textColor:        '文字色',
    fontSize:         '文字サイズ(px)',
    fontWeight:       'ウェイト',
    font:             'フォント',
    gothicSystem:     'ゴシック体（システム）',
    minchoSystem:     '明朝体（システム）',
    deviceFont:       '端末フォント（任意選択）',
    customFontLabel:  'フォント名（端末にインストール済みのもの）',
    customFontPlaceholder: '例: Helvetica Neue、游明朝',
    deviceFontOption: '端末フォントを指定…',
    xPos:             'X座標(px)',
    yPos:             'Y座標(px)',
    align:            '揃え',
    alignLeft:        '左',
    alignCenter:      '中央',
    alignRight:       '右',
    scroll:           '横スクロール',
    enabled:          '有効',
    blink:            '点滅',
    scrollSpeed:      'スクロール速度(px/s)',
    blinkMs:          '点滅間隔(ms)',
    outline:          '縁取り',
    outlineWidth:     '縁取り太さ(px)',
    outlineColor:     '縁取り色',
    durationSec:      '{0} 秒',
  },

  en: {
    // ── Static UI ──────────────────────────────────────────────
    preview:           'Preview',
    textCount:         'Texts',
    recording:         'Recording',
    controlModal:      'Playback',
    settings:          'Settings',
    save:              'Save',
    textLayers:        'Text Layers',
    textLayersHint:    'Enter any number directly. Drag text on the preview to reposition.',
    addText:           'Add Text',
    close:             'Close',
    stopPreview:       'Stop',
    resumePreview:     'Resume',
    resetScroll:       'Reset Scroll',
    globalSettings:    'Settings',
    canvasLED:         'Canvas & LED',
    canvasLEDHint:     'Canvas size and LED dot size',
    width:             'Width',
    height:            'Height',
    bgColor:           'Background',
    ledSize:           'LED Size',
    ledGap:            'LED Gap',
    recordFps:         'FPS',
    recordDuration:    'Duration (auto)',
    saveModal:         'Save',
    saveImage:         'Save Image',
    savePng:           'Save PNG',
    saveWebp:          'Save WebP',
    saveVideo:         'Save Video',
    saveWebm:          'Save WebM',
    saveMp4:           'Save MP4',
    recordProgress:    'Progress',
    recordNote:        'Recording runs automatically from start to end. Browsers without MP4 support will save as WebM.',
    // ── Status messages ────────────────────────────────────────
    statusPlaying:     'Playing',
    statusPaused:      'Paused',
    statusScrollReset: 'Scroll position reset',
    statusLayerUpdated:    'Settings updated',
    statusLayerDeleted:    'Text deleted',
    statusLayerDuplicated: 'Text duplicated',
    statusLayerAdded:      'Text added',
    statusGlobalUpdated:   'Settings updated',
    statusDragging:        'Dragging text',
    statusPositionUpdated: 'Position updated',
    statusColorUpdated:    'Color updated',
    statusMovedFront:    'Moved to front',
    statusMovedBack:     'Moved to back',
    statusMovedForward:  'Moved forward',
    statusMovedBackward: 'Moved backward',
    // ── Save / record ──────────────────────────────────────────
    generating:       'Generating {0}...',
    generateFailed:   'Failed to generate {0}.',
    saved:            '{0} saved',
    recordingFor:     'Recording {1}s for {0}...',
    mp4Fallback:      'MP4 not supported, recording as WebM...',
    saveFailed:       'Save failed',
    recordFailed:     'Recording failed.',
    noMediaRecorder:  'MediaRecorder is not supported in this browser.',
    noVideoRecord:    'Video recording is not supported in this browser.',
    // ── Layer card ─────────────────────────────────────────────
    layerTitle:       'Text {0}',
    layerOrder:       'Layer {0}/{1}',
    toBack:           'To Back',
    backward:         'Back',
    forward:          'Fwd',
    toFront:          'To Front',
    duplicate:        'Duplicate',
    delete:           'Delete',
    textField:        'Text',
    textColor:        'Color',
    fontSize:         'Font Size (px)',
    fontWeight:       'Weight',
    font:             'Font',
    gothicSystem:     'Gothic (System)',
    minchoSystem:     'Mincho (System)',
    deviceFont:       'Device Font (Optional)',
    customFontLabel:  'Font name (must be installed on this device)',
    customFontPlaceholder: 'e.g. Helvetica Neue, Georgia',
    deviceFontOption: 'Specify device font…',
    xPos:             'X (px)',
    yPos:             'Y (px)',
    align:            'Align',
    alignLeft:        'Left',
    alignCenter:      'Center',
    alignRight:       'Right',
    scroll:           'Scroll',
    enabled:          'On',
    blink:            'Blink',
    scrollSpeed:      'Speed (px/s)',
    blinkMs:          'Blink (ms)',
    outline:          'Outline',
    outlineWidth:     'Outline Width (px)',
    outlineColor:     'Outline Color',
    durationSec:      '{0} sec',
  }
};

export function getLang() {
  return localStorage.getItem('lang') === 'en' ? 'en' : 'ja';
}

export function setLang(lang) {
  localStorage.setItem('lang', lang);
}

export function t(key, params = {}) {
  const locale = LOCALES[getLang()] ?? LOCALES.ja;
  let str = locale[key] ?? LOCALES.ja[key] ?? key;
  Object.entries(params).forEach(([k, v]) => {
    str = str.replace(`{${k}}`, v);
  });
  return str;
}

export function applyI18n() {
  document.documentElement.lang = getLang();

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nLabel));
  });

  const btn = document.getElementById('langToggle');
  if (btn) btn.textContent = getLang() === 'ja' ? 'EN' : '日本語';
}
