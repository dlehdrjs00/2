/**
 * 검토용 대본 내보내기: 스토리 데이터 → docs/SCRIPT.md
 *   npm run export-script
 * 이름 치환·조사를 적용한 실제 표시 문장과 연출 지시, 선택지·분기 구조를 함께 출력한다.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Cond, Scene, Step } from '../src/engine/types';
import { resolveText } from '../src/engine/text';
import { validateStory } from '../src/engine/validate';
import { STORY, SCENE_ORDER } from '../src/story';
import { BACKGROUNDS, BGM, SFX } from '../src/story/assets';
import { CGS } from '../src/story/cg';
import { manifestChecker } from '../src/story/checker';
import { NAMES, SETTING, SPEAKER_NAMES, TEXT_VARS, DATES, ENDING_TITLES, GAME_TITLE } from '../src/story/config';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const t = (s: string) => resolveText(s, TEXT_VARS);
const H = { osana: NAMES.osana.given, tenko: NAMES.tenko.given } as const;
const EXPR_KO: Record<string, string> = { neutral: '기본', smile: '웃음', fluster: '당황', shy: '부끄러움', pout: '삐짐', sad: '쓸쓸' };
const POS_KO: Record<string, string> = { left: '왼쪽', center: '가운데', right: '오른쪽' };
const OUTFIT_KO: Record<string, string> = { uniform: '교복', yukata: '유카타' };
const HAIR_KO: Record<string, string> = { default: '기본 머리', ponytail: '포니테일' };
const ROUTE_KO: Record<string, string> = { common: '공통', osana: `${H.osana}(소꿉친구) 루트`, tenko: `${H.tenko}(전학생) 루트` };

const out: string[] = [];
const w = (s = '') => out.push(s);

const report = validateStory(STORY, manifestChecker((p) => existsSync(resolve(root, 'public', p))), TEXT_VARS);

w(`# 《${GAME_TITLE}》 대본 — 검토용`);
w();
w('> 이 문서는 `npm run export-script` 로 스토리 데이터(`src/story/scenes/*.ts`)에서 자동 생성된다. 직접 고치지 말고 장면 파일을 고친 뒤 다시 생성할 것.');
w(`> 이름·학교·날짜는 임시값(\`src/story/config.ts\`). 대괄호 안의 \`c1.010\` 같은 값은 문장 고유 id(저장·읽음 기록용).`);
w();
w('## 등장인물(임시 이름)');
w();
w(`- 주인공: ${NAMES.me.family} ${NAMES.me.given} — 2학년, 1인칭 화자(그림 없음)`);
w(`- 소꿉친구: ${NAMES.osana.family} ${NAMES.osana.given} — 츤데레, 유치원 때부터의 이웃`);
w(`- 전학생: ${NAMES.tenko.family} ${NAMES.tenko.given} — 세 번째 전학, 솔직하게 다가가는 성격`);
w(`- 무대: ${SETTING.school} ${SETTING.classroom}, ${SETTING.town} 동네 / 본편 ${DATES.d1} ~ ${DATES.r5}, 후일담 ${DATES.fest} ${SETTING.festival}`);
w();

// ---- 분기 구조 ----
w('## 분기 구조');
w();
const commonChoices = SCENE_ORDER.map((id) => STORY.scenes[id])
  .filter((s) => s.route === 'common')
  .flatMap((s) => s.steps.filter((x): x is Extract<Step, { t: 'choice' }> => x.t === 'choice').map((c) => ({ scene: s, c })));
w('```mermaid');
w('flowchart TD');
const sceneNodes = SCENE_ORDER.map((id) => STORY.scenes[id]);
for (const s of sceneNodes) w(`  ${s.id}["${s.id}<br/>${t(s.title).replace(/"/g, "'")}"]`);
for (const s of sceneNodes) {
  for (const st of s.steps) {
    if (st.t === 'jump') w(`  ${s.id} --> ${st.scene}`);
    if (st.t === 'routeBranch') {
      w(`  ${s.id} -->|"${H.osana} 루트"| ${st.scenes.osana}`);
      w(`  ${s.id} -->|"${H.tenko} 루트"| ${st.scenes.tenko}`);
    }
    if (st.t === 'ending') w(`  ${s.id} --> END_${st.ending}(("${H[STORY.endings[st.ending].heroine]} 엔딩<br/>${t(STORY.endings[st.ending].title)}"))`);
  }
}
w('```');
w();
w('### 공통 선택지와 루트 결정');
w();
w('| 선택지 | 상황(대사창) | 옵션 | 점수 |');
w('|---|---|---|---|');
for (const { c } of commonChoices) {
  c.options.forEach((o, i) => {
    w(`| ${i === 0 ? `\`${c.id}\`` : ''} | ${i === 0 ? t(c.prompt ?? '') : ''} | ${o.id}: ${t(o.text)} | ${o.heroine ? `${H[o.heroine]} +${o.points ?? 1}` : '-'} |`);
  });
}
w();
w('루트 결정 규칙(`src/engine/runner.ts` decideRoute):');
w(`1. 공통 선택지의 누적 점수가 높은 히로인 루트`);
w(`2. 동점이면 **가장 최근에 고른 히로인 관련 선택**의 히로인 (현재 구성에서는 사실상 마지막 선택지)`);
w(`3. 루트 확정 후에는 점수가 바뀌지 않고 다른 루트 장면으로 넘어가지 않는다(검증기·테스트로 확인)`);
w();
if (report.paths.length) {
  const byRoute = { osana: 0, tenko: 0 } as Record<string, number>;
  for (const p of report.paths) byRoute[p.route ?? '-'] = (byRoute[p.route ?? '-'] ?? 0) + 1;
  w(`선택 조합 ${report.paths.length}개 → ${H.osana} 루트 ${byRoute.osana}개, ${H.tenko} 루트 ${byRoute.tenko}개.`);
  w();
  w('| 선택 조합 (' + commonChoices.map(({ c }) => c.id).join(' / ') + ') | 결과 |');
  w('|---|---|');
  const seen = new Set<string>();
  for (const p of report.paths) {
    const key = p.choices
      .filter((c) => commonChoices.some(({ c: cc }) => cc.id === c.choice))
      .map((c) => `${c.option}(${c.heroine ? H[c.heroine] : '-'})`)
      .join(' / ');
    if (seen.has(key)) continue;
    seen.add(key);
    w(`| ${key} | ${p.route ? H[p.route] : '-'} 루트 |`);
  }
  w();
  const stats = (route: string) => {
    const ps = report.paths.filter((p) => p.route === route);
    const avg = (f: (p: (typeof ps)[number]) => number) => Math.round(ps.reduce((a, p) => a + f(p), 0) / Math.max(1, ps.length));
    const main = avg((p) => p.mainChars);
    const epi = avg((p) => p.epilogueChars);
    return `본편 약 ${avg((p) => p.mainLines)}문장·${main}자(≈${(main / 550).toFixed(1)}~${(main / 380).toFixed(1)}분), 후일담 약 ${avg((p) => p.epilogueLines)}문장·${epi}자(≈${(epi / 550).toFixed(1)}~${(epi / 380).toFixed(1)}분)`;
  };
  w(`- ${H.osana} 루트: ${stats('osana')}`);
  w(`- ${H.tenko} 루트: ${stats('tenko')}`);
  w('- 추정 시간은 1분당 380~550자 읽기 기준(클릭·글자 표시 포함 대략치).');
  w();
}

// ---- 대본 ----
w('## 대본');
w();
let lastHead = '';
for (const id of SCENE_ORDER) {
  const s = STORY.scenes[id];
  const head = `${ROUTE_KO[s.route]}${s.part === 'epilogue' ? ' — 여름 축제 후일담' : s.route === 'common' ? '' : ' — 본편'}`;
  if (head !== lastHead) {
    w('---');
    w();
    w(`## ${head}`);
    w();
    lastHead = head;
  }
  writeScene(s);
}

function writeScene(s: Scene) {
  w(`### \`${s.id}\` ${t(s.title)}`);
  w();
  for (const st of s.steps) {
    const line = fmt(st);
    if (line !== null) w(line);
  }
  w();
}

function fmtCond(c: Cond): string {
  if ('choice' in c) return `선택지 ${c.choice} 에서 '${c.is}' 를 골랐다면`;
  if ('flag' in c) return `플래그 ${c.flag} = ${String(c.eq)} 이면`;
  if ('route' in c) return `${H[c.route]} 루트이면`;
  if ('not' in c) return `다음이 아니면: ${fmtCond(c.not)}`;
  if ('all' in c) return c.all.map(fmtCond).join(' 그리고 ');
  return c.any.map(fmtCond).join(' 또는 ');
}

function fmt(st: Step): string | null {
  switch (st.t) {
    case 'say': {
      const text = t(st.text);
      if (st.who === null) return `- *(독백)* ${text} \`${st.id}\``;
      const name = st.label ? t(st.label) : SPEAKER_NAMES[st.who];
      const ex = st.expr ? ` (${EXPR_KO[st.expr]})` : '';
      return `- **${name}**${ex}: ${text} \`${st.id}\``;
    }
    case 'card':
      return `- 🎬 **[암전 카드]** ${t(st.text)}${st.sub ? ` — ${t(st.sub)}` : ''} \`${st.id}\``;
    case 'choice': {
      const lines = [`- ❓ **선택지** \`${st.id}\`${st.prompt ? ` — ${t(st.prompt)}` : ''}`];
      for (const o of st.options) {
        lines.push(
          `  - **${o.id}**: ${t(o.text)}${o.heroine ? ` 〔${H[o.heroine]} +${o.points ?? 1}〕` : ''}${o.goto ? ` → \`${o.goto}\`` : ''}`,
        );
      }
      return lines.join('\n');
    }
    case 'bg':
      return `- 〔배경: ${BACKGROUNDS[st.bg]?.desc ?? st.bg}${st.fx && st.fx !== 'fade' ? ` / 전환: ${st.fx}` : ''}〕`;
    case 'show': {
      const name = H[st.char];
      const parts = [st.pos && POS_KO[st.pos], st.outfit && OUTFIT_KO[st.outfit], st.hair && HAIR_KO[st.hair], st.expr && EXPR_KO[st.expr]].filter(Boolean);
      return `- 〔${name}: ${parts.join(', ') || '표시'}〕`;
    }
    case 'hide':
      return `- 〔퇴장: ${st.char === 'all' ? '모두' : H[st.char]}〕`;
    case 'bgm':
      return `- 〔음악: ${st.track ? BGM[st.track].desc : '정지'}〕`;
    case 'sfx':
      return `- 〔효과음: ${SFX[st.sound].desc}〕`;
    case 'cg':
      return st.cg ? `- 🖼 **[이벤트 CG: ${CGS[st.cg].title}]** ${CGS[st.cg].desc}` : '- 〔이벤트 CG 걷기〕';
    case 'fx':
      return `- 〔화면 효과: ${st.fx === 'shake' ? '흔들림' : '번쩍임'}〕`;
    case 'place':
      return `- 📍 ${t(st.text)}`;
    case 'set':
      return `- 〔상태 변경: ${st.effects.map((e) => ('flag' in e ? `${e.flag}=${String(e.value)}` : `${H[e.add]} +${e.n}`)).join(', ')}〕`;
    case 'label':
      return `- ⚑ \`${st.id}\``;
    case 'if':
      return `- ↪ ${fmtCond(st.cond)} → \`${st.goto}\``;
    case 'goto':
      return `- ↪ \`${st.to}\` 로 이동`;
    case 'jump':
      return `- ⏭ 다음 장면: \`${st.scene}\``;
    case 'decideRoute':
      return `- ⚖ **루트 결정** (누적 선택 기준)`;
    case 'routeBranch':
      return `- ⏭ ${H.osana} 루트 → \`${st.scenes.osana}\` / ${H.tenko} 루트 → \`${st.scenes.tenko}\``;
    case 'ending':
      return `- 🏁 **엔딩: ${H[STORY.endings[st.ending].heroine]} — 「${t(STORY.endings[st.ending].title)}」** \`${st.id}\``;
    default:
      return null;
  }
}

w('---');
w();
w(`엔딩 제목(임시): ${H.osana} 「${ENDING_TITLES.osana}」 / ${H.tenko} 「${ENDING_TITLES.tenko}」`);
if (report.errors.length) {
  w();
  w('> ⚠ 이 대본은 검증 오류가 있는 상태에서 생성되었습니다:');
  for (const e of report.errors) w(`> - ${e}`);
}

mkdirSync(resolve(root, 'docs'), { recursive: true });
writeFileSync(resolve(root, 'docs/SCRIPT.md'), out.join('\n') + '\n');
console.log(`docs/SCRIPT.md 생성 (${out.length}줄)${report.errors.length ? ` — 검증 오류 ${report.errors.length}건 포함` : ''}`);
