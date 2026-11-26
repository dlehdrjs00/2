/**
 * 검토용 대본 내보내기: 스토리 데이터 → docs/SCRIPT.md
 *   npm run export-script
 * 이름 치환·조사를 적용한 실제 표시 문장과 연출 지시, 선택지·분기 구조를 함께 출력한다.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChoiceOption, Cond, EndingDef, EndingId, EndingKind, HeroineId, RouteId, Scene, Step } from '../src/engine/types';
import { ROUTES } from '../src/engine/types';
import { resolveText } from '../src/engine/text';
import { EXPECTED_BRANCHING, validateStory } from '../src/engine/validate';
import { STORY, SCENE_ORDER } from '../src/story';
import { BACKGROUNDS, BGM, SFX } from '../src/story/assets';
import { CGS } from '../src/story/cg';
import { manifestChecker } from '../src/story/checker';
import { NAMES, SETTING, SPEAKER_NAMES, TEXT_VARS, DATES, ENDING_TITLES, GAME_TITLE } from '../src/story/config';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const t = (s: string) => resolveText(s, TEXT_VARS);
const H: Record<HeroineId, string> = { osana: NAMES.osana.given, tenko: NAMES.tenko.given, koharu: NAMES.koharu.given };
const EXPR_KO: Record<string, string> = { neutral: '기본', smile: '웃음', fluster: '당황', shy: '부끄러움', pout: '삐짐', sad: '쓸쓸' };
const POS_KO: Record<string, string> = { left: '왼쪽', center: '가운데', right: '오른쪽' };
const OUTFIT_KO: Record<string, string> = { uniform: '교복', casual: '사복', yukata: '유카타' };
const HAIR_KO: Record<string, string> = { default: '기본 머리', ponytail: '포니테일' };
/** 루트 이름(히든 루트 'group' 은 세 사람과 함께하는 '네 사람') */
const R: Record<RouteId, string> = { ...H, group: '네 사람' };
const ROUTE_KO: Record<string, string> = {
  common: '공통',
  osana: `${H.osana}(소꿉친구) 루트`,
  tenko: `${H.tenko}(전학생) 루트`,
  koharu: `${H.koharu}(숨은 후배) 루트`,
  group: `${R.group}(히든) 루트`,
};
/** 결말 갈래 */
const KIND_KO: Record<EndingKind, string> = { festival: '축제 쪽', daily: '일상 쪽' };
/** 엔딩 정의 순서(STORY.endings 선언 순서) */
const ENDINGS: EndingDef[] = Object.values(STORY.endings);
/** '아카네 축제 쪽 엔딩' 같은 엔딩 이름 */
const endingName = (id: EndingId) => `${R[STORY.endings[id].route]} ${KIND_KO[STORY.endings[id].kind]} 엔딩`;

const out: string[] = [];
const w = (s = '') => out.push(s);

const report = validateStory(STORY, manifestChecker((p) => existsSync(resolve(root, 'public', p))), TEXT_VARS, { expect: EXPECTED_BRANCHING });

w(`# 《${GAME_TITLE}》 대본 — 검토용`);
w();
w('> 이 문서는 `npm run export-script` 로 스토리 데이터(`src/story/scenes/*.ts`)에서 자동 생성된다. 직접 고치지 말고 장면 파일을 고친 뒤 다시 생성할 것.');
w(`> 이름·학교·날짜는 임시값(\`src/story/config.ts\`). 줄 끝의 \`c1.010\` 같은 값은 문장 고유 id(저장·읽음 기록용).`);
w('> 🖼 **[이벤트 CG]** 줄부터 그 CG 가 화면 가득 떠 있다. `〔이벤트 CG 걷기〕` 또는 배경 전환(자동으로 걷힘)에서 사라진다. CG 파일·표시 구간 목록은 `docs/ASSETS.md`.');
w();
w('## 등장인물(임시 이름)');
w();
w(`- 주인공: ${NAMES.me.family} ${NAMES.me.given} — 2학년, 1인칭 화자(그림 없음)`);
w(`- 소꿉친구: ${NAMES.osana.family} ${NAMES.osana.given} — 츤데레, 유치원 때부터의 이웃`);
w(`- 전학생: ${NAMES.tenko.family} ${NAMES.tenko.given} — 세 번째 전학, 솔직하게 다가가는 성격`);
w(`- 숨은 후배: ${NAMES.koharu.family} ${NAMES.koharu.given} — 1학년, 상점가 문구점 집 딸. 금요일 하교 때 두 히로인 점수 차가 1 이하인 플레이에서만 등장`);
w(
  `- 무대: ${SETTING.school} ${SETTING.classroom}, ${SETTING.town} 동네 / 공통 ${DATES.d1} ~ ${DATES.r1} 방과 후, 루트 본편 ${DATES.r1} ~ ${DATES.r5}` +
    ` → 결말 갈래 선택. 축제 쪽 ${DATES.fest} ${SETTING.festival}(${H.koharu} 루트는 ${DATES.aug4} ~ ${DATES.aug9}),` +
    ` 일상 쪽 ${DATES.n1} ~ ${DATES.n5}(${R.group} 루트는 여름방학 중 ~ ${DATES.term2})`,
);
w();

