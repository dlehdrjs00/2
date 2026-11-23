/**
 * 에셋 목록 문서 생성: 매니페스트 → docs/ASSETS.md
 *   npm run export-assets
 * 현재 연결된 파일(임시/최종 여부, 존재 여부, 크기)과 최종 에셋 권장 규격을 함께 출력한다.
 */
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKGROUNDS, BGM, SFX, SPRITE_SETS, spriteFile } from '../src/story/assets';
import { NAMES } from '../src/story/config';
import { STORY } from '../src/story';
import type { Step } from '../src/engine/types';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out: string[] = [];
const w = (s = '') => out.push(s);
const EXPR_KO: Record<string, string> = { neutral: '기본', smile: '웃음', fluster: '당황', shy: '부끄러움', pout: '삐짐', sad: '쓸쓸' };

function fileInfo(p?: string) {
  if (!p) return { mark: '—', size: '' };
  const abs = resolve(root, 'public', p);
  if (!existsSync(abs)) return { mark: '❌ 없음', size: '' };
  const kb = statSync(abs).size / 1024;
  return { mark: '✅', size: `${kb < 10 ? kb.toFixed(1) : Math.round(kb)}KB` };
}

// 대본에서 실제로 쓰이는 에셋
const used = { bg: new Set<string>(), bgm: new Set<string>(), sfx: new Set<string>(), look: new Set<string>() };
for (const s of Object.values(STORY.scenes)) {
  for (const st of s.steps as Step[]) {
    if (st.t === 'bg') used.bg.add(st.bg);
    if (st.t === 'bgm' && st.track) used.bgm.add(st.track);
    if (st.t === 'sfx') used.sfx.add(st.sound);
  }
}
used.bg.add('title');
used.bgm.add('title');

w('# 에셋 목록과 교체 규격');
w();
w('> `npm run export-assets` 로 `src/story/assets.ts` 매니페스트에서 자동 생성. 파일 존재 여부와 크기는 생성 시점 기준.');
w('> **현재 연결된 그림·음악은 모두 개발용 임시 에셋**이다(코드로 그린 SVG, 코드로 합성한 음원). 완성된 일러스트·음악이 아니다.');
w();
w('## 교체 방법');
w();
w('1. 최종 파일을 `public/assets/` 아래(예: `public/assets/char/osana/`, `public/assets/bg/`, `public/assets/audio/`)에 넣는다.');
w('2. `src/story/assets.ts` 에서 경로를 바꾸고 `placeholder: false` 로 바꾼다.');
w('   - 캐릭터: `SPRITE_SETS.<캐릭터>.dir` 과 `ext` 만 바꾸면 된다(파일명 규칙 `${outfit}_${hair}_${expr}.${ext}` 유지).');
w('   - 배경·음악·효과음: 항목별 `src` 를 바꾼다.');
w('3. `npm run validate` 로 누락 파일을 확인한다(없는 파일은 오류로 표시됨).');
w('4. 모든 에셋이 최종으로 바뀌면 타이틀의 "임시 에셋" 표시가 자동으로 사라진다.');
w();

w('## 캐릭터 스프라이트');
w();
w('권장 규격(최종): **PNG 또는 WebP(알파 채널)**, 세로 **2400px 이상**(가로 약 1600px, 2:3 비율), 머리 위 여백 약 5%, 허벅지 중간에서 잘린 반신.');
w('얼굴 위치·크기를 표정끼리 픽셀 단위로 맞출 것(표정 교체 시 흔들림 방지). 화면 높이의 약 96%로 하단 정렬되어 표시된다. 파일당 600KB 이하 권장(WebP).');
w();
for (const [char, set] of Object.entries(SPRITE_SETS)) {
  const who = char === 'osana' ? `${NAMES.osana.given}(소꿉친구)` : `${NAMES.tenko.given}(전학생)`;
  w(`### ${who} — ${set.placeholder ? '🟡 임시' : '🟢 최종'} (\`${set.dir}\`)`);
  w();
  w('| 의상/헤어 | 표정 | 파일 | 상태 | 크기 |');
  w('|---|---|---|---|---|');
  for (const look of set.looks) {
    for (const e of set.expressions) {
      const p = spriteFile(set, look.outfit, look.hair, e);
      const f = fileInfo(p);
      w(`| ${look.desc} | ${EXPR_KO[e]}(${e}) | \`${p.split('/').pop()}\` | ${f.mark} | ${f.size} |`);
    }
  }
  w();
}

w('## 배경');
w();
w('권장 규격(최종): **1920×1080 이상 16:9**(가능하면 2560×1440), WebP/JPEG, 파일당 800KB 이하. 좌우 5%가 잘려도 되게, 화면 아래 30%는 대사창이 반투명하게 덮는다.');
w();
w('| id | 설명 | 사용 | 현재 파일 | 구분 | 상태 | 크기 |');
w('|---|---|---|---|---|---|---|');
for (const [id, a] of Object.entries(BACKGROUNDS)) {
  const f = fileInfo(a.src);
  w(`| \`${id}\` | ${a.desc} | ${used.bg.has(id) ? '○' : '-'} | ${a.src ? `\`${a.src}\`` : `단색 ${a.color}`} | ${a.src ? (a.placeholder ? '🟡 임시' : '🟢 최종') : '-'} | ${f.mark} | ${f.size} |`);
}
w();

w('## 음악(BGM)');
w();
w('권장 규격(최종): **MP3(128~192kbps) 또는 M4A/AAC**, 44.1kHz 스테레오, 1~2분 루프(끝과 시작이 이어지게), 피크 -1dBFS. Ogg 만 쓰면 일부 iOS 에서 재생되지 않을 수 있다.');
w();
w('| id | 분위기 | 사용 | 현재 파일 | 구분 | 상태 | 크기 |');
w('|---|---|---|---|---|---|---|');
for (const [id, a] of Object.entries(BGM)) {
  const f = fileInfo(a.src);
  w(`| \`${id}\` | ${a.desc} | ${used.bgm.has(id) ? '○' : '-'} | \`${a.src}\` | ${a.placeholder ? '🟡 임시' : '🟢 최종'} | ${f.mark} | ${f.size} |`);
}
w();
w('## 효과음(SFX)');
w();
w('권장 규격(최종): MP3/M4A 모노 96~128kbps, 앞쪽 무음 없이 바로 시작, 0.2~4초.');
w();
w('| id | 설명 | 사용 | 현재 파일 | 구분 | 상태 | 크기 |');
w('|---|---|---|---|---|---|---|');
for (const [id, a] of Object.entries(SFX)) {
  const f = fileInfo(a.src);
  w(`| \`${id}\` | ${a.desc} | ${used.sfx.has(id) || id === 'select' ? '○' : '-'} | \`${a.src}\` | ${a.placeholder ? '🟡 임시' : '🟢 최종'} | ${f.mark} | ${f.size} |`);
}
w();
w('## 아직 없는(선택) 에셋');
w();
w(`- ${NAMES.osana.given} 잠옷·마스크 차림(감기 장면): 현재는 그림 없이 문틈 대화와 서술로 처리.`);
w('- 이벤트 CG(우산 장면, 고백 장면, 둘이 찍힌 즉석사진 등): 첫 버전 범위 밖. 추가 시 엔진에 CG 표시 명령을 붙이면 된다.');
w('- 주인공 그림: 기획상 없음.');
w('- 사복: 본편 일정을 방과 후 중심으로 짜서 필요 없게 함.');

writeFileSync(resolve(root, 'docs/ASSETS.md'), out.join('\n') + '\n');
console.log(`docs/ASSETS.md 생성 (${out.length}줄)`);
