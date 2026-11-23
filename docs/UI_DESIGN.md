# 《내일도 같이 갈래?》 UI 디자인 명세 (최종안)

> 방향: **「맑은 여름 하늘」**(우승 시안)을 바탕으로 **「노을과 종이」**(준우승 시안)의 좋은 구조를 접목했다.
> 이 문서는 구현 기준이다. 모든 화면 문구는 한국어로 쓴다.
> 최종 목업 위치는 `/tmp/claude-0/-home-user-2/e7822c7a-a53c-557c-91eb-6212db763e9c/scratchpad/ui-design/final/`이다. 이 폴더는 임시 작업 폴더라 지워질 수 있다. 그래서 구현에 꼭 필요한 값은 모두 이 문서에 옮겨 두었다.
> - `index.html?s=<화면>`: 한 화면만 보기. 화면 이름은 title, dialogue, choice, save, load, settings, log, card, ending, night, menu, confirm, hide
> - `css/final.css`: 실제 게임의 클래스 이름을 그대로 쓴 스타일
> - `js/mock.js`: 새 배치 공식
> - `scripts/shots.cjs`: 스크린샷 촬영과 자동 점검

---

## 0. 선정 경위

두 시안의 스크린샷(PC, 휴대폰 가로, 최소 크기, 세로)과 현재 게임 화면을 직접 보고 기준마다 10점 만점으로 매겼다.

| 기준 | 맑은 여름 하늘 (sky) | 노을과 종이 (dusk) |
|---|---|---|
| 상용 비주얼노벨다운 완성도 | **8.5** | 7.5 |
| 작품(여름 학원 러브코미디)과의 어울림 | **9.0** | 7.5 |
| 휴대폰 가로 가독성·터치 | **8.0** | 7.5 |
| 일러스트를 가리지 않는 정도 | 7.5 | **8.5** |
| 구현 가능성 | **8.0** | 7.0 |
| 접근성 | 7.5 | **8.0** |
| **합계 (60점 만점)** | **48.5** | 46.0 |

**우승은 sky다.** 이유는 다음과 같다.
- 장마 끝 초여름의 맑은 하늘과 축제 밤(남색 유리 톤) 양쪽에 자연스럽게 맞는다.
- 흰 유리 UI가 일러스트의 색을 해치지 않는다.
- 기존 DOM과 클래스를 그대로 따르므로 옮기기 쉽다.

sky의 약점과 고친 방법:
- **빠른 메뉴 캡슐이 창과 떨어져 떠 있었다.** 그래서 인물 상반신 위에 UI 덩어리가 하나 더 생긴 것처럼 보였다. 빠른 메뉴를 대사창 위 테두리에 붙은 탭으로 바꿨다. 이름표 탭과 같은 높이의 띠를 나눠 쓴다. 또 대사창 기본 높이를 무대의 25%에서 22%로 줄여 창 위끝을 낮췄다. 3줄 용량은 그대로다.
- **주 버튼 그라데이션 위 흰 글자의 대비가 2.5~3.7:1로 낮았다.** 그라데이션을 바꿔 모든 구간에서 4.5:1 이상으로 맞췄다(3장).

dusk에서 가져온 것:
1. 빠른 메뉴를 대사창에 붙이는 방식과 `.qbar > .hud + .qbar-extra` 구조. `display: contents`와 `order`로 순서를 정한다.
2. 대사창 숨기기 버튼과 H 키
3. 저장·불러오기·설정·기록을 한 오버레이 안에서 탭으로 오가는 **탭 시트**
4. 왼쪽 **쪽 레일**과 수동 슬롯 30칸
5. **일력 모양 날짜 카드**. 하늘 톤으로 다시 칠했다.
6. **폴라로이드 엔딩**. 사진이 취미인 히나라는 작품 소재와 이어진다.
7. 타이틀 [이어하기] 옆의 자동 저장 날짜
8. **글자 크기 설정**과 대사창 불투명도 하한 40

dusk에서 가져오지 않은 것과 이유:
- 크림 종이 질감과 마스킹테이프: 학원 러브코미디보다 회상물 톤에 가깝고, 종이가 불투명해 그림을 무겁게 덮는다.
- 손글씨체(연성): 16px에서 읽기가 떨어진다.
- 노을 타이틀: 지금 타이틀 그림과 맞지 않아 키 비주얼을 새로 그려야 한다.

---

## 1. 디자인 방향

1. **흰·하늘 반투명 유리.**
   - 모든 창은 흰 유리를 쓴다(블러 14px, 1px 흰 테, 하늘색 바깥선).
   - 축제·밤 배경에서는 남색 유리로 바뀐다(`#vn[data-tone=night]`).
   - UI 바탕은 늘 밝게 두어 고품질 일러스트의 색을 해치지 않는다.
2. **얇은 장식선과 4각 별(✦).**
   - 대사창 안쪽에 장식선을 두르고 네 모서리에 꺾쇠를 단다.
   - 화면 제목 앞에 별을 붙이고, 카드와 엔딩에는 `──✦──` 선을 쓴다. 장식은 1~1.6px 선만 쓴다.
3. **인물 색이 이름표를 칠한다.**
   - 이름표는 대사창 위 테두리 왼쪽에 붙은 탭이다. 위 테두리에 화자 색 띠가 이어진다.
   - 아카네는 적갈, 히나는 장미 분홍, 소우타는 남청, 그 밖의 인물은 회청이다.
4. **조작은 창에 모은다.**
   - 무대 위쪽의 HUD 줄을 없앴다.
   - 빠른 메뉴는 대사창 위 테두리 오른쪽에 붙은 탭이다. 이름표 탭과 같은 높이 띠를 쓴다.
   - 그 결과 일러스트 위쪽(얼굴 부분)이 완전히 비고, 대사창 위끝은 지금(무대 높이의 71%)보다 낮은 76%가 된다.
5. **햇살·빛망울은 멈춰 있는 화면에서만 진하게.**
   - 타이틀, 날짜 카드, 엔딩에서는 진하고, 대사 중에는 위쪽에 옅게 둔다.
   - 설정에서 끌 수 있고, `prefers-reduced-motion`이면 멈춘다.

---

## 2. 참고한 관례

특정 게임의 로고·그림·고유 배치는 베끼지 않았다. 관례만 가져오고 모양은 이 작품만의 것으로 만들었다(탭 이름표, 유리 탭 빠른 메뉴, 4각 별, 비행기구름·종이비행기 로고, 일력 카드, 폴라로이드).

| 관례 | 흔히 쓰는 곳 | 이 작품에서 |
|---|---|---|
| 대사창 위에 붙은 이름표, 화자별 색 | Ren'Py 기본 GUI(namebox), 유즈소프트·Key 계열 상용작 | 대사창 왼쪽 위 탭 + 위 테두리 화자 색 띠 |
| 대사창에 붙은 빠른 메뉴(Back·History·Skip·Auto·Save·Q.Save·Q.Load·Prefs) | Ren'Py `quick_menu`, 상용작의 창 테두리 버튼 줄 | 창 오른쪽 위 유리 탭: 기록·자동·스킵 │ 퀵저장·퀵로드 │ 숨기기·설정·메뉴 |
| 1클릭 빠른 저장·불러오기 | Ren'Py 튜토리얼의 Q.Save/Q.Load | 퀵 슬롯 1개 신설, F5/F9 |
| 대사창 숨기기(그림 감상) | 거의 모든 상용 VN(우클릭·H) | [숨기기] 버튼과 H 키. 다시 누르면 창이 돌아오고 대사는 넘기지 않음 |
| 썸네일과 쪽 번호가 있는 전체 화면 저장·불러오기 | Ren'Py 기본(3×2, 쪽 버튼), Game Accessibility Guidelines의 "저장 썸네일" | 3×2 카드, 왼쪽 쪽 레일(자동·퀵, 1~5쪽), 저장된 무대 상태로 그린 미니 무대 썸네일 |
| 탭으로 나눈 시스템 화면 | 상용 VN의 Save/Load/Config/Backlog 탭 | 한 오버레이 안의 탭 4개(타이틀에서는 2개) |
| 분류 탭이 있는 설정과 글자 속도 미리보기 | Ren'Py Preferences, Xbox Accessibility Guidelines 101 | 왼쪽 세로 탭(글자·대사창/소리/화면·조작) + 실제 대사창 미리보기 |
| 전체 화면 백로그 | 상용 VN 공통, Ren'Py History | 이름 열 + 본문, 날짜 구분선, 선택 배지, 현재 줄 강조 |
| 장식된 선택지 바 | 상용 학원물 VN | 양끝이 옅어지는 유리 리본, 위아래 장식선, 번호 배지(키 1~3) |
| 키 비주얼 + 로고 + 세로 메뉴 타이틀 | 상용작 공통 | 오른쪽 두 히로인, 왼쪽 로고·부제·세로 메뉴, 햇살·빛망울 |
| 날짜(아이캐치) 카드 | 학원물 VN·애니의 날짜 자막 | 뜯어 쓰는 **일력** 한 장 + 주간 점 |
| 엔딩 화면 | 상용 VN의 엔딩 일러스트·도달 표시 | 마지막 장면 폴라로이드 + 엔딩 배지·진행 메달 |
| 접근성 | Xbox XAG 101(대비 4.5:1, 설정 미리보기), itch.io 접근성 글(글자 속도·크기·백로그) | 대비 토큰, 포커스 링, 글자 크기 3단계, 숨기기 |

조사 한계: renpy.org와 itch.io 원문은 이 세션의 네트워크에서 열리지 않았다. 검색 요약과 문서 사본으로 확인했다(두 시안 디자이너의 보고).

---

## 3. 색 토큰 (`src/ui/styles.css`의 `:root`)

대비는 WCAG 2.x 상대 휘도로 계산했다. 흰 바탕은 `#fff` 기준이다.