// ---- 분기 구조 ----
w('## 분기 구조');
w();
const commonChoices = SCENE_ORDER.map((id) => STORY.scenes[id])
  .filter((s) => s.route === 'common')
  .flatMap((s) => s.steps.filter((x): x is Extract<Step, { t: 'choice' }> => x.t === 'choice').map((c) => ({ scene: s, c })));
/** 루트 결정 스텝 전부(장면 순서). 발견 새 흐름·미발견·구저장 경로가 각자 하나씩 쓴다 */
const DECIDES = SCENE_ORDER.flatMap((id) =>
  STORY.scenes[id].steps.filter((x): x is Extract<Step, { t: 'decideRoute' }> => x.t === 'decideRoute').map((d) => ({ scene: id, d })),
);
/** 초반 선택 순서(해금 판정 전, 모든 decideRoute.order 의 공통 앞부분). 없으면 공통 선택지 순서 */
const ROUTE_ORDER: string[] = DECIDES[0]?.d.order ?? commonChoices.map(({ c }) => c.id);
/** 옵션의 점수 효과(개인 선택 + effects 의 가산) */
function fmtScore(o: ChoiceOption): string {
  const parts: string[] = [];
  if (o.heroine) parts.push(`${H[o.heroine]} +${o.points ?? 1}`);
  for (const e of o.effects ?? []) parts.push('add' in e ? `${H[e.add]} +${e.n}` : `${e.flag}=${String(e.value)}`);
  const together = !o.heroine && o.effects?.some((e) => 'add' in e);
  return (parts.join(', ') || '-') + (together ? ' (함께 · 동점 처리에서 건너뜀)' : '');
}
/** 선택 기록(선택지 id, 옵션 id)만으로 점수를 합산(문서 표시용) */
function scoreOf(picks: ReadonlyArray<readonly [string, string]>): Record<HeroineId, number> {
  const pts = { osana: 0, tenko: 0, koharu: 0 } as Record<HeroineId, number>;
  for (const [cid, oid] of picks) {
    const o = commonChoices.find(({ c }) => c.id === cid)?.c.options.find((x) => x.id === oid);
    if (!o) continue;
    if (o.heroine) pts[o.heroine] += o.points ?? 1;
    for (const e of o.effects ?? []) if ('add' in e) pts[e.add] += e.n;
  }
  return pts;
}
/** 옵션이 보이는 조건(표시용) */
function visLabel(c: Cond | undefined): string {
  if (!c) return '항상';
  if ('flag' in c && c.flag === 'kh.met' && c.eq === true) return `${H.koharu} 등장 시`;
  if ('not' in c && 'flag' in c.not && c.not.flag === 'kh.met' && c.not.eq === true) return `${H.koharu} 미등장 시`;
  return fmtCond(c);
}
w('```mermaid');
w('flowchart TD');
const sceneNodes = SCENE_ORDER.map((id) => STORY.scenes[id]);
for (const s of sceneNodes) w(`  ${s.id}["${s.id}<br/>${t(s.title).replace(/"/g, "'")}"]`);
for (const s of sceneNodes) {
  for (const st of s.steps) {
    if (st.t === 'jump') w(`  ${s.id} --> ${st.scene}`);
    if (st.t === 'routeBranch') {
      for (const r of ROUTES) if (st.scenes[r]) w(`  ${s.id} -->|"${R[r]} 루트"| ${st.scenes[r]}`);
    }
    if (st.t === 'ending') w(`  ${s.id} --> END_${st.ending}(("${endingName(st.ending)}<br/>${t(STORY.endings[st.ending].title)}"))`);
  }
}
w('```');
w();
w('### 공통 선택지와 루트 결정');
w();
w('| 선택지 | 상황(대사창) | 옵션 | 보이는 조건 | 점수 |');
w('|---|---|---|---|---|');
for (const { c } of commonChoices) {
  c.options.forEach((o, i) => {
    w(
      `| ${i === 0 ? `\`${c.id}\`` : ''} | ${i === 0 ? t(c.prompt ?? '') : ''} | ${o.id}: ${t(o.text)} | ${visLabel(o.visibleIf)} | ${fmtScore(o)} |`,
    );
  });
}
w();
w('숨은 등장 판정(`src/engine/runner.ts` applyUnlock, `c7.join` 종소리 직후 1회):');
w(`- ${H.osana}·${H.tenko} 점수 차가 1 이하면 플래그 \`kh.met\` = true, ${H.koharu} 시작 점수 = 두 점수의 평균(0.5 단위 그대로). 아니면 false.`);
w('- 플래그에 이미 값이 있으면(불러오기·다시 실행) 다시 판정하지 않는다. \'함께\' 횟수는 조건에 넣지 않는다.');
w(
  `- 해금되면 복도 첫 만남 → 노을길 → 토요일 오전 \`c8_raffle\`(통성명·추첨) → 에피소드 넷 판(\`e1_ice4\` → \`e1s_sunday4\` → \`e2_frog4\` → \`e3_rain4\`).` +
    ` 후반 선택 6회(\`e1f.ch1\` ~ \`e3f.ch2\`)는 ${H.osana}(a)·${H.tenko}(b)·${H.koharu}(k) 중 고른 한 사람에게만 +0.5, '함께'는 없다.`,
);
w(
  `- 미해금이면 에피소드 셋 판(\`e1_ice3\` → \`c8_bakery\` → \`c9_puzzle\` → \`e2_frog3\` → \`c10_window\` → \`e3_rain3\`).` +
    ` 옛 후반 선택 3회(c8·c9·c10)에서 ${H.koharu} 옵션(k)은 숨고 '함께'(c)가 보인다(+3 또는 함께).`,
);
w(`- 해금 뒤 옛 후반 선택을 이미 한 구저장은 \`c8_bakery\` → \`c9_puzzle\` → \`c10_window\` 의 옛 판정(+3, 히든 루트 없음)으로 끝까지 간다.`);
w();
w('루트 결정 규칙(`src/engine/runner.ts` routeFor·pickRoute, docs/EIGHT_ENDINGS_DESIGN.md 5절):');
w(`1. 후보 = ${H.osana}, ${H.tenko} (+ \`kh.met\` = true 면 ${H.koharu}). 누적 점수가 가장 높은 후보의 루트`);
w(`2. 공동 최고점이면 그 판정의 선택 순서를 뒤에서부터 훑어, '함께'와 공동 최고점이 아닌 인물을 건너뛰고 처음 만나는 공동 최고점 인물`);
w(
  `3. 발견 경로의 새 흐름(\`e3_rain4\` 끝)에서만: 후보가 세 사람 전원이고 세 점수가 완전히 같으면 ${ROUTE_KO.group}(\`tieRoute\`).` +
    ' 구버전 후반 선택(+3)을 이미 한 저장(`kh.late3`)에는 쓰지 않는다',
);
w('4. 루트 확정 후에는 점수가 바뀌지 않고 다른 루트 장면으로 넘어가지 않는다(검증기·테스트로 확인)');
w();
w('판정 지점(경로마다 하나만 실행된다):');
w();
w('| 장면 | 쓰는 경로 | 선택 순서(동점 처리에 뒤에서부터) | 히든 루트 |');
w('|---|---|---|---|');
const DECIDE_USE: Record<string, string> = {
  e3_rain4: `${H.koharu} 등장(새 흐름): 후반 선택 6회, 고른 한 사람만 +0.5`,
  e3_rain3: `${H.koharu} 미등장(새 흐름): 옛 후반 3회(c8·c9·c10, +3 또는 함께)`,
  c10_window: `${H.koharu} 등장 후 옛 후반 선택을 이미 한 구저장 전용(옛 규칙)`,
};
for (const { scene, d } of DECIDES) {
  w(`| \`${scene}\` | ${DECIDE_USE[scene] ?? '-'} | ${d.order.map((id) => `\`${id}\``).join(' → ')} | ${d.tieRoute ? `세 명 완전 동점 → ${R[d.tieRoute]}` : '없음'} |`);
}
w();
w('결말 갈래(루트 본편 끝, 점수·루트에 영향 없음): 옵션 `f` 축제 쪽 / `d` 일상 쪽. 축제 쪽이 기존 결말이다.');
w();
w('| 루트 | 선택 | 축제 쪽 | 일상 쪽 |');
w('|---|---|---|---|');
for (const r of ROUTES) {
  const fork = SCENE_ORDER.map((id) => STORY.scenes[id])
    .filter((s) => s.route === r)
    .flatMap((s) => s.steps)
    .find((x): x is Extract<Step, { t: 'choice' }> => x.t === 'choice' && /\.fork$/.test(x.id));
  const fest = ENDINGS.find((e) => e.route === r && e.kind === 'festival');
  const daily = ENDINGS.find((e) => e.route === r && e.kind === 'daily');
  const cell = (e: EndingDef | undefined) => (e ? `\`${e.id}\` 「${t(e.title)}」` : '-');
  w(`| ${ROUTE_KO[r]} | ${fork ? `\`${fork.id}\`` : '-'} | ${cell(fest)} | ${cell(daily)} |`);
}
w();
if (report.paths.length) {
  const b = report.branching;
  const num = (v: number) => v.toLocaleString('en-US');
  const endingsLine = ENDINGS.map((e) => `${endingName(e.id)} ${num((b.endings as Record<string, number>)[e.id] ?? 0)}`).join(' / ');
  const routesLine = ROUTES.map((r) => `${R[r]} ${num((b.routes as Record<string, number>)[r] ?? 0)}`).join(' / ');
  // 경로 단위(결말 갈래 선택 포함)와 판정 단위(결말 갈래 선택 전 조합)를 섞지 않고 따로 적는다
  w(
    `선택 조합 ${num(b.paths)}개(보이는 옵션만, 결말 갈래 선택 포함) → 엔딩 ${endingsLine}. 초반 조합 ${b.earlyCombos}개 중 해금 ${b.unlockedEarlyCombos}개` +
      ` (해금 경로 ${num(b.unlockedPaths)} / 미해금 경로 ${num(b.lockedPaths)}).`,
  );
  w();
  w(
    `루트 판정 ${num(b.decisions)}회(결말 갈래 선택 전 조합, 해금 ${num(b.unlockedDecisions)} / 미해금 ${num(b.lockedDecisions)}) → ${routesLine}.` +
      ` 그중 히든 루트(${R.group}, 세 사람 완전 동점) ${num(b.hidden)}회, 두 사람 동점 처리 ${num(b.ties)}회(해금 ${num(b.tiesUnlocked)} / 미해금 ${num(b.tiesLocked)}).`,
  );
  if (b.legacy) {
    const l = b.legacy;
    const lr = ROUTES.filter((r) => (l.routes as Record<string, number>)[r]).map((r) => `${R[r]} ${num((l.routes as Record<string, number>)[r])}`).join(' / ');
    w();
    w(
      `구저장 발견 경로(옛 \`c8_bakery\`·\`c9_puzzle\`·\`c10_window\` 에 해금 상태로 들어온 진행 중 저장, 옛 +3·옛 판정): 판정 ${num(l.decisions)}회 → ${lr}.` +
        ` 히든 루트 ${num(l.hidden)}회, 동점 처리 ${num(l.ties)}회(그중 세 명 동점 ${num(l.allTied)}회는 옛 규칙대로 최근 선택).`,
    );
  }
  w();
  // 초반 조합별: 해금 여부·시작 점수와 그 뒤 후반 27조합의 엔딩 분포
  const groups = new Map<string, (typeof report.paths)[number][]>();
  for (const p of report.paths) {
    const n = p.gateAt ?? p.choices.length;
    const key = p.choices
      .slice(0, n)
      .map((c) => c.option)
      .join(',');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  const early = ROUTE_ORDER.slice(0, 4);
  w(`초반 조합별 결과 (${early.join(' / ')} → 판정 직전 점수 → 후반 조합의 엔딩 수):`);
  w();
  w(`| 초반 선택 | ${H.osana} : ${H.tenko} | 숨은 등장 | ${H.koharu} 시작 | 후반 조합(결말 갈래 포함) | ${ROUTES.map((r) => R[r]).join(' | ')} |`);
  w(`|---|---|---|---|---|${ROUTES.map(() => '---').join('|')}|`);
  for (const [key, ps] of groups) {
    const picks = key.split(',');
    const pts = scoreOf(early.map((id, i) => [id, picks[i]] as const));
    const met = ps[0].met;
    const cnt = (r: RouteId) => ps.filter((p) => (p.route as string | null) === r).length;
    const cells = ROUTES.map((r) => (met || r === 'osana' || r === 'tenko' ? String(cnt(r)) : '-'));
    w(`| ${picks.join(' ')} | ${pts.osana} : ${pts.tenko} | ${met ? '등장' : '-'} | ${met ? (pts.osana + pts.tenko) / 2 : '-'} | ${ps.length} | ${cells.join(' | ')} |`);
  }
  w();
  const stats = (ending: EndingId) => {
    const ps = report.paths.filter((p) => p.ending === ending);
    const avg = (f: (p: (typeof ps)[number]) => number) => Math.round(ps.reduce((a, p) => a + f(p), 0) / Math.max(1, ps.length));
    const main = avg((p) => p.mainChars);
    const epi = avg((p) => p.epilogueChars);
    return `본편 약 ${avg((p) => p.mainLines)}문장·${main}자(≈${(main / 550).toFixed(1)}~${(main / 380).toFixed(1)}분), 후일담 약 ${avg((p) => p.epilogueLines)}문장·${epi}자(≈${(epi / 550).toFixed(1)}~${(epi / 380).toFixed(1)}분)`;
  };
  for (const e of ENDINGS) w(`- ${endingName(e.id)}: ${stats(e.id)}`);
  w('- 추정 시간은 1분당 380~550자 읽기 기준(클릭·글자 표시 포함 대략치). 본편은 공통 구간 포함.');
  w();
}

