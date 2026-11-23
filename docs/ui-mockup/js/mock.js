/* 최종안 목업 스크립트: layout.ts 에 넣을 새 배치 공식 + 빠른 메뉴 탭 생성 + 빛망울 + 슬라이더 채움 */
(function () {
  'use strict';
  var ASPECT = 16 / 9;
  var MIN_FONT = 16;
  var TEXT_PAD_EM = 0.95 + 0.6;
  var TEXT_LINE_EM = 1.62;
  var CHOICE_CLEAR = 4;
  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }
  function textBoxHeightFor(lines, fs) {
    return fs * (TEXT_PAD_EM + TEXT_LINE_EM * lines) + 2 + 0.5;
  }
  /**
   * docs/UI_DESIGN.md 7장. 이름표 탭(왼쪽)과 빠른 메뉴 탭(오른쪽)이 대사창 위 테두리에 붙어 같은 높이 띠(btn)를 나눠 쓴다.
   * 선택지 영역 = 무대 위 여백 ~ 그 띠 위.
   */
  function computeLayout(vw, vh, safe, scale) {
    scale = scale || 1;
    var aw = Math.max(1, vw - safe.l - safe.r);
    var ah = Math.max(1, vh - safe.t - safe.b);
    var L;
    if (aw / ah >= 1.3) {
      var sw = aw;
      var sh = aw / ASPECT;
      if (sh > ah) {
        sh = ah;
        sw = ah * ASPECT;
      }
      var sx = safe.l + (aw - sw) / 2;
      var sy = safe.t + (ah - sh) / 2;
      var fs = clamp(sh * 0.034 * scale, MIN_FONT * scale, 26 * scale);
      var m = Math.max(8, sh * 0.022);
      var th = clamp(Math.max(sh * 0.22, textBoxHeightFor(3, fs)), 0, sh * 0.45);
      var tw = Math.min(sw - m * 2, fs * 46);
      var tx = sx + (sw - tw) / 2;
      var ty = sy + sh - th - m;
      var btn = clamp(fs * 1.75, 40, 44);
      var hy = ty - btn;
      var cy = sy + m;
      var ch = Math.max(0, hy - CHOICE_CLEAR - cy);
      var wide = aw - sw > 2;
      L = { mode: 'overlay', sx: sx, sy: sy, sw: sw, sh: sh, tx: tx, ty: ty, tw: tw, th: th, fs: fs, m: m, btn: btn, hy: hy, cx: wide ? safe.l + m : sx, cy: cy, cw: wide ? aw - m * 2 : sw, ch: ch };
    } else {
      var fs2 = clamp(aw * 0.042 * scale, MIN_FONT * scale, 22 * scale);
      var btn2 = clamp(fs2 * 1.75, 40, 44);
      var gap = btn2 + 8; // 무대와 대사창 사이: 8px + 이름표·빠른 메뉴 탭 띠
      var sw2 = aw;
      var sh2 = sw2 / ASPECT;
      var minTh = fs2 * 7.2;
      if (sh2 + gap + minTh > ah) {
        sh2 = Math.max(ah * 0.45, ah - gap - minTh);
        sw2 = sh2 * ASPECT;
      }
      var th2 = clamp(ah - sh2 - gap - 10, minTh, fs2 * 10);
      var total = sh2 + gap + th2;
      var sx2 = safe.l + (aw - sw2) / 2;
      var sy2 = safe.t + Math.max(0, (ah - total) / 2);
      var tw2 = Math.min(aw - 16, fs2 * 40);
      var ty2 = sy2 + sh2 + gap;
      var hy2 = ty2 - btn2;
      L = { mode: 'below', sx: sx2, sy: sy2, sw: sw2, sh: sh2, tx: safe.l + (aw - tw2) / 2, ty: ty2, tw: tw2, th: th2, fs: fs2, m: 8, btn: btn2, hy: hy2, cx: safe.l + 8, cy: sy2 + 8, cw: aw - 16, ch: Math.max(0, hy2 - CHOICE_CLEAR - sy2 - 8) };
    }
    // 빠른 메뉴 탭 오른쪽 = 대사창 오른쪽 끝에서 fs×0.55(창 모서리 반경) + 10px(탭 아래 오목한 이음새 폭) 안쪽
    L.hr = vw - (L.tx + L.tw) + L.fs * 0.55 + 10;
    L.qm = L.tw >= 900 ? 'icons' : L.tw >= 620 ? 'full' : 'compact';
    return L;
  }
  function applyLayout(root, L) {
    var s = root.style;
    function px(v) {
      return Math.round(v * 100) / 100 + 'px';
    }
    ['sx', 'sy', 'sw', 'sh', 'tx', 'ty', 'tw', 'th', 'cx', 'cy', 'cw', 'ch', 'fs', 'm', 'btn', 'hy', 'hr'].forEach(function (k) {
      s.setProperty('--' + k, px(L[k]));
    });
    root.dataset.layout = L.mode;
    root.dataset.qm = L.qm;
  }

  // [data-q, 글자, 묶음, 아이콘, title, aria-label]
  var Q = [
    ['log', '기록', 'hud', '--i-log', '대화 기록 (L)'],
    ['auto', '자동', 'hud', '--i-auto', '자동 진행 (A)'],
    ['skip', '스킵', 'hud', '--i-skip', '읽은 대사 건너뛰기 (S)'],
    ['qsave', '퀵저장', 'extra', '--i-qsave', '빠른 저장 (F5)', '빠른 저장'],
    ['qload', '퀵로드', 'extra', '--i-qload', '빠른 불러오기 (F9)', '빠른 불러오기'],
    ['hide', '숨기기', 'extra', '--i-hide', '대사창 숨기기 (H)', '대사창 숨기기'],
    ['config', '설정', 'extra', '--i-config', '설정'],
    ['menu', '메뉴', 'hud', '--i-menu', '메뉴 (Esc)'],
  ];
  function buildQbar(q) {
    var state = q.dataset.state || '';
    var hud = document.createElement('div');
    hud.className = 'hud';
    hud.dataset.noadvance = '';
    var extra = document.createElement('div');
    extra.className = 'qbar-extra';
    Q.forEach(function (d) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'hud-btn';
      b.dataset.q = d[0];
      b.title = d[4];
      if (d[5]) b.setAttribute('aria-label', d[5]);
      if (d[0] === 'auto' || d[0] === 'skip') b.setAttribute('aria-pressed', String(state === d[0]));
      var i = document.createElement('span');
      i.className = 'ico';
      i.setAttribute('aria-hidden', 'true');
      i.style.setProperty('--i', 'var(' + d[3] + ')');
      b.append(i, d[1]);
      (d[2] === 'hud' ? hud : extra).append(b);
    });
    q.append(hud, extra);
  }

  // 결정적 난수(스크린샷이 매번 같게)
  function rng(seed) {
    var x = seed * 9301 + 49297;
    return function () {
      x = (x * 9301 + 49297) % 233280;
      return x / 233280;
    };
  }
  function buildMotes(m) {
    var n = Number(m.dataset.n || 12);
    var r = rng(Number(m.dataset.seed || 1));
    var night = !!m.dataset.night;
    var soft = !!m.dataset.soft;
    var colors = night
      ? ['rgba(255,227,161,.6)', 'rgba(255,190,215,.55)', 'rgba(170,210,255,.55)']
      : ['rgba(200,232,255,.6)', 'rgba(255,214,230,.55)', 'rgba(255,240,200,.6)'];
    for (var k = 0; k < n; k++) {
      var i = document.createElement('i');
      var glint = r() < (night ? 0.4 : 0.28);
      var size = glint ? 6 + r() * 10 : (soft ? 10 : 8) + r() * (soft ? 26 : 34);
      if (glint) i.className = 'glint';
      i.style.cssText =
        '--x:' + (r() * 100).toFixed(1) + '%;--y:' + (soft ? r() * 55 : r() * 92).toFixed(1) + '%;--s:' + size.toFixed(0) + 'px;' +
        '--o:' + (soft ? 0.25 + r() * 0.35 : 0.35 + r() * 0.5).toFixed(2) + ';--b:' + (glint ? 0 : r() * 2.5).toFixed(1) + 'px;' +
        '--c:' + colors[k % 3] + ';--d:' + (8 + r() * 10).toFixed(1) + 's;--dl:' + (-r() * 10).toFixed(1) + 's;--dx:' + (r() * 30 - 15).toFixed(0) + 'px';
      m.append(i);
    }
  }

  function relayout() {
    document.querySelectorAll('.screen').forEach(function (sec) {
      var vn = sec.querySelector('.vn');
      if (!vn) return;
      applyLayout(vn, computeLayout(sec.clientWidth, sec.clientHeight, { t: 0, r: 0, b: 0, l: 0 }));
    });
  }

  var q = new URLSearchParams(location.search);
  var only = q.get('s');
  if (only) {
    document.body.classList.add('single');
    var sec = document.querySelector('.screen[data-screen="' + only + '"]');
    if (sec) sec.classList.add('show');
  } else document.body.classList.add('gallery');
  // 인라인 style 의 --bg: url(상대경로) 는 CSS 파일 기준으로 풀리므로 문서 기준 절대 경로로 바꾼다(목업 전용)
  document.querySelectorAll('[style*="--bg"]').forEach(function (el) {
    var v = el.style.getPropertyValue('--bg');
    var mm = /url\((['"]?)([^'")]+)\1\)/.exec(v);
    if (mm) el.style.setProperty('--bg', 'url("' + new URL(mm[2], document.baseURI).href + '")');
  });
  document.querySelectorAll('.qbar').forEach(buildQbar);
  document.querySelectorAll('.motes').forEach(buildMotes);
  document.querySelectorAll('input[type=range]').forEach(function (inp) {
    function upd() {
      inp.style.setProperty('--p', ((inp.value - inp.min) / (inp.max - inp.min)) * 100 + '%');
    }
    inp.addEventListener('input', upd);
    upd();
  });
  relayout();
  document.querySelectorAll('.panel-body.log').forEach(function (b) {
    b.scrollTop = b.scrollHeight;
  });
  window.addEventListener('resize', relayout);
  window.__mock = { computeLayout: computeLayout };
})();