| 변수 | 값 | 용도 / 대비 |
|---|---|---|
| `--ink` | `#1d2b44` | 본문 글자. 흰 바탕 14.2:1 |
| `--ink-2` | `#3f5068` | 보조 글자(독백·발췌·빠른 메뉴). 8.2:1 |
| `--ink-3` | `#5c6c85` | 날짜·눈금·안내. 5.3:1(본문 크기도 AA) |
| `--sky-50/100/200/300/400/500/600/700` | `#f4faff #e5f3ff #c8e7fc #a2d4f6 #70bff0 #45a3e2 #2b86c9 #1f68a3` | 300~400은 장식선, 500~600은 아이콘·채움, **700만 글자**에 쓴다(흰 바탕 5.9:1, sky-100 바탕 5.2:1) |
| `--pink-50/100/200/300/400/600/700` | `#fff6f9 #ffe7ef #ffd0e0 #ffb2cb #f78fb4 #d65a8b #b6406f` | 400은 장식·선택, 600은 아이콘만, **700만 글자·글자 바탕**에 쓴다(흰 글자 5.3:1) |
| `--sun` | `#ffe3a1` | 햇살·엔딩 장식선. 글자에는 쓰지 않는다 |
| `--akane-1 / -2 / -soft` | `#a5413a / #cf6a55 / #fbe9e4` | 아카네 이름표·배지. 흰 글자 6.2:1 |
| `--hina-1 / -2 / -soft / -pin` | `#c2477a / #ee8ab3 / #ffeaf3 / #7cc8f0` | 히나 이름표. 흰 글자 4.7:1. `-pin`(하늘 머리핀)은 장식에만 |
| `--me-1 / -2 / -soft` | `#2c69ab / #5c9bd9 / #e6f1fc` | 소우타 이름표. 5.7:1 |
| `--npc-1 / -2 / -soft` | `#56667f / #7d8ca3 / #eef1f6` | 선생님·반 아이들. 5.8:1 |
| `--glass-hi` | `rgba(255,255,255,.95)` | 유리 1px 흰 테 |
| `--glass-edge` | `rgba(112,172,226,.42)` | 유리 바깥 하늘선 |
| `--glass-shadow` | `0 12px 32px rgba(28,72,124,.2)` | 창 그림자 |
| `--focus` | `#1b6fd1` | 포커스 링 3px(흰 바탕 5.0:1) + 흰 후광 6px |
| `--grad-primary` | `linear-gradient(100deg, #2472b5, #4d68c0 50%, #b0457a)` | 주 버튼(새 게임·게임으로 돌아가기·확인·타이틀로). 흰 글자 5.1/5.2/5.3:1 |
| `--grad-on` | `linear-gradient(180deg, #2f6fb6, #245fa0)` | 빠른 메뉴 켜짐(자동·스킵). 5.2/6.5:1 |
| `--grad-cal` | `linear-gradient(100deg, #2472b5, #3d6cbf 60%, #5563bd)` | 일력 머리띠 |
| `--win-alpha` | 설정값 ÷ 100 (0.40~1.00) | 대사창·빠른 메뉴 탭 유리의 불투명도 |

유리 배합:
- **대사창(낮)**: `linear-gradient(180deg, rgba(255,255,255, a×.96), rgba(244,250,255, a×.90))`, `backdrop-filter: blur(14px) saturate(1.25)`. 여기서 a는 `--win-alpha`다. 글자에는 흰 번짐 `0 0 2px #fff, 0 0 8px rgba(255,255,255,.6)`을 줘서 불투명도를 낮춰도 읽히게 한다.
- **대사창(밤)**: `rgba(26,38,70, a×.9) → rgba(18,26,52, a×.94)`, 글자 `#f4f7ff`(13.9:1), 독백 `#d6e0f5`.
- **레터박스**: 무대 바깥은 어둡게가 아니라 밝게 흐린다. `blur(24px) brightness(1.08)`에 흰·분홍 베일을 덮는다. 밤 톤은 `brightness(.8)`에 남색 베일.
- **페이지 바탕**: `body { background: #dfeefb }`. `<meta name="theme-color" content="#cfe6f8">`, `color-scheme: light`.

이름표 칠: `background: linear-gradient(180deg, var(--name-2) -30%, var(--name-1) 70%)`. 글자 뒤에는 진한 `-1`이 오고, 글자는 흰색이다.
`.textbox[data-who=osana|tenko|me]`가 `--name-1/--name-2`를 고른다. 그 밖의 화자는 npc 색이다. 독백 띠는 하늘색이다.

---

## 4. 글꼴 토큰

모두 npm 패키지이고 라이선스는 OFL-1.1이다(2026-11-23 `npm view`로 버전과 라이선스 확인). 외부 CDN은 쓰지 않는다.

| 변수 | 패키지 | 굵기 | 쓰는 곳 |
|---|---|---|---|
| `--font-ui` | `pretendard@1.3.9` (`pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css`) | 500/600/700/800 | 버튼·탭·빠른 메뉴·날짜·숫자·패널 본문 |
| `--font-text` | `@fontsource/gowun-dodum@5.3.0` | 400 | 대사, 기록, 선택지, 슬롯 발췌, 카드 부제 |
| `--font-serif` | `@fontsource/gowun-batang@5.3.0` (`700.css`) | 700 | 일력 숫자, 엔딩 제목, 타이틀 부제, 기록 날짜 구분, 폴라로이드 캡션 |
| `--font-deco` | `@fontsource/jua@5.3.0` | 400 | 로고, 이름표, 확인창 질문, 메뉴 제목, 엔딩 배지 |

각 변수의 뒤 순서(폴백): `--font-ui`는 `'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', system-ui, sans-serif`다. 나머지도 같은 식으로 시스템 한글 글꼴을 뒤에 둔다.

**크기 규칙.** `fs`는 layout.ts가 계산한 대사 글자 크기다. 가로 화면 휴대폰(667×375 이상)에서 **16px 미만 글자는 없다**.

| 요소 | 크기 |
|---|---|
| 대사 | `fs`, 줄 높이 1.62 |
| 이름표 | `max(17px, fs×0.92)` 주아, 자간 .06em |
| 빠른 메뉴 | `max(16px, fs×0.66)` Pretendard 600 |
| 선택지 | `fs×1.02` 고운돋움, 줄 높이 1.4 |
| 장소 표시 | `max(16px, fs×0.72)` Pretendard 600 |
| 패널 본문 `--ui` | `clamp(16px, fs×0.78, 19px)` |
| 화면 제목·확인창 질문 | `clamp(20px, --ui×1.3, 26px)` 주아 |
| 일력 숫자 / 요일 / 부제 | `fs×4.1` 고운바탕 700 / `max(16px, fs×0.95)` / `max(16px, fs×0.95)` |
| 엔딩 제목 | `clamp(26px, min(3.7vw, 8vh), 50px)` 고운바탕 700, `text-wrap: balance` |
| 로고 1줄 / 2줄 | `clamp(26px, min(4.4vw, 7.6vh), 56px)` / `clamp(42px, min(8.2vw, 13.4vh), 104px)` |
| 토스트·안내·버전 표기 | 16px |

**불러오는 법(`src/main.ts`).**
```ts
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '@fontsource/gowun-dodum';
import '@fontsource/gowun-batang/700.css';
import '@fontsource/jua';
```
- 네 패키지 모두 unicode-range로 쪼갠 woff2다. 디스크에는 약 11MB가 생기지만, 실제로는 화면에 나온 글자 조각만 내려받는다(첫 화면 수백 KB).
- `font-display: swap`을 유지한다. 타이틀을 그리는 것과 동시에 `document.fonts.load('16px "Gowun Dodum"')`를 걸어 둔다.
- 고운돋움의 한글 폭은 1em이므로 `validate.ts`의 `LINE_MAX_CHARS = 88` 가정(최악 1em/글자)은 그대로 성립한다.

---

## 5. 배치 변수 · 상태 속성

layout.ts의 `applyLayout`이 `#vn`에 다음을 넣는다.

| 변수 / 속성 | 뜻 |
|---|---|
| `--sx --sy --sw --sh` | 무대(16:9 contain) |
| `--tx --ty --tw --th` | 대사창 |
| `--cx --cy --cw --ch` | 선택지 영역 |
| `--fs` | 대사 글자 크기 |
| `--m` | 무대 안 여백 `max(8, sh×.022)` (**새로 추가**) |
| `--btn` | 이름표·빠른 메뉴 탭 높이 `clamp(fs×1.75, 40, 44)` |
| `--hy` | 탭 띠의 위끝 = `ty − btn` |
| `--hr` | 빠른 메뉴 탭의 오른쪽 여백 = `vw − (tx+tw) + fs×.55 + 10` |
| `--tb-grow` | 넘침 안전장치로 대사창을 늘린 양. **#vn 루트에 설정**한다(대사창과 빠른 메뉴 탭이 함께 올라가게) |
| `--cband` | 호환용(= `cy − sy`) |
| `data-layout` | `overlay` 또는 `below`(그대로) |
| `data-dense` | 0~3(그대로) |
| `data-qm` | `icons` / `full` / `compact`: 빠른 메뉴 폭 단계(**새로 추가**) |
| `data-tone` | `day` / `evening` / `night`: 배경 톤(**새로 추가**) |
| `data-hidewin` | `1`이면 대사창 숨김(**새로 추가**) |
| `data-mode`, `data-frame`, `data-step`, `data-overlay`, `data-auto`, `data-skip`, `data-rotate` | 그대로 둔다 |

---

## 6. 컴포넌트 규격

### 6.1 무대 `.stage`
- 테두리 `0 0 0 1px rgba(255,255,255,.6)`, 그림자 `0 10px 40px rgba(30,70,120,.25)`. `contain: layout paint`는 유지한다(무대 안 베일과 카드가 대사창을 덮지 않게).
- 인물 `.char`: 드롭섀도 `0 6px 16px rgba(24,60,110,.28)`. 말하지 않는 인물 `.dim`은 어둡게 하지 않고 바래게 한다: `brightness(.9) saturate(.78) contrast(.95)`.
- 낮 장면에는 `.sunwash`(오른쪽 위 햇빛 번짐, screen 합성)를 깔고, 위쪽에 옅은 빛망울 `.motes`(9개)를 둔다.

### 6.2 대사창 `.textbox`
- 위치·크기: `left: --tx; top: calc(--ty − --tb-grow); width: --tw; height: calc(--th + --tb-grow)`.
- 안쪽 여백: `.95fs 1.35fs .6fs`(지금과 같음). 반경 `fs×.55`.
- 유리: 3장 배합 + `box-shadow: 0 0 0 1px --glass-edge, --glass-shadow, inset 0 1px 0 #fff`.
- 장식:
  - `::before`는 안쪽 장식선이다. inset 5px, 1px `rgba(112,172,226,.3)`, 반경 5px. 네 모서리에 16px SVG 꺾쇠(하늘 선 + 분홍 마름모)를 단다.
  - `::after`는 위 테두리 화자 색 띠다. 높이 3px, `left: fs×.55; right: 18%`, `--name-1 → --name-2 → 투명`.
- 다음 표시 `.next`: 4각 별(하늘→분홍) `fs×.85`, 오른쪽 아래, 1.4s 반짝임.
- 독백 `.mono`: 글자 `--ink-2`, 띠는 하늘색.

### 6.3 이름표 `.textbox .name`
- 대사창 위에 붙은 탭이다. `left: fs×.55; bottom: calc(100% + 1px); height: var(--btn); max-width: 42%`. 위 모서리만 `fs×.5`로 둥글린다.
- 주아, 흰 글자, 앞에 흰 4각 별(.62em). `:empty`이면 숨기고, `aria-hidden`은 유지한다.

