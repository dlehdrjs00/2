/**
 * 대사 문자열의 치환 처리.
 *
 *  {key}        → vars[key]
 *  {key:은}     → vars[key] + 받침에 맞는 조사(은/는)
 *
 * 이름이 바뀌어도 조사가 자연스럽게 맞도록 하기 위한 장치다.
 * 조사는 어느 형태로 적어도 된다 ({osana:는} == {osana:은}).
 */

/** [받침 있을 때, 받침 없을 때] */
const JOSA_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['은', '는'],
  ['이', '가'],
  ['을', '를'],
  ['과', '와'],
  ['아', '야'],
  ['이랑', '랑'],
  ['이나', '나'],
  ['이야', '야'],
  ['이에요', '예요'],
  ['이라고', '라고'],
  ['이라서', '라서'],
  ['이라면', '라면'],
  ['이지만', '지만'],
  ['이었', '였'],
  ['이네', '네'],
  ['이도', '도'],
];

const JOSA_LOOKUP = new Map<string, readonly [string, string]>();
for (const pair of JOSA_PAIRS) {
  // '이' 단독은 '이/가' 로만 해석한다(다른 쌍의 접두와 혼동 방지)
  if (!JOSA_LOOKUP.has(pair[0])) JOSA_LOOKUP.set(pair[0], pair);
  if (!JOSA_LOOKUP.has(pair[1])) JOSA_LOOKUP.set(pair[1], pair);
}
// '야'는 호격(아/야)으로 해석. 서술격 '이야/야'는 {key:이야} 로 적는다.
JOSA_LOOKUP.set('야', ['아', '야']);

const RO_PAIR = ['으로', '로'] as const;

/** 마지막 글자의 받침 정보. 한글이 아니면 null */
function finalConsonant(word: string): { has: boolean; rieul: boolean } | null {
  const ch = word.trim().slice(-1);
  if (!ch) return null;
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return null;
  const jong = (code - 0xac00) % 28;
  return { has: jong !== 0, rieul: jong === 8 };
}

export function attachJosa(word: string, josa: string): string {
  const fc = finalConsonant(word);
  if (josa === '으로' || josa === '로') {
    if (!fc) return `${word}(으)로`;
    return word + (fc.has && !fc.rieul ? RO_PAIR[0] : RO_PAIR[1]);
  }
  const pair = JOSA_LOOKUP.get(josa);
  if (!pair) return word + josa; // 모르는 조사는 그대로 붙인다
  if (!fc) return `${word}${pair[0]}(${pair[1]})`;
  return word + (fc.has ? pair[0] : pair[1]);
}

export const PLACEHOLDER_RE = /\{([a-zA-Z][a-zA-Z0-9_]*)(?::([^}]+))?\}/g;

export function resolveText(text: string, vars: Readonly<Record<string, string>>): string {
  return text.replace(PLACEHOLDER_RE, (whole, key: string, josa?: string) => {
    const v = vars[key];
    if (v === undefined) return whole;
    return josa ? attachJosa(v, josa) : v;
  });
}

/** 해석되지 않는(정의되지 않은) 치환 키 목록 */
export function unknownPlaceholders(text: string, vars: Readonly<Record<string, string>>): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    if (vars[m[1]] === undefined) out.push(m[0]);
  }
  return out;
}