// 이벤트 CG 가 장면 끝까지 떠 있는지(다음 장면 첫 배경 전환에서 걷힘 표시용). 장면 안은 위에서부터 차례로 본다
const cgAtEnd = new Set<string>();
for (const id of SCENE_ORDER) {
  let up = false;
  for (const st of STORY.scenes[id].steps) {
    if (st.t === 'cg') up = !!st.cg;
    if (st.t === 'bg') up = false;
  }
  if (up) cgAtEnd.add(id);
}
const cgCarriedInto = new Set<string>();
for (const id of cgAtEnd) for (const st of STORY.scenes[id].steps) if (st.t === 'jump') cgCarriedInto.add(st.scene);

// ---- 대본 ----
w('## 대본');
w();
let lastHead = '';
for (const id of SCENE_ORDER) {
  const s = STORY.scenes[id];
  const head = `${ROUTE_KO[s.route]}${s.part === 'epilogue' ? epilogueHead(s) : s.route === 'common' ? '' : ' — 본편'}`;
  if (head !== lastHead) {
    w('---');
    w();
    w(`## ${head}`);
    w();
    lastHead = head;
  }
  writeScene(s);
}

/** 장면에서 장면 이동(jump·routeBranch)으로 닿는 엔딩의 갈래들 */
function endingKindsFrom(start: string): Set<EndingKind> {
  const kinds = new Set<EndingKind>();
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id) || !STORY.scenes[id]) continue;
    seen.add(id);
    for (const st of STORY.scenes[id].steps) {
      if (st.t === 'jump') stack.push(st.scene);
      if (st.t === 'routeBranch') stack.push(...Object.values(st.scenes).filter((x): x is string => !!x));
      if (st.t === 'ending') kinds.add(STORY.endings[st.ending].kind);
    }
  }
  return kinds;
}