### 6.4 빠른 메뉴 탭 `.qbar` (새로 만듦)
```html
<div class="qbar" data-noadvance role="toolbar" aria-label="빠른 메뉴">
  <div class="hud">            <!-- 테스트 훅: 버튼 4개, 글자 '자동' '스킵' '기록' '메뉴' -->
    <button class="hud-btn" data-q="log"><span class="ico" aria-hidden="true"></span>기록</button>
    <button class="hud-btn" data-q="auto" aria-pressed="false">…자동</button>
    <button class="hud-btn" data-q="skip" aria-pressed="false">…스킵</button>
    <button class="hud-btn" data-q="menu">…메뉴</button>
  </div>
  <div class="qbar-extra">
    <button data-q="qsave" aria-label="빠른 저장">…퀵저장</button>
    <button data-q="qload" aria-label="빠른 불러오기">…퀵로드</button>
    <button data-q="hide"  aria-label="대사창 숨기기">…숨기기</button>
    <button data-q="config">…설정</button>
  </div>
</div>
```
- 위치: `right: var(--hr); top: calc(var(--hy) − var(--tb-grow, 0px)); height: var(--btn)`. 아랫변은 대사창 위 테두리와 맞닿는다.
- 모양:
  - 위 두 모서리만 `fs×.5`로 둥글린다. 바탕은 대사창과 같은 흰 유리(a×.90→a×.97)다.
  - 테두리를 `border`로 그리면 버튼 높이가 줄어든다. 그래서 테두리는 모두 `box-shadow`로 그린다(위·좌·우 하늘선과 안쪽 흰 선).
  - 아래 두 모서리에는 `::before/::after`로 10px 오목 이음새를 붙인다. `radial-gradient(circle at 0|100% 0, transparent 9.5px, 유리색 10px)`.
- 순서: `.hud`와 `.qbar-extra`는 `display: contents`로 한 줄에 섞는다. `order`는 기록 1, 자동 2, 스킵 3, 퀵저장 5, 퀵로드 6, 숨기기 8, 설정 9, 메뉴 10이다.
  - 버튼 사이에는 1px 세로 구분선(위아래 30% 비움)을 넣는다.
  - 묶음 경계(퀵저장 앞, 숨기기 앞)는 6px 더 띄우고 구분선을 진하게 한다.
- 버튼:
  - 높이는 100%(=`--btn`, 40~44px), 최소 폭 44px, 좌우 여백 .55em, Pretendard 600, 글자색 `--ink-2`.
  - 마우스를 올리면 `rgba(232,244,255,.9)` 바탕에 `--sky-700` 글자가 된다.
  - 켜짐(`aria-pressed=true`)은 `--grad-on` 바탕에 흰 글자다.
- 폭 단계 `#vn[data-qm]`:
  - `icons`(대사창 폭 900 이상): 아이콘과 글자 8개
  - `full`(620 이상): 글자 8개
  - `compact`(그 미만): `.qbar-extra`를 숨겨 4개만 남긴다. 퀵저장·퀵로드·설정은 메뉴 안에 있고, 단축키 F5·F9·H는 그대로 쓴다.
  - 실측 폭: 1280×720 → 616px(icons), 844×390·667×375 → 429px(full), 740×320 이하·세로 → 192px(compact)
- 밤 톤: 남색 유리 + `#e5ecfb` 글자 + 하늘 구분선(28%).
- 날짜 카드 동안(`data-frame=card`): 창이 없다. 그래서 무대 오른쪽 아래(`top: sy + sh − m − btn`)의 둥근 유리 캡슐로 바꾸고, 불투명도 .78로 둔다(hover·focus 시 1). 이음새는 숨긴다.
- 키: F5 퀵저장, F9 퀵로드, H 숨기기. A, S, L, Esc는 지금과 같다.

### 6.5 대사창 숨기기
- `#vn[data-hidewin='1']`이면 `.textbox`, `.qbar`, `.choices`, `.place-chip`을 `opacity: 0; pointer-events: none`으로 한다(전환 0.25s).
- 아래 가운데에 안내 알약 `.hide-hint`(눈 아이콘 + "화면을 누르면 대사창이 돌아와요", 16px)를 띄운다. 2.4초 뒤 사라진다.
- 숨긴 동안 클릭·탭·Enter·Space·H·Esc는 **복귀만 하고 대사를 넘기지 않는다**.
  - `requestAdvance` 맨 앞에서 처리하고, `lockUi()`로 같은 자리의 두 번째 클릭을 흡수한다.
  - 자동 진행과 스킵은 멈춘다.
  - 선택지 화면에서도 숨길 수 있다. 숨긴 동안 선택지는 누를 수 없다.

### 6.6 장소 표시 `.place-chip`·토스트 `.toast`
- 장소 표시:
  - 무대 왼쪽 위 `left: fs×.8; top: fs×.7`(HUD 줄이 없어져 맨 위로 올라간다).
  - 흰 유리 알약에 해 아이콘(밤은 달)을 단다. 날짜와 장소 사이에 1px `.sep`을 넣는다. 3.2초 뒤 사라진다.
  - `place('{d5} · 방과 후 교실')`의 ` · ` 앞부분을 날짜로 나눈다.
- 토스트:
  - 흰 유리 알약 + 분홍 별, 16px.
  - 플레이 중에는 **무대 오른쪽 위**(`top: sy + fs×.7; right: 무대 오른쪽 + fs×.8`).
  - 선택지 중에는 지금처럼 대사창 안 아래쪽.
  - 세로 배치에서는 대사창 바로 아래 가운데(`top: ty + th + 12px`).

### 6.7 선택지 `.choices > .choice`
- 영역: 무대 위 여백(`sy + m`)부터 탭 띠 위 4px(`hy − 4`)까지. 가운데 정렬, 스크롤, dense 단계 규칙은 그대로다.
- 무대 베일 `.choice-veil`: `radial-gradient(ellipse 70% 60% at 50% 40%, rgba(232,244,255,.22), rgba(36,70,118,.26))` + 블러 1.5px. 두 인물 모두 `.dim`.
- 바:
  - 폭 `min(100%, fs×30)`, 최소 높이 `max(48px, fs×2.55)`(dense일 때 44px), 좌우 여백 2.9em, 가운데 정렬.
  - 배경 `linear-gradient(90deg, 투명, 흰 .93 9%, 흰 .93 91%, 투명)`, 반경 6px, 블러 8px, 그림자.
  - `::before`는 위아래 1px 하늘 장식선(양끝이 사라짐), `::after`는 오른쪽 하늘 마름모 .42em이다.
- 번호 배지 `<span class="num" aria-hidden="true">1</span>`: 지름 1.55em 원, Pretendard 700 `max(16px, .72em)`, 하늘 테.
  - 배지는 absolute라 좌우 여백 2.9em 안에 들어가 줄바꿈에 영향이 없다.
  - 버튼 textContent 앞에 번호가 붙지만, 문구를 비교하는 테스트는 없다(확인함). layout.spec이 textContent를 바꿔 긴 문구를 재는 검사도 그대로 유효하다.
  - 배지를 `::before { content: attr(data-n) }`로 그려도 된다.
- 마우스를 올리거나 포커스하면 분홍 바탕에 `--pink-700` 글자가 되고, 선·마름모·배지도 분홍이 되며 `scale(1.015)`. 고른 것(`.picked`)은 분홍을 유지하고 나머지는 opacity .35.
- 등장: 아래에서 8px 올라오며 페이드(0.35s, 0.07s 간격). `CHOICE_ARM_MS`는 그대로 둔다.

### 6.8 날짜 카드 `.stage > .card` (일력)
- **범위를 `.stage > .card`로 좁힌다**(부록 A의 결함 때문).
- 배경: 다음 배경을 `blur(14px)`로 흐리고 가운데 흰 원형 베일(.78→.5)을 덮는다. 빛망울 16개. 밤 카드는 남색 베일이다.
- 세로 가운데는 빠른 메뉴 캡슐 위 영역을 기준으로 잡는다: `padding-bottom: m + btn`.
- 구성(위→아래):
  - `.card-kicker`(선택): "1주 차" 알약
  - `.cal` 일력:
    - 폭 `clamp(220px, fs×13, 360px)`, 반경 14px, 흰 종이, −1.5° 기울임.
    - `.cal-head`: `--grad-cal` 띠. 높이 `max(40px, fs×1.9)`. 달(Pretendard 700 흰 글자) + 날씨 아이콘을 넣고, 구멍 두 개와 점선 절취선을 그린다.
    - `.cal-body`: `.cal-day`(고운바탕 700 `fs×4.1`), `.cal-dow`(Pretendard 700 `--sky-700`, 일요일은 `--pink-700`), `.cal-line`(──✦──), `.cal-sub`(고운돋움 `--ink-2`)
  - `.week`(선택): 월~금 점. 지난 날은 하늘, 오늘은 분홍 + 후광.
- 날짜 나누기:
  - `main`이 `/^(\d+)월 (\d+)일 (.)요일$/`이면 달·숫자·요일로 나눈다.
  - 아니면(`몇 주 뒤, 여름방학`) `.cal.text-only`로 쓰고, `.cal-day`에 문장 전체를 `fs×1.55`로 넣는다.
- 날씨 아이콘 `data-wx`: 배경 id가 `*_rain`이면 `rain`, `*night`·`festival*`이면 `moon`, 그 밖에는 `sun`.
- `kicker`와 `week`는 card 스텝의 선택 필드로 두거나 `config.DATES` 키(d1~d5, r1~r5)로 계산한다.
- 스크린리더 안내(`announce(main · sub)`)는 그대로 둔다.

### 6.9 시스템 시트 `.overlay.sys > .panel.sys` (저장·불러오기·설정·기록)
- 화면 전체를 덮는다.
  - 오버레이: `backdrop-filter: blur(18px) saturate(1.15)`에 하늘→흰→분홍 베일을 깔고, 오른쪽 위에 햇빛, 왼쪽 아래에 분홍 번짐을 둔다.
  - 패널 여백: 세로 `clamp(10px, 2.6vh, 26px)`, 가로 `clamp(14px, 3.2vw, 48px)`, 각각 safe-area를 더한다.
- 머리줄 `.panel-head`(높이 48px 이상):
  - 순서: `h2.sr-only`(화면 이름, 대화상자 이름표 역할) · `.head-star` · **`.sys-tabs`** · 빈칸 · `.btn.close`
  - 아래에 1px 하늘→분홍 선을 긋는다.
- `.sys-tabs[role=tablist]`:
  - 탭은 알약 세그먼트다. 버튼 높이 44px, 아이콘 + 글자.
  - 플레이 중에는 저장하기·불러오기·설정·대화 기록 4개, 타이틀에서는 불러오기·추억 앨범·설정 3개다(추억 앨범은 타이틀에서만, 6.17).
  - 선택된 탭은 흰 알약, 800 굵기, 아래 2px `--pink-300` 안쪽 선, 분홍 아이콘이다.
  - **탭을 바꿔도 오버레이는 하나다.** 같은 패널의 본문만 다시 그리고 `p.dataset.panel`을 바꾼다. 그래서 Esc 한 번에 닫히고 inert·포커스 복귀 로직도 유지된다.
  - 폭 760px 이하에서는 아이콘을 숨긴다. 600px 이하에서는 가로 스크롤한다.
- 닫기 `.btn.close`: ✕ + "닫기" 44px. 폭 700px 이하에서는 아이콘만 남긴 44×44(`aria-label="닫기"`).
- 아래 안내 `.panel-hint`: 별 + 안내 + 쪽 번호(16px `--ink-3`). 높이 540px 이하에서는 숨긴다.

### 6.10 저장·불러오기 `[data-panel=save|load]`
- 본문은 `grid: auto | 1fr`로, 왼쪽에 **쪽 레일**, 오른쪽에 **슬롯 그리드**를 둔다.
- 쪽 레일 `nav.rail[aria-label=쪽]`:
  - 버튼은 `자동·퀵`, `1`~`5`다. 높이 44px 이상, 폭 64px 이상, Pretendard 700.
  - 현재 쪽은 흰 알약에 왼쪽 하늘→분홍 3px 띠를 붙이고 `aria-current="page"`를 준다.
  - `자동·퀵` 쪽에는 자동 저장과 퀵저장 2칸이 있다. 1~5쪽은 수동 슬롯 1~30(쪽당 6칸)이다.
- **처음 열 때 보이는 쪽**:
  1. 이번 세션에서 마지막으로 본 쪽(메모리에만 저장)
  2. 그런 쪽이 없으면 1쪽
  3. 단, 불러오기 화면에서 1~5쪽이 모두 비어 있고 자동·퀵에 저장이 있으면 `자동·퀵` 쪽
  - 슬롯을 지우거나 저장해서 다시 그릴 때는 지금 쪽을 유지한다.
- 그리드:
  - 넓은 화면은 3열 × 2줄이 남은 높이를 꽉 채운다. 카드는 썸네일(남는 높이 전부) + 정보 2줄이다.
  - 높이 540px 이하 또는 폭 600px 이하에서는 가로형 카드 2열 × 3줄로 바꾸고, 세로 화면에서는 1열 × 6줄로 쓴다.
  - 썸네일은 카드 높이에 맞춘 16:9(최대 폭 34%)이고, 정보는 3줄(장면 제목+루트 점 / 날짜 / 발췌)이다.
- 카드 `button.slot[data-slot]`:
  - 흰 유리 82%, 반경 16px, 패딩 8px. 마우스를 올리면 하늘 2px 테. 가장 최근 저장 `.latest`는 분홍 2px 테.
  - `.slot-no`: 썸네일 왼쪽 위 남색 알약 `01`(Pretendard 800, 16px 이상). 자동·퀵 카드는 `자동` / `퀵`.
  - `.slot-route`: 루트 배지(인물 색, 넓은 화면만). 좁은 화면에서는 장면 제목 앞에 9px 점 `.slot-r`.
  - `.slot-name` 700, `.slot-meta` `MM.DD HH:mm`(같은 해면 연도 생략), `.slot-text` 고운돋움 1줄 말줄임.
  - 빈 칸 `.empty`:
    - 하늘 사선 무늬와 점선 테를 두른다.
    - 저장 화면에서는 `.can-save`를 붙인다. 넓은 화면은 썸네일 자리에 "＋ 여기에 저장"을, 좁은 화면은 "＋"를 넣고 제목은 "여기에 저장"(`--sky-700`)이다.
    - 불러오기 화면에서는 `disabled`에 "비어 있음"이다.
  - 손상된 저장: `.broken` 클래스(그대로).
- 삭제 `.slot-wrap > .slot-del`:
  - 44×44 흰 원에 휴지통 아이콘(빨강 `#a32e3f`)이다.
  - 넓은 화면은 썸네일 오른쪽 위, 좁은 화면은 카드 오른쪽 가운데에 둔다. 좁은 화면에서는 카드 본문 오른쪽 54px를 비워 글자를 가리지 않는다.
  - 자동 저장에는 삭제 버튼이 없고, 퀵저장에는 있다.
- **썸네일 = 미니 무대**:
  - 저장 데이터의 `state.stage`(bg, chars{outfit,hair,expr,pos}, order)로 그린다. `span.slot-thumb{background: url(bg)}` 안에 `img`(left 27/50/73%, bottom −18%, height 116%, `loading=lazy`, `alt=""`)를 넣는다.
  - 캔버스 캡처나 이미지 저장이 필요 없고 저장 용량도 늘지 않는다. 일러스트를 바꾸면 썸네일도 자동으로 새 그림이 된다.
  - stage가 없는 구버전·손상 저장은 배경색만 칠한다.

### 6.11 설정 `[data-panel=settings]`
- 본문 `.panel-body.cfg`는 2열이다: 왼쪽 분류 탭 `clamp(150px, 19vw, 210px)`(휴대폰 138px), 오른쪽 패널.
  - **스크롤은 `.panel-body` 하나**다. 기존 테스트(layout.spec의 설정 터치 스크롤)가 이 요소를 쓴다.
  - 분류 탭과 미리보기는 `position: sticky; top: 0`으로 따라온다.
- 분류 탭 `.tabs[role=tablist][aria-orientation=vertical] > button.tab[data-cfg]`:
  - `글자·대사창` / `소리` / `화면·조작`. 높이 48px(휴대폰 44px).
  - 선택된 탭은 흰 카드에 왼쪽 하늘→분홍 3px 띠다. 화살표 키로 옮겨 다닌다.
  - 세 패널(`role=tabpanel`)은 모두 DOM에 두고 `hidden`만 바꾼다.
- 패널 구성:
  - **글자·대사창**: 글자 속도, 자동 진행 속도, 대사창 불투명도(**40~100**), **글자 크기**(보통·크게·더 크게, `role=radiogroup` 세그먼트) + 오른쪽 미리보기
  - **소리**: 배경음 음량(`data-setting=bgmVolume`), 효과음 음량(`sfxVolume`, 손을 뗄 때 효과음을 낸다)
  - **화면·조작**: 전체화면 스위치, 빛망울 효과 스위치(`particles`), 키 안내 표(`kbd`: Enter/Space/클릭 = 다음, A 자동, S 스킵, L 기록, F5 퀵저장, F9 퀵로드, H 숨기기, Esc 메뉴, 1~3 선택지), 기존 `.setting-note` 문구
- 설정 행 `.setting`:
  - 흰 유리 62%, 반경 14px.
  - 넓은 화면: `라벨 | 값` 한 줄 + 전체 폭 슬라이더 + 양끝 눈금 글자(느리게/즉시, 여유 있게/빠르게, 투명하게/선명하게, 16px `--ink-3`).
  - 높이 540px 이하: `라벨 | 슬라이더 | 값` 한 줄(48px), 눈금 숨김.
- 슬라이더:
  - 입력 높이 44px. 트랙 8px(채운 쪽 하늘→분홍, 나머지 `#dbe7f2`).
  - 손잡이는 26px 흰 원에 2px `--sky-500` 테와 안쪽 하늘 고리를 그린다.
  - 채움 비율은 `--p`로 input 이벤트마다 갱신한다. Firefox는 `::-moz-range-progress`를 쓴다. `touch-action: pan-y`를 유지한다.
- 값 `output`: `--sky-100` 알약에 `--sky-700` 700.
- 스위치: 52×30 트랙, 24px 손잡이, 켜짐은 하늘. 실제 `input[type=checkbox]`를 위에 겹쳐 터치 영역 44px를 확보한다.
- **미리보기** `.preview[aria-hidden=true]`:
  - 16:9(휴대폰 4:3) 작은 무대(교실 배경 + 히나) 위에 실제 `.textbox`를 축소해 붙인다(`--fs: max(16px, 5.2cqw)`, container query).
  - 글자 속도를 바꾸면 예시 문장("이 정도 속도면 읽기 편해? 천천히 골라 봐.")을 처음부터 다시 타자한다. 다 쓰면 자동 진행 속도만큼 쉬고 반복한다.
  - 불투명도와 글자 크기는 즉시 반영한다.
  - 미리보기 안 TextBox의 live 영역은 스크린리더가 읽지 않게 한다.
- 바닥줄 `.panel-foot`: "바꾼 설정은 바로 저장돼요."(세로 화면에서는 숨김) · `기본값으로`(.btn) · `닫기`(.btn.primary).

### 6.12 대화 기록 `[data-panel=log]`
- 가운데 열 최대 56em. 본문 위 22px 페이드 마스크. 열면 맨 아래로 스크롤한다.
- 항목 `.log-item.is-<kind>`(**`is-say | is-mono | is-card | is-choice`**, 부록 A):
  - 2열 그리드 `6.5em | 본문`. 패딩 .55em 1em, 반경 12px, 고운돋움 1.04em, 줄 높이 1.6.
  - 이름 `.log-name`: 주아 `max(16px, .92em)`, 오른쪽 정렬, 인물 색이다. 색은 `.k-osana / .k-tenko / .k-me`가 고르고 그 밖은 npc 색이다. 인라인 `--name-color`는 쓰지 않는다.
  - 독백 `.is-mono`: 본문만, `--ink-2`, 왼쪽에 2px `--sky-200` 선.
  - 날짜 카드 `.is-card`: 가운데 구분선 `── 7월 6일 월요일 · 2학년 3반 조례 ──`(고운바탕 700, `--sky-700`).
  - 선택 `.is-choice`: 본문 열에 분홍 알약(`--pink-50` 바탕, `--pink-700` 글자). 앞에 "선택" 배지(`--pink-700` 바탕, 흰 글자)를 단다. 저장된 문구의 `▶ ` 접두어는 표시할 때만 뗀다.
  - 마지막 항목 `.now`: 흰 78% 카드 + 하늘 1px 테.
- 세로 화면: 이름이 위, 본문이 아래인 1열.

### 6.13 메뉴·확인창 `.panel.small`
- 공통:
  - 가운데 작은 유리 카드. 폭 `min(100%, 460px)`(메뉴는 520px), 반경 20px, 흰→하늘 그라데이션.
  - 안쪽 장식선은 inset 6px.
  - 오버레이는 `rgba(30,64,110,.28)`에 블러 6px.