/** 후일담(epilogue) 장면 묶음 제목: 그 장면에서 닿는 엔딩이 축제 쪽인지 일상 쪽인지로 나눈다 */
function epilogueHead(s: Scene): string {
  const kinds = endingKindsFrom(s.id);
  if (kinds.size === 1 && kinds.has('daily')) return ' — 일상 쪽 결말';
  if (s.route === 'koharu') return ' — 축제 쪽 · 8월 후일담(문구점·여름 축제·첫 데이트)';
  if (s.route === 'group') return ' — 축제 쪽 결말';
  return ' — 축제 쪽 · 여름 축제 후일담';
}

function writeScene(s: Scene) {
  w(`### \`${s.id}\` ${t(s.title)}`);
  w();
  let cgUp = cgCarriedInto.has(s.id);
  for (const st of s.steps) {
    let line = fmt(st);
    if (st.t === 'cg') cgUp = !!st.cg;
    if (st.t === 'bg' && cgUp) {
      line += ' — 이벤트 CG 자동으로 걷힘';
      cgUp = false;
    }
    if (line !== null) w(line);
    // 무조건 이동 뒤에 나열된 줄은 위에서 이어지지 않는다(다른 분기) → CG 상태를 모른다고 보고 표시하지 않음
    if (st.t === 'goto' || st.t === 'jump' || st.t === 'ending') cgUp = false;
  }
  w();
}