- 메뉴 `[data-panel=menu]`:
  - 머리줄은 "✦ 메뉴"(주아)와 ✕(44×44)다.
  - 3열 아이콘 타일(높이 76px, 아이콘 24px `--sky-600`): 저장하기 · 불러오기 · 대화 기록 · 설정 · 전체화면 · 타이틀로.
  - 맨 아래에 넓은 `.btn.primary.wide` "▶ 게임으로 돌아가기"(52px)를 둔다.
  - `data-action`(save/load/log/settings/fullscreen/title/resume, close)은 유지한다. 844×390에서 스크롤 없이 들어간다.
- 확인창 `[data-panel=confirm]`:
  - `h2.sr-only`는 "확인"이다.
  - **`.dialog-msg`에 메시지 전체를 담는다**(테스트가 `손상`, `새로운 버전`, `장면 처음부터` 같은 문구를 `.dialog-msg`에서 찾는다).
    - 첫 줄은 `.dialog-msg` 안의 `<strong class="lead">`로, 주아 `clamp(20px, --ui×1.3, 26px)`에 별을 붙여 제목처럼 보인다.
    - 둘째 줄부터는 본문이고, 마지막 보충 줄은 `<small>`(`--ink-2`)이다.
  - 오른쪽 아래에 `취소`(.btn)와 확인(.btn.primary, 삭제는 .btn.danger)을 둔다. `data-action=ok/cancel`, `data-autofocus`는 유지한다.

### 6.14 타이틀 `.title-screen`
- 배경: `title` 그림을 꽉 채운다(cover).
  - 오른쪽 위에 햇빛 원과 원뿔 그라데이션 빛줄기(screen 합성)를 그린다.
  - 왼쪽에는 흰 베일(0→52%)을 깔고, 빛망울 26개를 띄운다.
- 키 비주얼: 아카네 `left 58%`, 히나 `left 81%`(앞쪽), 높이 120%, bottom −24%, 그림자. 일러스트를 바꾸면 이 두 값만 조정한다. 인라인 style을 쓰지 말고 `.title-heroines .akane/.hina` 클래스로 지정한다.
- 왼쪽 열(`left: clamp(18px, 5vw, 80px)`, 폭 `min(46vw, 560px)`):
  - 로고 `h1.logo[aria-label="내일도 같이 갈래?"]`:
    - 1줄 "내일도"는 분홍 그라데이션, 2줄 "같이 갈래?"는 하늘 그라데이션이고 "?"만 분홍이다.
    - 앞 글자는 `background-clip:text`, 뒤 글자(`::before content: attr(data-text)`)는 흰 외곽선 .2em과 하늘 바닥 그림자의 두 겹이다.
    - "?" 오른쪽 위에 반짝이는 별이 있고, 뒤에 비행기구름 SVG(흰 선 두 줄 + 종이비행기)를 깐다.
  - 부제(고운바탕 700, 16~20px): 왼쪽 분홍 3px 띠 + 흰 반투명 리본
  - 세로 메뉴 `.title-menu`:
    - 폭 `clamp(232px, 24vw, 300px)`, 버튼 높이 `clamp(44px, 7.4vh, 56px)`, 간격 `clamp(6px, 1.3vh, 12px)`.
    - 버튼은 **`.btn` 클래스를 유지**한다(테스트 `.title-menu .btn`). 흰 유리 알약에 왼쪽 하늘 마름모를 단다.
    - 순서는 새 게임 · 이어하기 · 불러오기 · 추억 앨범 · 설정(`data-action=new/continue/load/album/settings`).
    - `새 게임`은 `.primary`(`--grad-primary`)다.
    - [추억 앨범] 오른쪽에는 모은 수 `<span class="sub">3 / 11</span>`(이어하기 날짜와 같은 모양, `aria-describedby`)를 둔다.
    - 높이 540px 이하에서는 [추억 앨범]·[설정](`.half`)을 한 줄에 반씩 나란히 놓아 메뉴가 4줄을 넘지 않게 한다(모은 수는 숨김). 높이 360px 이하에서는 부제를 접고 로고·간격을 줄인다.
    - 마우스를 올리면 오른쪽으로 6px 이동하고 하늘 테가 생기며 마름모가 분홍으로 커진다.
    - 비활성은 회색 마름모. 글자는 줄바꿈하지 않는다.
  - **이어하기 옆 날짜** `<span class="sub">7월 10일</span>`(16px `--sky-700`, `aria-describedby`): `saves.peek('auto').summary.sceneTitle`에서 날짜 부분만 쓴다.
  - 엔딩 배지(맨 아래): 흰 알약 + 별. 본 엔딩은 인물 색 테와 별(`--c`), 못 본 엔딩은 회색 별에 title "아직 보지 못한 엔딩". `data-ending`, `data-reached`는 유지한다.
- 버전 표기 `.ver`: 오른쪽 아래 흰 알약(16px). 세로 화면에서는 숨긴다. 임시 에셋 안내는 "임시 그림"으로 줄여 같은 알약에 넣는다.

### 6.15 엔딩 `.ending-screen`
- 배경: 마지막 장면 배경에 `blur(5px)`를 걸고, 오른쪽으로 갈수록 어두워지는 남색 베일을 덮는다. 불꽃 3개(반복 원뿔 그라데이션 고리, 4.2s 반복, 지연을 서로 다르게)와 금·분홍 빛망울 22개.
- `.ending-layout`: 2열(`1.05fr | 1fr`), 간격 `clamp(20px, 5vw, 72px)`. 세로 화면은 1열 가운데.
- 왼쪽 **폴라로이드** `figure.polaroid`:
  - 폭 `min(100%, 560px, (100vh − 120px)×1.5)`. 흰 테 `clamp(8px, 1.1vw, 14px)`, −3° 기울임.
  - 위 두 모서리에 테이프(하늘·분홍)를 붙인다.
  - 안은 **미니 무대**(저장 썸네일과 같은 구성)다. 엔딩 직전 `state.stage`로 그리고, 나중에 이벤트 CG가 생기면 그 그림을 쓴다.
  - 캡션(고운바탕 700)은 "8월 8일, 아사히 강 여름 축제"(`{fest}` 날짜 + `{festival}`)다.
- 오른쪽 `.ending-inner`(왼쪽 정렬, 위→아래):
  1. 엔딩 배지 `.end-kicker`(주아, 인물 색 그라데이션, 별)
  2. 「제목」(고운바탕 700)
  3. `✦──`(햇살색)
  4. 진행 메달(본 엔딩은 인물 색, 못 본 엔딩은 반투명) + "엔딩 1 / 2 · 다른 이야기도 기다리고 있어요"
  5. `.btn.primary[data-action=to-title]` "⌂ 타이틀로"(48px, 최소 폭 200px)
- "END" 영문 대신 "아카네 엔딩" 배지를 쓴다. 페이드인은 1.2s로 지금과 같다.

### 6.16 버튼·포커스 공통
- `.btn`:
  - 최소 44×44, 알약 모양, 흰 85% 바탕 + 하늘 테, Pretendard 600 `--ui`.
  - `.primary`는 `--grad-primary` 바탕에 흰 글자, `.danger`는 `#a32e3f` 글자·테, `.icon`은 44×44.
- `.seg`(세그먼트): 하늘 55% 바탕 알약. 선택된 버튼(`aria-selected=true`·`aria-checked=true`)은 흰 알약에 `--sky-700`.
- **포커스**(모든 조작 요소, `:focus-visible`): `outline: 3px solid var(--focus); outline-offset: 2px; box-shadow: 0 0 0 6px rgba(255,255,255,.85)`. 밝은 바탕과 어두운 바탕 모두에서 보인다.
- 세로 안내 `.rotate`: 흰 유리 카드에 하늘 휴대폰 그림, `세로 화면으로 계속하기`(.btn)를 둔다. 문구는 지금 것을 그대로 쓴다.

### 6.17 추억 앨범 `[data-panel=album]`(타이틀 시트의 탭)·감상 `[data-panel=viewer]`
- 목적: 플레이 중 본 이벤트 CG(전역 기록 `cgs`, 새 게임을 해도 남음)를 다시 본다. 플레이 중 메뉴·시트에는 넣지 않는다.
- 본문 `.panel-body.album[data-seen][data-total]`(스크롤은 이 요소 하나, 남는 높이는 위아래로 나눠 가운데):
  - `.album-sum`: "✦ 모은 추억"(주아) + `.album-total`(`3 / 11`, 숫자는 `--sky-700` 800, 다 모으면 `--pink-700`) + 진행 막대 `.album-bar[role=progressbar]`(하늘→분홍) + 안내 한 줄(0장 / 일부 / 전부에 따라 문구가 바뀜).
  - 묶음 `section.album-group[data-route=osana|tenko]`: 머리 `.album-head` = 이름 알약 `h3.album-name`(이름표와 같은 인물 색 칠) + `.album-count`(`1 / 5`) + 옅어지는 선. 소나기 CG(`rain_*`)는 각 히로인 줄에 들어간다(`CGS[id].route`). 루트가 없는 CG 는 맨 뒤 '공통' 묶음.
  - 그리드 `ul.album-grid`: 넓은 화면은 한 줄 6칸(히로인 한 명 = 한 줄), 좁으면 칸 최소 폭(168px, 높이 540px 이하 136px)에 맞춰 줄어든다(844×390 → 5칸, 667×375 → 4칸, 세로 → 2칸, 세로 스크롤).
  - 칸 `button.cg-card[data-cg][data-seen]` = **폴라로이드**: 흰 테 7px + 16:9 작은 그림(`cgThumbUrl`, lazy, 받으면 페이드) + 제목(고운바탕 700 16px, 두 줄까지 균형 줄바꿈). −1.1°~1° 번갈아 기울이고 위 가운데에 테이프 한 조각(하늘·분홍 번갈아). 올리면 똑바로 서며 하늘 2px 테.
  - 못 본 칸 `.locked[aria-disabled=true]`: 기울이지 않은 점선 빈 칸 + 하늘 사선 무늬 + 자물쇠, 제목 `???`. 누르면 자물쇠만 흔들린다(아무것도 열지 않음).
  - 아래 안내 `.panel-hint`: 크게 보기·넘기기·숨기기 안내 + `3 / 11장`.
- 감상 `.overlay.viewer > .viewer[role=dialog][aria-modal][aria-label=추억 보기][data-cg][data-ui=on|off]`(앨범 시트 위에 겹친 오버레이):
  - 원본(`cgUrl`)을 `object-fit: contain`으로 화면 가득, 바깥은 같은 그림(작은 그림)을 레터박스와 같은 배합으로 밝게 흐린다. 원본은 해독(`decode()`)한 뒤 0.38s 페이드, 넘길 때는 새 장을 해독한 뒤 겹쳐 떠오른다. 다음·이전 원본은 미리 받아 둔다.
  - 조작: 오른쪽 위 `닫기`(✕ + 글자, 700px 이하 아이콘만), 좌우 가운데 52px 둥근 유리 버튼(세로 화면에서는 그림을 가리지 않게 아래 줄 캡션 양옆), 아래 가운데 캡션 `.vw-cap`(인물 알약 · 제목 고운바탕 · `2 / 4`, `aria-live=polite`).
  - ←/→·PageUp/PageDown·Home/End·좌우 버튼·스와이프(48px 이상 가로로 밀기)로 '본 그림' 사이를 오간다(끝에서 처음으로 돈다). Enter·Space(버튼 밖)는 다음 그림.
  - Esc·닫기·그림 밖 빈 곳(흐린 바탕) 클릭으로 닫는다. 그림을 누르거나 H·오른쪽 클릭이면 글자·버튼을 숨기고, 숨긴 동안에는 아무 클릭·키(화살표·Esc 제외)로 다시 보인다.
- 입력 안전: 오버레이는 `[data-noadvance]`이고 클릭은 안에서 전파를 멈춘다. 키는 game.ts `onKey`가 맨 위 오버레이 패널의 `onKey`에 먼저 넘긴다. 감상 중 아래 시트·타이틀은 `inert`. 타이틀에서 연 오버레이는 닫히면 늘 연 버튼으로 포커스를 돌려준다(감상 → 마지막으로 본 칸, 앨범 → [추억 앨범]).
- 기록: game.ts 는 무대에 CG 가 뜰 때마다(`cg` 이벤트, 불러오기 직후, 장면 처음부터 복구, 건너뛰기 중 모두) `saves.markCg`로 전역 기록에 남긴다.

---

## 7. 화면별 구성 (아래부터 쌓이는 순서)

| 화면 | 구성 |
|---|---|
| 타이틀 | 배경(title) → 햇빛·빛줄기 → 왼쪽 흰 베일 → 두 히로인 → 빛망울 → 왼쪽 열(로고·부제·세로 메뉴·엔딩 배지) → 버전 알약 |
| 대사(낮) | 레터박스(밝게 흐림) → 무대(배경·인물·햇빛·옅은 빛망울·장소 표시) → 대사창(이름표 탭) → 빠른 메뉴 탭 → 토스트(무대 오른쪽 위) |
| 대사(밤) | 위와 같고 `data-tone=night`: 남색 유리 창·탭·장소 표시(달), 금·분홍 빛망울 |
| 선택지 | 무대 + 베일(두 인물 dim) → 대사창(질문 문구) + 빠른 메뉴 탭 → 선택지 목록(탭 띠 위까지) |
| 날짜 카드 | 무대 → 카드(흐린 다음 배경·베일·빛망울·kicker·일력·주간 점) → 빠른 메뉴 캡슐(무대 오른쪽 아래, .78) |
| 숨기기 | 무대만, 아래 가운데 안내 알약 |
| 저장하기 | 시트(탭 4개, 저장하기 선택) → 쪽 레일 + 3×2 카드 → 안내 줄(쪽 번호) |
| 불러오기 | 시트(타이틀에서는 탭 2개) → 처음 쪽 규칙(6.10) → 자동·퀵 2칸 또는 수동 6칸 |
| 설정 | 시트 → 분류 탭 + 행 + 미리보기 → 바닥줄 |
| 대화 기록 | 시트 → 가운데 열 기록(맨 아래부터) |
| 메뉴 | 흐린 무대 → 작은 유리 카드(3열 타일 + 돌아가기) |
| 확인창 | 흐린 무대 → 작은 유리 카드(질문 lead + 본문 + 취소·확인) |
| 엔딩 | 흐린 밤 배경·베일 → 불꽃·빛망울 → 폴라로이드 + 제목 묶음 |

---

## 8. 애니메이션

| 대상 | 내용 | 시간·곡선 |
|---|---|---|
| 배경 전환 | 크로스페이드(지금과 같음) | 0.55s ease |
| 인물 등장·퇴장 | 아래 2.5% → 제자리 + 페이드, dim은 filter 전환 | 0.35s ease |
| 대사창 표시 | opacity + translateY(6px→0) | 0.25s ease-out |
| 이름표 | 화자가 바뀌면 색만 전환, 글자는 즉시 | 0.2s |
| 다음 표시 별 | 위아래 5px + 0→45° 회전 + 크기 .85↔1 | 1.4s ease-in-out 반복 |
| 빠른 메뉴 | 마우스 올림 바탕 전환, 켜짐 채움 | 0.15s |
| 숨기기 | 창·탭·선택지 opacity, 안내는 2.4s 뒤 페이드아웃 | 0.25s / 0.6s |
| 선택지 | 아래→위 8px + 페이드, 0.07s 간격 / 마우스 올림 scale 1.015 | 0.35s / 0.18s |
| 장소 표시 | 왼쪽 8px → 제자리 + 페이드, 3.2s 뒤 퇴장 | 0.5s |
| 날짜 카드 | 카드 전체 페이드. 일력은 위 −18px·−5°에서 −1.5°로 떨어지듯 | 0.5s / 0.7s `cubic-bezier(.2,.8,.2,1)` |
| 시스템 시트 | 오버레이 페이드 + 패널 1.5% 확대→1. 탭 전환은 본문만 0.15s 페이드 | 0.22s `cubic-bezier(.2,.8,.2,1)` |
| 저장 성공 | 해당 카드의 분홍 테가 한 번 빛남(box-shadow 펄스) + 토스트 | 0.6s |
| 빛망울 | 위로 36px·좌우 ±15px 떠오름(alternate), 별은 반짝임 | 8~18s / 4s |
| 타이틀 빛줄기 | 원뿔 그라데이션 ±3° 흔들림 | 12s alternate |
| 엔딩 | 화면 페이드 1.2s, 폴라로이드는 24px·−8°에서 −3°로, 불꽃 고리 scale .55→1 + 페이드 | 1.2s / 4.2s 반복 |

- `prefers-reduced-motion: reduce`이거나 설정 `빛망울 효과`가 꺼져 있으면 빛망울·빛줄기·불꽃·다음 표시·일력·폴라로이드 애니메이션을 멈춘다(정지 이미지로 남김). 전환은 0.01s.
- 빛망울은 `transform`과 `opacity`만 쓰고 개수에 상한을 둔다(타이틀 26, 대사 9, 카드 16, 엔딩 22).
- `backdrop-filter`가 무거운 기기를 위해 `@supports not (backdrop-filter: blur(1px))`에서는 유리 불투명도를 +0.1 올린다.

---

## 9. 반응형 규칙

### 9.1 배치 공식 (`src/ui/layout.ts`)

`scale`은 글자 크기 설정의 배율이다(보통 1, 크게 1.12, 더 크게 1.25).

가로(overlay):
```
fs     = clamp(sh × 0.034 × scale, 16 × scale, 26 × scale)
margin = max(8, sh × 0.022)                                          → --m
th     = clamp(max(sh × 0.22, textBoxHeightFor(3, fs)), 0, sh × 0.45) (지금 0.265 → 0.22, 3줄 용량은 그대로)
tw     = min(sw − margin×2, fs × 46);  tx = sx + (sw − tw)/2;  ty = sy + sh − th − margin   (그대로)
btn    = clamp(fs × 1.75, 40, 44)
hy     = ty − btn                       (이름표·빠른 메뉴 탭 띠 위끝)
hr     = vw − (tx + tw) + fs × 0.55 + 10
cy     = sy + margin;  ch = max(0, hy − CHOICE_CLEAR − cy)   (CHOICE_CLEAR = 4)
cx/cw  = 지금과 같음(레터박스가 있으면 안전 영역 폭)
cband  = cy − sy                        (호환용으로만 둔다)
qm     = tw ≥ 900 ? 'icons' : tw ≥ 620 ? 'full' : 'compact'
```

세로(below):
```
fs  = clamp(aw × 0.042 × scale, 16 × scale, 22 × scale)
btn = clamp(fs × 1.75, 40, 44)
gap = btn + 8          (무대와 대사창 사이에 이름표·빠른 메뉴 탭이 들어간다)
나머지(sh, th, sy, tw) 계산은 지금과 같고, gap만 바뀐다
hy  = ty − btn;  cy = sy + 8;  ch = max(0, hy − 4 − cy)
```

계산 결과(목업의 `computeLayout`으로 실측):

| 화면 | fs | 대사창 높이 | 창 폭 | 탭 띠 위끝(무대 대비) | 선택지 영역(새/지금) | dense | qm |
|---|---|---|---|---|---|---|---|
| 1920×1080 | 26 | 238 | 1196 | 71.7% | 747 / 702 | 0 | icons |
| 1280×720 | 24.5 | 159 | 1126 | 69.7% | 482 / 450 | 0 | icons |
| 1024×768 | 19.6 | 128 | 901 | 68.6% | 379 | 0 | icons |
| 844×390 (노치 47/21) | 16 | 105 | 640 | 58.5% | 204 | 0 | full |
| 844×390 | 16 | 105 | 676 | 60.6% | 224 / 223 | 0 | full |
| 667×375 | 16 | 105 | 650 | 59.1% | 209 / 209 | 0 | full |
| 740×320 | 16 | 105 | 553 | 52.2% | 155 | 1 | compact |
| 740×280 | 16 | 105 | 482 | 45.3% | 115 / 114 | 2 | compact |
| 740×232 (지원 범위 밖) | 16 | 104 | 396 | — | 68 | 3 | compact |
| 390×844 (세로) | 16.4 | 164 | 374 | — | 215 | 0 | compact |

dense 단계는 단위 테스트의 기대값(844×390 노치 0, 667×375 0, 740×320 1, 740×280 2, 740×232 3)과 모두 같다.

### 9.2 넘침 안전장치 (`textbox.ts`)
- `--tb-grow`를 **`#vn` 루트에** 설정한다. 그러면 `.textbox`와 `.qbar`가 같이 위로 올라간다.
- 늘릴 수 있는 한도: `maxGrow = hy − (sy + m)`. 빠른 메뉴 탭의 위끝이 무대 위 여백보다 올라가지 않는다.
- 글자 크기를 '크게' 이상으로 하면 3줄을 넘는 문장이 생길 수 있다(예: 740×320에서 '더 크게'는 한 줄 약 25자). 이때는 이 안전장치가 처리한다. 대본 검증(`LINE_MAX_CHARS`)은 '보통' 기준을 유지한다.

### 9.3 미디어 쿼리 (CSS)