function fmtCond(c: Cond): string {
  if ('choice' in c) return `선택지 ${c.choice} 에서 '${c.is}' 를 골랐다면`;
  if ('flag' in c) return `플래그 ${c.flag} = ${String(c.eq)} 이면`;
  if ('route' in c) return `${R[c.route]} 루트이면`;
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
      // 점수 효과가 하나도 없는 루트 안 선택(결말 갈래)은 그렇다고 표시한다
      const fork = /\.fork$/.test(st.id) && st.options.every((o) => !o.heroine && !o.effects?.length);
      const lines = [`- ❓ **선택지** \`${st.id}\`${st.prompt ? ` — ${t(st.prompt)}` : ''}${fork ? ' 〔결말 갈래: f 축제 쪽 / d 일상 쪽, 점수·루트 영향 없음〕' : ''}`];
      for (const o of st.options) {
        const score = fmtScore(o);
        lines.push(
          `  - **${o.id}**: ${t(o.text)}${score !== '-' ? ` 〔${score}〕` : ''}${o.visibleIf ? ` 《${visLabel(o.visibleIf)}만 보임》` : ''}${o.goto ? ` → \`${o.goto}\`` : ''}`,
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
      return st.cg ? `- 🖼 **[이벤트 CG \`${st.cg}\`: 「${CGS[st.cg].title}」]** ${CGS[st.cg].desc}` : '- 〔이벤트 CG 걷기〕';
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
    case 'unlock':
      return `- 🔑 **숨은 등장 판정** ${H[st.among[0]]}·${H[st.among[1]]} 점수 차 ≤ ${st.maxDiff} 이면 \`${st.flag}\` = true, ${H[st.heroine]} 시작 점수 = 두 점수의 평균 (이미 판정했으면 그대로)`;
    case 'decideRoute': {
      const hidden = Object.entries(st.hidden ?? {})
        .map(([h, f]) => `${H[h as HeroineId]}는 \`${f}\` = true 일 때만 후보`)
        .join(', ');
      const tie = st.tieRoute ? `; 후보 세 명의 점수가 완전히 같으면 ${ROUTE_KO[st.tieRoute]}(구저장 \`kh.late3\` 제외)` : '';
      return `- ⚖ **루트 결정** (누적 점수, 동점이면 ${st.order.length ? st.order.map((id) => `\`${id}\``).join('·') + ' 를 뒤에서부터' : '가장 최근 개인 선택'}${hidden ? `; ${hidden}` : ''}${tie})`;
    }
    case 'routeBranch':
      return `- ⏭ ${ROUTES.filter((r) => st.scenes[r])
        .map((r) => `${R[r]} 루트 → \`${st.scenes[r]}\``)
        .join(' / ')}`;
    case 'ending':
      return `- 🏁 **엔딩: ${endingName(st.ending)} — 「${t(STORY.endings[st.ending].title)}」** \`${st.id}\``;
    default:
      return null;
  }
}

w('---');
w();
w(`엔딩 제목(임시, 엔딩 ${ENDINGS.length}개): ${ENDINGS.map((e) => `${endingName(e.id)} 「${t(ENDING_TITLES[e.id])}」`).join(' / ')}`);
if (report.errors.length) {
  w();
  w('> ⚠ 이 대본은 검증 오류가 있는 상태에서 생성되었습니다:');
  for (const e of report.errors) w(`> - ${e}`);
}

mkdirSync(resolve(root, 'docs'), { recursive: true });
writeFileSync(resolve(root, 'docs/SCRIPT.md'), out.join('\n') + '\n');
console.log(`docs/SCRIPT.md 생성 (${out.length}줄)${report.errors.length ? ` — 검증 오류 ${report.errors.length}건 포함` : ''}`);