| 조건 | 바뀌는 것 |
|---|---|
| `max-height: 540px` | 저장 카드 가로형 2×3, 안내 줄 숨김, 설정 행 한 줄·눈금 숨김·미리보기 4:3·미리보기 제목 숨김, 타이틀 위 여백 10px·메뉴 간격 5px·높이 44px, 엔딩 간격 압축 |
| `max-width: 760px` | 시스템 탭 아이콘 숨김, 머리 별 숨김 |
| `max-width: 700px` | 닫기 버튼 아이콘만 |
| `max-width: 600px` | 시스템 탭 가로 스크롤, 저장 1열 × 6, 설정 탭 가로 줄·1열, 기록 1열, 설정 바닥 안내 숨김 |
| `max-aspect-ratio: 1/1` | 타이틀 세로 배치(로고 위, 메뉴 아래, 히로인 가운데 64%), 엔딩 1열 |

### 9.4 노치·안전 영역
- 무대는 지금처럼 안전 영역 안에 contain으로 놓고, 레터박스가 노치 쪽을 덮는다.
- 시스템 시트, 오버레이, 타이틀 왼쪽 열, 버전 알약, 엔딩, 토스트(아래쪽일 때)에 `env(safe-area-inset-*)`를 더한다.

---

## 10. 접근성

- **대비**:
  - 본문 14.2:1, 보조 8.2:1, 안내 5.3:1. 이름표 흰 글자 4.7~6.2:1.
  - 흰 글자를 올리는 모든 채움(`--grad-primary/-on/-cal`, `--pink-700`, 인물 색)은 4.5:1 이상이다.
  - `--sky-400~600`, `--pink-400/600`, `--sun`은 장식과 아이콘에만 쓴다.
  - 밤 유리 글자는 13.9:1이다.
  - 대사창 불투명도 하한을 40으로 올렸다. 저장된 30~39는 `sanitizeSettings`가 범위에 맞춰 40으로 바꾼다.
- **포커스**: 6.16의 이중 링. 버튼·탭·슬롯·슬라이더·스위치 모두에 적용한다. 목업의 메뉴 화면 '저장하기' 타일이 그 예다.
- **터치 영역**: 버튼 44px 이상, 빠른 메뉴 40px 이상, 선택지 48px 이상(dense일 때 44px). 목업 자동 점검에서 4가지 크기 46장 모두 위반 0건이다.
- **글자**:
  - 휴대폰 가로에서 16px 미만 글자는 없다(목업 자동 점검 0건).
  - 글자 크기 3단계, 글자 속도 미리보기를 제공한다.
  - 기록에서는 독백·선택·날짜를 색과 모양 두 가지로 구분한다(색만으로 구분하지 않는다).
- **스크린리더**:
  - 대사 live 영역, `.text`·`.name`의 aria-hidden은 지금과 같다.
  - 시트는 `role=dialog`에 sr-only h2로 이름을 붙인다. 탭은 `tablist/tab/tabpanel`과 `aria-selected`를 쓴다.
  - 쪽 레일은 `nav[aria-label=쪽]`과 `aria-current=page`, 글자 크기는 `radiogroup`을 쓴다.
  - 빠른 메뉴는 `role=toolbar`다. 아이콘만 보이는 단계에서도 글자는 textContent에 남겨 둔다(compact는 숨긴 버튼 자체를 빼는 방식).
  - 미리보기는 `aria-hidden`이다.
- **움직임**: `prefers-reduced-motion`과 빛망울 끄기 설정(8장).
- **입력 누수 방지**: `.qbar`, `.choices`, 오버레이, 타이틀, 엔딩, `.rotate`는 `[data-noadvance]`를 유지한다. 숨기기 복귀 입력은 대사를 넘기지 않는다.

---

## 11. 구현 체크리스트 (파일별)

### `package.json`
- [ ] `npm i pretendard@1.3.9 @fontsource/gowun-dodum@5.3.0 @fontsource/gowun-batang@5.3.0 @fontsource/jua@5.3.0` (dependencies)
- [ ] `src/main.ts`에 4장의 import를 넣는다. Vite가 woff2를 `dist/assets`로 복사하므로 상대 경로 빌드에서도 그대로 동작한다.

### `src/ui/styles.css`
- [ ] 전체를 교체한다(목업 `css/final.css`의 1~14장을 옮기고, 15장 "목업 전용"과 `.hover`·`.focus-demo` 클래스는 뺀다).
- [ ] 3·4장의 토큰과 아이콘 마스크 변수(`--i-*`)를 `:root`에 둔다. `color-scheme: light`, `body` 배경 `#dfeefb`.
- [ ] 지금 규칙 중 동작이 걸린 것은 유지한다: `.choices` 스크롤·dense 1~3·`:has()` 대체, 토스트 위치 3종, `.sr-only`, `.rotate`, reduced-motion.
- [ ] `.card` → `.stage > .card`, 기록 `.is-*`, `.qbar`, `.sys-tabs`, `.rail`, `.cal`, `.polaroid`, `.mini`, `.hide-hint`를 추가한다.
- [ ] `index.html`의 `<meta name="theme-color">`를 `#cfe6f8`로 바꾼다.

### `src/ui/layout.ts`
- [ ] 9.1 공식: `th` 0.22, `btn`, `hy = ty − btn`, `hr`, `cy = sy + m`, `ch`, `qm`, `scale` 인자.
- [ ] `Layout`에 `m`, `qm` 필드를 추가한다. `applyLayout`에서 `--m`과 `data-qm`을 설정한다. `--chip-top`은 빼거나 `fs×.7`로 둔다.
- [ ] 세로 `gap = btn + 8`.

### `src/ui/textbox.ts`
- [ ] `show(name, who, text, mono, cps)`: `who`는 `SpeakerId | ''`이고 `el.dataset.who = who`로 넣는다. `--name-color` 인라인은 없앤다(`showStatic`도 같게).
- [ ] `--tb-grow`를 루트(`this.el.closest('#vn')` 또는 생성자 인자)에 설정한다.
- [ ] `maxGrow()`의 한도를 `--hy − (--sy + --m)`으로 바꾼다.

### `src/ui/stage.ts`
- [ ] 장소 표시: ` · ` 앞을 날짜로 나누고 `<span class="ico">` + `<span class="sep">`을 넣는다. 해/달 아이콘은 `data-tone`을 따른다.
- [ ] 날짜 카드: `.card-bg`(`--bg` = 다음 배경), `.motes`, `.card-kicker?`, `.cal > .cal-head(.cal-month + .ico[data-wx]) + .cal-body(.cal-day, .cal-dow[data-dow], .cal-line, .cal-sub)`, `.week?`. 날짜 형식이 아니면 `.cal.text-only`.
- [ ] 톤: `onBackdrop`에서 `#vn[data-tone]`을 갱신한다(배경 메타데이터 `tone`).
- [ ] 빛망울 레이어 `.motes`를 하나 두고, 화면 종류에 따라 개수를 바꾼다. 설정 `particles`가 꺼져 있으면 비운다.

### `src/story/assets.ts`
- [ ] `BACKGROUNDS[id].tone?: 'day' | 'evening' | 'night'`를 추가한다.
  - night: festival_street, riverbank_night, road_night, shrine_night
  - evening: classroom_evening, riverbank_evening, road_evening
- [ ] 비 배경(road_rain, shoe_lockers_rain)은 id로 판별한다(`*_rain`).

### `src/engine/save.ts`
- [ ] `SlotId = 'auto' | 'quick' | \`${number}\``. 키는 `ashita.save.quick`이다(스키마 버전은 그대로 두고 슬롯 키만 추가).
- [ ] `MANUAL_SLOTS` 6 → 30. `latestManual()`의 반복 범위도 같이 바뀐다.
- [ ] `peek()`의 결과에 `stage`(bg, chars, order)를 더한다. 이미 전체를 파싱하므로 비용이 없다. 손상·구버전은 `stage` 없음.

### `src/engine/settings.ts`
- [ ] `windowOpacity` 범위를 `[40, 100]`으로 한다(기존 값은 sanitize가 보정).
- [ ] 새 키:
  - `textScale: 0 | 1 | 2`(기본 0, 배율 1 / 1.12 / 1.25)
  - `particles: boolean`(기본 true)
  - DEFAULT, RANGES, 검증을 함께 추가한다. boolean은 따로 검증한다.

### `src/ui/game.ts` (화면 부분은 새 `src/ui/screens/*.ts`로 나누기를 권장)

권장 분리: `screens/title.ts`, `screens/ending.ts`, `screens/sheet.ts`(탭 시트 틀 + saveload/settings/log 본문), `screens/menu.ts`(메뉴·확인창), `icons.ts`(아이콘 이름 → mask 변수). game.ts에는 상태·입력·진행만 남긴다.

1. [ ] **빠른 메뉴**:
   - `this.hud`(클래스 `hud`)를 `.qbar` 안에 넣고 `.qbar-extra`를 더한다.
   - `hudButtons`는 auto, skip, log, menu, qsave, qload, hide, config다. 각각 `data-q`, 아이콘 span, `title`(단축키 표시), extra 쪽에는 `aria-label`을 단다.
   - `setMode`의 보이기·숨기기는 `.qbar`에 건다.
   - `.qbar`와 `.hud` 모두 `data-noadvance`를 단다.
2. [ ] **퀵저장·퀵로드**:
   - 퀵저장은 확인 없이 `saves.write('quick', …)`하고 토스트 "퀵저장했어요"를 띄운다. 선택지 위에서도 된다.
   - 퀵로드는 비었으면 토스트 "퀵저장이 비어 있어요"를 띄운다. 있으면 `loadConfirmMessage('quick', '퀵저장')` 규칙대로 확인한 뒤 `handleLoadResult('quick', …)`.
   - 키는 F5와 F9다(브라우저 새로고침을 막으려면 `preventDefault`).
3. [ ] **숨기기(H)**: 6.5. `root.dataset.hidewin`. `requestAdvance`와 pointer·key 처리 맨 앞에서 복귀를 처리한다.
4. [ ] **시스템 시트**:
   - `openSheet(tab)` 하나가 탭 줄, 닫기, 본문을 만든다.
   - 탭을 바꾸면 같은 오버레이에서 `body.replaceChildren(...)`을 하고 `p.dataset.panel`을 갱신한 뒤 `syncInert()`.
   - 메뉴의 저장하기·불러오기·대화 기록·설정과 빠른 메뉴의 기록·설정은 모두 이 시트를 연다(지금처럼 메뉴 위에 겹쳐 연다).
5. [ ] **저장·불러오기 화면**:
   - 쪽 레일과 처음 쪽 규칙(6.10)을 적용한다.
   - `slotCard`는 미니 무대 썸네일, `.slot-no`, `.slot-info`(line1: `.slot-r?` `.slot-name` `.slot-meta`, `.slot-text`), `.latest`, `.empty(.can-save)`, `.slot-route`를 그린다.
   - 슬롯 이름은 '자동 저장' / '퀵저장' / `슬롯 N`. 날짜 형식은 `MM.DD HH:mm`.
6. [ ] **설정**:
   - 분류 탭 3개와 패널 3개(모두 DOM에 두고 `hidden` 토글).
   - 글자 크기 세그먼트. 바뀌면 `relayout()`을 부른다.
   - 미리보기는 작은 `TextBox` 인스턴스로 `show('히나', 'tenko', 예시, false, charsPerSecond(textSpeed))`를 반복한다.
   - 빛망울·전체화면 스위치.
   - `.panel-foot .btn.primary`(닫기)는 유지한다.
7. [ ] **기록**:
   - 항목은 `log-item is-${kind}`이고 화자가 있으면 `k-${speakerId}`를 더한다.
   - 이름 span과 본문 `span.log-text`로 나눈다.
   - 선택 항목은 표시할 때 `▶ `를 뗀다. 마지막 항목에 `.now`.
   - `NAME_COLORS`와 인라인 `--name-color`는 없앤다. 화자 id가 LogEntry에 없으면 이름으로 거꾸로 찾는 방식을 유지한다.
8. [ ] **확인창 `ask()`**: 메시지 첫 줄은 `.dialog-msg > strong.lead`, 나머지 줄은 텍스트(`white-space: pre-line`), 보충 줄은 `<small>`. h2는 sr-only "확인". ✕ 없이 취소 버튼만 둔다(Esc 처리는 지금과 같음).
9. [ ] **메뉴**: 3열 아이콘 타일 + `.btn.primary.wide` 돌아가기.
10. [ ] **타이틀**: 로고(`l1/l2` span + `data-text`), 비행기구름 SVG, `.title-menu .btn`, 이어하기 `.sub` 날짜, `.title-heroines .akane/.hina`, `.ver`, `.motes`.
11. [ ] **엔딩**: `.end-bg`(마지막 배경), 불꽃, `.ending-layout > figure.polaroid(.mini + figcaption) + .ending-inner`(배지·제목·선·메달·버튼). "END"는 뺀다.
12. [ ] **토스트**: 저장·퀵저장 성공 시 해당 카드 펄스(저장 화면이 열려 있을 때).

### 테스트(함께 고칠 것)
- [ ] `tests/unit/layout.test.ts`:
  - `expectChoicesClearOfHudAndTextbox`의 `L.cy ≥ L.hy + L.btn`을 `L.cy ≥ L.sy`와 `L.cy + L.ch ≤ L.hy`로 바꾼다.
  - 나머지 단언(대사창 3줄, dense 단계, cband)은 그대로 통과하는 값이다(9.1 표).
- [ ] `tests/e2e/layout.spec.ts` 149행:
  - 빠른 메뉴가 대사창과 함께 올라가므로 `grown.top ≥ grown.hudBottom`은 등호로 성립한다.
  - 소수점 때문에 `toBeGreaterThanOrEqual(grown.hudBottom − 0.5)`로 바꾸고, "HUD 위끝이 무대 위끝 이상" 단언을 추가한다.
- [ ] `tests/e2e/input.spec.ts` 42행: `[data-setting=bgmVolume]` 앞에 `await page.locator('[data-panel=settings] [data-cfg=sound]').click()`을 넣는다.
- [ ] 새 테스트 권장:
  - 숨기기 중 클릭·Enter가 대사를 넘기지 않음
  - 퀵저장 → 퀵로드 왕복
  - 탭 전환 후 Esc 한 번에 닫힘(`overlays` 1 감소)
  - 기록이 열려 있을 때 `.choice` 개수에 기록 항목이 섞이지 않음

---

## 12. 기존 테스트 훅 유지 목록

| 훅 | 위치 / 조건 |
|---|---|
| `#vn[data-mode/frame/step/layout/dense/overlay/auto/skip/rotate]` | 그대로 |
| `.hud button` 4개, 글자 `자동`·`스킵`·`기록`·`메뉴` | `.qbar > .hud` 안. compact에서도 4개는 항상 보인다. 새 버튼 글자(퀵저장·퀵로드·숨기기·설정)는 이 네 글자를 포함하지 않는다(`hasText` 부분 일치 충돌 없음) |
| `.hud` 버튼 ≥40px, 서로·대사창과 겹치지 않음 | 탭 아랫변 = 대사창 윗변(겹침 판정 0.5px 허용 안) |
| `.textbox`, `.textbox .text`(`aria-hidden=true`, `.hidden-char`), `.textbox` role 없음 | 그대로 |
| `.choices`(`.on`, `data-armed`, `.locked`), `.choice[data-option]` | 그대로. 번호는 `span.num[aria-hidden]` |
| `.toast` | 위치만 바뀜(무대 오른쪽 위 / 선택지 중 대사창 아래쪽 / 세로는 대사창 아래) |
| `[data-action=new/continue/load/album/settings]`, `.title-menu .btn` | 타이틀 버튼은 `.btn` 클래스 유지. [추억 앨범]의 모은 수는 `#vn-album-count` |
| `.title-screen [data-ending][data-reached]`, `.ending-screen[data-ending] [data-action=to-title]` | 그대로 |
| `[data-panel=menu|save|load|settings|log|album|confirm|viewer]` | 시트 탭을 바꾸면 값이 바뀐다 |
| `[data-panel=album] .album-total`, `.album-group[data-route]`, `.cg-card[data-cg][data-seen]`(잠긴 칸 `aria-disabled`), `[data-panel=viewer][data-cg][data-ui]`, `.vw-nav.prev/.next`, `.vw-close`, `.vw-count` | 추억 앨범·감상(6.17) |
| `[data-panel=menu] [data-action=save/load/log/settings/fullscreen/title/resume/close]` | 그대로 |
| `[data-panel=confirm] [data-action=ok/cancel]`, `.dialog-msg`(메시지 전체), `data-autofocus` | 그대로 |
| `.slot[data-slot]`(`1`~`30`, `auto`, `quick`), `.slot-wrap > .slot + .slot-del`, `.slot-meta`, `.slot-name`, `.slot-text`, `.broken`, 빈 슬롯 `disabled`(불러오기) | 1쪽이 기본. 처음 쪽 규칙(6.10)이 기존 테스트 흐름과 맞는다 |
| `[data-setting=textSpeed/autoSpeed/bgmVolume/sfxVolume/windowOpacity]`, `[data-panel=settings] .panel-body`(스크롤), `.panel-foot .btn.primary`, `.panel-head .btn` | bgmVolume은 '소리' 탭 안에 있다 |
| `[data-panel=save] .panel-head`, `[data-panel=menu] .btn` ≥44px | 그대로 |
| `[data-panel=log] .log-item` | 클래스 접미만 `is-*`로 바뀜 |
| `[data-action=keep-portrait]`, `.rotate` | 그대로 |

---

## 13. 위험·주의

| 항목 | 위험 | 대응 |
|---|---|---|
| 빠른 메뉴를 창에 붙이기 | 넘침 안전장치와 선택지 영역 계산의 회귀 | `--tb-grow`를 루트로 옮기는 것이 필수. 단위 테스트와 layout.spec으로 확인 |
| 탭 시트 | 오버레이 스택·inert·포커스 복귀와 얽힘 | 탭 전환은 본문만 교체하고 새 오버레이를 열지 않는다 |
| 숨기기 | 복귀 입력이 대사 진행으로 샘 | `requestAdvance` 맨 앞에서 처리 + `lockUi()` + 테스트 추가 |
| 글자 크기 | 3줄을 넘는 문장, dense 단계 변화 | 넘침 안전장치가 처리. fs 배율이 dense 계산에 들어간다 |
| 슬롯 30칸·퀵 | 저장 목록 순회 범위 | `latestManual`과 처음 쪽 판단은 `peek`을 30번 부른다. 쪽당 6칸만 그린다 |
| 글꼴 | 휴대폰 첫 진입 지연 | swap + 미리 불러오기. 화면에 나온 글자 조각만 받는다 |
| backdrop-filter | 구형 안드로이드 성능 | `@supports` 대체 + 빛망울 끄기 |
| 일러스트 교체 | 위치 조정 | 타이틀 히로인 2값(58%·81%), 엔딩은 미니 무대(무대 비율 그대로)라 조정 불필요 |

전체 분량은 2.5~3일로 본다(디자인 이식 1일, 시트·저장·설정 기능 1일, 숨기기·퀵·테스트·휴대폰 검수 0.5~1일).

---

## 부록 A. 현재 코드 결함 (재디자인과 함께 고칠 것)

대화 기록 항목의 클래스가 `log-item ${kind}`라서 `card`와 `choice`가 그대로 클래스 이름이 된다.
- **날짜 카드 항목**: 무대 카드용 `.card { position: absolute; inset: 0; opacity: 0 }`을 물려받아 **기록에서 보이지 않는다**(개발 서버에서 확인).
- **선택 항목**: 선택지 버튼 `.choice`의 스타일(배경, 최소 높이, 등장 애니메이션)을 받는다. 그래서 흰 선택지 버튼 모양에 연한 글자로 그려져 거의 읽히지 않는다.
- **테스트 영향**: 기록이 열려 있으면 `page.locator('.choice')` 개수에도 섞인다.

고치는 법: 기록 항목은 `log-item is-${kind}`로 쓰고, 무대 카드는 `.stage > .card`로 범위를 좁힌다.

## 부록 B. 최종 목업 스크린샷

폴더는 `/tmp/claude-0/-home-user-2/e7822c7a-a53c-557c-91eb-6212db763e9c/scratchpad/ui-design/final/shots/`이다.

| 접두어 | 크기 | 화면 |
|---|---|---|
| `pc-` | 1280×720 | 아래 13개 |
| `mb-` | 844×390 휴대폰 가로(isMobile, hasTouch) | 아래 13개 |
| `se-` | 667×375 휴대폰 가로 최소 크기 | 아래 13개 |
| `pt-` | 390×844 세로 대체 배치 | title, dialogue, choice, save, settings, log, ending |

- 13개 화면: title, dialogue, choice, save, load, settings, log, card, ending, night, menu, confirm, hide
- 자동 점검(`scripts/shots.cjs`) 항목은 16px 미만 글자, 44px(빠른 메뉴 40px) 미만 버튼, 가로 넘침, 이름표↔빠른 메뉴 겹침, 선택지↔빠른 메뉴·대사창·이름표 겹침이다. 46장 모두 위반 0건이다.
