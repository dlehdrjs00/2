# 에셋 목록과 교체 규격

> `npm run export-assets`(또는 `npm run docs`)로 자동 생성한다. 직접 고치지 말고 `scripts/export-assets.ts` 나 매니페스트(`src/story/assets.ts`, `src/story/cg.ts`)를 고친 뒤 다시 생성할 것.
> 파일 존재 여부·크기·픽셀 크기와 배치 수치(CSS·레이아웃 계산)는 생성 시점의 실제 파일·코드에서 읽은 값이다.

## 한눈에 보기

| 분류 | 수량 | 상태 | 현재 연결된 것 | 위치 | 파일 | 용량 |
|---|---|---|---|---|---|---|
| 캐릭터 스프라이트 | 30장 (아카네 12 · 히나 18) | 🟢 최종 | 사용자가 준 최종 일러스트 → WebP 변환 | `public/assets/char/osana/` `public/assets/char/tenko/` | 30개 | 3.80MB |
| 이벤트 CG | 11장 + 썸네일 11장 | 🟢 최종 | 사용자가 준 최종 일러스트 → WebP 변환 | `public/assets/cg/`, `public/assets/cg/thumb/` | 22개 | 2.66MB |
| 타이틀 키 비주얼 | 1장 + 썸네일 1장 | 🟢 최종 | 사용자가 준 최종 일러스트 → WebP 변환 | `public/assets/cg/kv.webp` | 2개 | 328KB |
| 배경 | 19종 (대본 18 + 타이틀 대체 1) + 단색 1 | 🟡 임시 | 코드로 그린 임시 SVG(`scripts/art/backgrounds.mjs`) | `public/assets/placeholder/bg/` | 19개 | 1.12MB |
| 음악(BGM) | 6곡 | 🟡 임시 | 코드로 합성한 임시 음원(`scripts/gen-placeholder-audio.mjs`) | `public/assets/placeholder/audio/bgm_*.mp3` | 6개 | 2.41MB |
| 효과음(SFX) | 10종 | 🟡 임시 | 코드로 합성한 임시 음원(`scripts/gen-placeholder-audio.mjs`) | `public/assets/placeholder/audio/sfx_*.mp3` | 10개 | 280KB |

- 인물·CG·키 비주얼은 **사용자가 준 최종 일러스트**를 `scripts/import-art.py` 로 변환해 넣은 것이다(원본은 `art-inbox/`, 저장소에 넣지 않음).
- 배경·음악·효과음은 아직 **개발용 임시 에셋**이다. 교체 사양은 아래 [배경](#배경--임시-svg) · [음악](#음악bgm--임시-합성음) · [효과음](#효과음sfx--임시-합성음) 절.
- 타이틀 화면 버전 표시 뒤에는 지금 「임시 배경·음악」 가 붙는다. 해당 분류의 `placeholder` 가 모두 `false` 가 되면 자동으로 빠진다(`src/main.ts` placeholderNote).
- 그림은 게임 시작 뒤 백그라운드로 모두 미리 받는다(`src/ui/screens/preload.ts`, 동시에 3개). 현재 그림 전체 7.60MB(CG 썸네일 제외) — 교체할 때 용량 예산을 지킬 것.

## 교체 방법(공통)

1. 최종 파일을 `public/assets/` 아래 **새 폴더**에 넣는다(예: `public/assets/bg/classroom_day.webp`, `public/assets/audio/bgm_daily.mp3`). `placeholder/` 폴더와 섞지 않는다.
2. 매니페스트에서 경로를 바꾸고 `placeholder: false` 로 바꾼다.
   - 배경·음악·효과음: `src/story/assets.ts` 의 `BACKGROUNDS` / `BGM` / `SFX` 항목별 `src`. 배경은 `tone` 을 그림의 시간대에 맞게 유지한다.
     예: `classroom_day: { src: 'assets/bg/classroom_day.webp', placeholder: false, desc: '2학년 3반 교실(낮, 창가)' },`
   - 캐릭터: `SPRITE_SETS.<캐릭터>.dir` 과 `ext`(파일명 규칙 `${outfit}_${hair}_${expr}.${ext}` 유지). 그림 자체를 바꿀 때는 아래 [그림 교체 파이프라인](#그림-교체-파이프라인-scriptsimport-artpy)을 쓴다.
   - 이벤트 CG·키 비주얼: `src/story/cg.ts`(경로는 `assets/cg/{id}.webp`, 썸네일 `assets/cg/thumb/{id}.webp` 고정).
3. `npm run validate` — 매니페스트가 가리키는 파일이 없으면 오류로 알려 준다.
4. `npm run docs` — 이 문서와 대본 문서를 다시 만든다.
5. `npm run dev` 로 띄워 데스크톱·휴대폰 가로 화면에서 확인한다(주소 끝에 `?debug` 를 붙이면 콘솔에서 `window.__vn.info()` 로 상태 조회).

**라이선스 조건(배경·음악·효과음 공통):** 직접 제작했거나, 상업적 이용·수정·웹 배포가 허용된 라이선스의 소재만 쓴다. 출처 표기 의무가 있으면 게임 안 크레딧에도 넣는다.
넣을 때마다 아래 [출처 기록](#출처-기록)에 작가/출처·라이선스·주소·확인한 날짜를 적는다. 생성형 도구로 만든 소재는 그 서비스 약관이 상업 이용을 허용하는지 확인한다.

## 캐릭터 스프라이트 — 최종

- 규격: 원본(다시 그릴 때의 기준) **1600×2400(2:3)**, 머리 위 여백 약 5%(import-art 가 2~10% 를 벗어나면 경고), 그림 아래 끝이 캔버스 바닥에 닿는 반신.
- 게임 파일: import-art 가 원본 캔버스 전체를 같은 비율로 줄여 **WebP RGBA 1200×1800**(품질 82)로 저장한다. 화면에서 스프라이트는 무대 높이의 116%(1080p 화면이면 약 1253px)로 그려져 이 크기로 충분하고, 느린 망에서 받는 양이 줄어든다. 파일당 600KB 이하(넘으면 import-art 가 경고).
- 같은 의상·헤어 묶음 안에서는 표정만 달라야 한다(실루엣·위치가 같아야 표정 교체 때 흔들리지 않음). import-art 가 묶음 단위로 같은 변환을 적용하고 실루엣 bbox 차이를 경고한다.
- 등장하는 조합은 `src/story/assets.ts` 의 `looks`. 없는 조합을 대본에서 부르면 `npm run validate` 가 오류를 낸다.

### 화면 배치 규칙

생성 시점의 `src/ui/styles/play.css`·`screens.css`·`src/ui/stage.ts` 에서 읽은 값이다. 모든 퍼센트는 **무대(16:9) 기준**이다.

| 항목 | 값 | 출처 |
|---|---|---|
| 인물 높이 `--char-height` | 무대 높이의 **116%** (폭은 비율대로 자동: 무대 폭의 약 43.5%) | play.css 73행 `.stage` |
| 아래 여백 `--char-bottom` | **-22%** → 그림 아래 끝이 무대 아래 끝보다 무대 높이의 22% 아래 | play.css 72행 `.stage` |
| 그림 위끝 | 무대 위에서 6% (머리 꼭대기는 여백 5% 기준 약 11.8%) | 계산 |
| 무대 밖으로 잘리는 부분 | 캔버스 아래쪽 19% (보이는 것은 위쪽 81%) | 계산 |
| 가로 위치(그림 가운데) | 왼쪽 27% · 가운데 50% · 오른쪽 73% (`translateX(-50%)`) | play.css `.char.pos-*` |
| 등장·퇴장 | 아래 2.5% 에서 제자리로 + 페이드 350ms. 말하지 않는 인물은 어둡게가 아니라 바래게(`.char.dim`) | play.css `.char.entering`, stage.ts `DUR` |
| 저장 칸·미니 무대 썸네일 | bottom -18% · height 116% (본 무대와 별도 값) | screens.css `.slot-thumb img` |

**대사창이 덮는 범위**(`src/ui/layout.ts` computeLayout 계산). 대사창 위로 이름표·빠른 메뉴 탭 띠가 붙는다. 글자 크기 설정 '더 크게'(×1.25)이면 대사창이 커진다.

| 화면 | 무대 | 대사창(아래에서) | 탭 띠 위끝까지(아래에서) | 같은 높이 = 스프라이트 캔버스 위에서 | 글자 더 크게일 때 탭 띠 위끝 |
|---|---|---|---|---|---|
| 데스크톱 1920×1080 | 1920×1080 | 24.2% | 28.4% | 56.5% | 28.6% (캔버스 56.3%) |
| 데스크톱 1280×720 (E2E desktop) | 1280×720 | 24.3% | 30.5% | 54.8% | 36.5% (캔버스 49.6%) |
| 휴대폰 가로 844×390 (E2E phone-landscape) | 693×390 | 29.1% | 40.4% | 46.2% | 47% (캔버스 40.5%) |
| 휴대폰 가로 667×375 (E2E phone-se-landscape) | 667×375 | 30.2% | 41.9% | 44.9% | 48.8% (캔버스 39%) |

→ **얼굴과 표정이 읽혀야 하는 부분은 스프라이트 캔버스 위쪽 약 44% 안**(기본 글자, 가장 낮은 휴대폰 화면 기준)에 있어야 대사창·탭에 가리지 않는다. 글자 '더 크게'까지 고려하면 약 38%.

### 아카네(소꿉친구) — 🟢 최종 (`public/assets/char/osana/`)

| 의상/헤어 | 표정 | 파일 | 상태 | 픽셀 | 크기 |
|---|---|---|---|---|---|
| 교복(베이지 카디건), 반묶음+리본 | 기본(neutral) | `uniform_default_neutral.webp` | ✅ | 1200×1800 | 137KB |
| 교복(베이지 카디건), 반묶음+리본 | 웃음(smile) | `uniform_default_smile.webp` | ✅ | 1200×1800 | 137KB |
| 교복(베이지 카디건), 반묶음+리본 | 당황(fluster) | `uniform_default_fluster.webp` | ✅ | 1200×1800 | 137KB |
| 교복(베이지 카디건), 반묶음+리본 | 부끄러움(shy) | `uniform_default_shy.webp` | ✅ | 1200×1800 | 137KB |
| 교복(베이지 카디건), 반묶음+리본 | 삐짐(pout) | `uniform_default_pout.webp` | ✅ | 1200×1800 | 137KB |
| 교복(베이지 카디건), 반묶음+리본 | 쓸쓸(sad) | `uniform_default_sad.webp` | ✅ | 1200×1800 | 136KB |
| 유카타(남색 바탕 금붕어 무늬, 붉은 오비), 올림머리(뒤로 틀어 올린 경단+한쪽으로 늘어뜨린 머리)·분홍 핀, 리본 없음 | 기본(neutral) | `yukata_default_neutral.webp` | ✅ | 1200×1800 | 97KB |
| 유카타(남색 바탕 금붕어 무늬, 붉은 오비), 올림머리(뒤로 틀어 올린 경단+한쪽으로 늘어뜨린 머리)·분홍 핀, 리본 없음 | 웃음(smile) | `yukata_default_smile.webp` | ✅ | 1200×1800 | 97KB |
| 유카타(남색 바탕 금붕어 무늬, 붉은 오비), 올림머리(뒤로 틀어 올린 경단+한쪽으로 늘어뜨린 머리)·분홍 핀, 리본 없음 | 당황(fluster) | `yukata_default_fluster.webp` | ✅ | 1200×1800 | 97KB |
| 유카타(남색 바탕 금붕어 무늬, 붉은 오비), 올림머리(뒤로 틀어 올린 경단+한쪽으로 늘어뜨린 머리)·분홍 핀, 리본 없음 | 부끄러움(shy) | `yukata_default_shy.webp` | ✅ | 1200×1800 | 97KB |
| 유카타(남색 바탕 금붕어 무늬, 붉은 오비), 올림머리(뒤로 틀어 올린 경단+한쪽으로 늘어뜨린 머리)·분홍 핀, 리본 없음 | 삐짐(pout) | `yukata_default_pout.webp` | ✅ | 1200×1800 | 96KB |
| 유카타(남색 바탕 금붕어 무늬, 붉은 오비), 올림머리(뒤로 틀어 올린 경단+한쪽으로 늘어뜨린 머리)·분홍 핀, 리본 없음 | 쓸쓸(sad) | `yukata_default_sad.webp` | ✅ | 1200×1800 | 96KB |

### 히나(전학생) — 🟢 최종 (`public/assets/char/tenko/`)

| 의상/헤어 | 표정 | 파일 | 상태 | 픽셀 | 크기 |
|---|---|---|---|---|---|
| 교복(연회색 카디건), 긴 웨이브+하늘색 머리핀 | 기본(neutral) | `uniform_default_neutral.webp` | ✅ | 1200×1800 | 135KB |
| 교복(연회색 카디건), 긴 웨이브+하늘색 머리핀 | 웃음(smile) | `uniform_default_smile.webp` | ✅ | 1200×1800 | 134KB |
| 교복(연회색 카디건), 긴 웨이브+하늘색 머리핀 | 당황(fluster) | `uniform_default_fluster.webp` | ✅ | 1200×1800 | 135KB |
| 교복(연회색 카디건), 긴 웨이브+하늘색 머리핀 | 부끄러움(shy) | `uniform_default_shy.webp` | ✅ | 1200×1800 | 135KB |
| 교복(연회색 카디건), 긴 웨이브+하늘색 머리핀 | 삐짐(pout) | `uniform_default_pout.webp` | ✅ | 1200×1800 | 135KB |
| 교복(연회색 카디건), 긴 웨이브+하늘색 머리핀 | 쓸쓸(sad) | `uniform_default_sad.webp` | ✅ | 1200×1800 | 135KB |
| 교복(연회색 카디건), 높은 포니테일+하늘색 리본 | 기본(neutral) | `uniform_ponytail_neutral.webp` | ✅ | 1200×1800 | 132KB |
| 교복(연회색 카디건), 높은 포니테일+하늘색 리본 | 웃음(smile) | `uniform_ponytail_smile.webp` | ✅ | 1200×1800 | 132KB |
| 교복(연회색 카디건), 높은 포니테일+하늘색 리본 | 당황(fluster) | `uniform_ponytail_fluster.webp` | ✅ | 1200×1800 | 132KB |
| 교복(연회색 카디건), 높은 포니테일+하늘색 리본 | 부끄러움(shy) | `uniform_ponytail_shy.webp` | ✅ | 1200×1800 | 132KB |
| 교복(연회색 카디건), 높은 포니테일+하늘색 리본 | 삐짐(pout) | `uniform_ponytail_pout.webp` | ✅ | 1200×1800 | 132KB |
| 교복(연회색 카디건), 높은 포니테일+하늘색 리본 | 쓸쓸(sad) | `uniform_ponytail_sad.webp` | ✅ | 1200×1800 | 132KB |
| 유카타(연하늘 바탕 흰 나팔꽃, 남색 오비), 포니테일 | 기본(neutral) | `yukata_ponytail_neutral.webp` | ✅ | 1200×1800 | 148KB |
| 유카타(연하늘 바탕 흰 나팔꽃, 남색 오비), 포니테일 | 웃음(smile) | `yukata_ponytail_smile.webp` | ✅ | 1200×1800 | 148KB |
| 유카타(연하늘 바탕 흰 나팔꽃, 남색 오비), 포니테일 | 당황(fluster) | `yukata_ponytail_fluster.webp` | ✅ | 1200×1800 | 148KB |
| 유카타(연하늘 바탕 흰 나팔꽃, 남색 오비), 포니테일 | 부끄러움(shy) | `yukata_ponytail_shy.webp` | ✅ | 1200×1800 | 148KB |
| 유카타(연하늘 바탕 흰 나팔꽃, 남색 오비), 포니테일 | 삐짐(pout) | `yukata_ponytail_pout.webp` | ✅ | 1200×1800 | 148KB |
| 유카타(연하늘 바탕 흰 나팔꽃, 남색 오비), 포니테일 | 쓸쓸(sad) | `yukata_ponytail_sad.webp` | ✅ | 1200×1800 | 148KB |

## 이벤트 CG — 최종

- 규격: **WebP 1920×1080(16:9, 배경 포함 완성 그림)**, 썸네일 480×270(`assets/cg/thumb/`, 저장 화면·추억 앨범 목록용). 매니페스트는 `src/story/cg.ts`.
- 표시: 대본의 `cg(id)` 명령. 무대 가득(`background-size: cover`) — 인물·햇살·빛망울 **앞**, 대사창 **뒤**. 그림을 해독한 뒤 550ms 크로스페이드.
- 걷힘: `cg(null)` 또는 **`bg` 명령(배경 전환)이 오면 자동으로 걷힌다**(`src/engine/runner.ts`). 저장·불러오기 때 떠 있던 CG 도 복원된다(`state.stage.cg`).
- 한 번 본 CG 는 전역 기록(`src/engine/save.ts` GlobalRecord `cgs`, `markCg`)에 남아 타이틀의 추억 앨범에서 다시 볼 수 있다. 앨범 표시 순서는 아래 표 순서(`CG_ORDER`).
- 대사창이 아래쪽을 덮으므로(위 표: 기본 28.4~41.9%) 얼굴·중요한 손짓은 화면 위쪽 약 58% 안에 두는 것이 좋다.

| 순서 | id | 앨범 제목 | 루트 | 대본 위치(cg.ts desc) | 화면에 떠 있는 구간 | 파일 | 픽셀 | 크기 | 썸네일 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `rain_osana` | 작은 우산 | 아카네(공통 선택) | 공통 c6 소나기 — 아카네 우산을 함께 쓴 하굣길 | `c6_rain` `c6.a20`~`c6.a40` 3문장 → `c6.join` 로 이동 뒤 걷힘 | `rain_osana.webp` ✅ | 1920×1080 | 210KB | ✅ 480×270 23KB |
| 2 | `rain_tenko` | 기울어진 우산 | 히나(공통 선택) | 공통 c6 소나기 — 히나와 우산을 함께 쓴 하굣길 | `c6_rain` `c6.b30`~`c6.b50` 3문장 → CG 걷기 명령 | `rain_tenko.webp` ✅ | 1920×1080 | 252KB | ✅ 480×270 25KB |
| 3 | `door_osana` | 체인 너머 | 아카네 | 아카네 루트 o2 — 감기 문병, 체인 걸린 현관문 | `o2_cold` `o2.130`~`o2.210` 10문장 → CG 걷기 명령 | `door_osana.webp` ✅ | 1920×1080 | 102KB | ✅ 480×270 12KB |
| 4 | `ramune_osana` | 토요일이거든 | 아카네 | 아카네 루트 o4 — 노을 강변의 라무네 | `o4_promise` `o4.170`~`o4.180` 2문장 → CG 걷기 명령 | `ramune_osana.webp` ✅ | 1920×1080 | 260KB | ✅ 480×270 31KB |
| 5 | `fireworks_osana` | 첫 불꽃 | 아카네 | 아카네 루트 o6 — 고백 뒤 첫 불꽃 | `o6_confession` `o6.180`~`o6.200` 3문장 → 다음 장면 `o7_homeward` 의 배경 전환 | `fireworks_osana.webp` ✅ | 1920×1080 | 159KB | ✅ 480×270 19KB |
| 6 | `homeward_osana` | 처음 바래다주는 길 | 아카네 | 아카네 루트 o7 — 손잡고 걷는 귀갓길 | `o7_homeward` `o7.060`~`o7.110` 6문장 → CG 걷기 명령 | `homeward_osana.webp` ✅ | 1920×1080 | 205KB | ✅ 480×270 24KB |
| 7 | `cats_tenko` | 기다리면 오는 것 | 히나 | 히나 루트 t1 — 신사 돌계단의 다이후쿠 | `t1_cats` `t1.140`~`t1.170` 4문장 → CG 걷기 명령 | `cats_tenko.webp` ✅ | 1920×1080 | 351KB | ✅ 480×270 36KB |
| 8 | `bench_tenko` | 그거, 내 대사인데 | 히나 | 히나 루트 t4 — 노을 언덕 벤치 | `t4_invite` `t4.190`~`t4.200` 2문장 → 다음 장면 `t5_festival` 의 배경 전환 | `bench_tenko.webp` ✅ | 1920×1080 | 277KB | ✅ 480×270 30KB |
| 9 | `selfie_tenko` | 이번엔 둘이 같이 | 히나 | 히나 루트 t6 — 불꽃 아래 셀카 | `t6_confession` `t6.210` 1문장 → 다음 CG(`shutter_tenko`)로 교체 | `selfie_tenko.webp` ✅ | 1920×1080 | 233KB | ✅ 480×270 31KB |
| 10 | `shutter_tenko` | 셔터가 눌린 순간 | 히나 | 히나 루트 t6 — 사진에 담긴 순간 | `t6_confession` `t6.220` 1문장 → 다음 장면 `t7_homeward` 의 배경 전환 | `shutter_tenko.webp` ✅ | 1920×1080 | 217KB | ✅ 480×270 26KB |
| 11 | `polaroid_tenko` | 첫 장에 넣을 사진 | 히나 | 히나 루트 t7 — 현상된 즉석사진 | `t7_homeward` `t7.040`~`t7.060` 3문장 → CG 걷기 명령 | `polaroid_tenko.webp` ✅ | 1920×1080 | 177KB | ✅ 480×270 23KB |

### 타이틀 키 비주얼

- 타이틀 키 비주얼 — 여름 하늘 아래 등굣길의 두 히로인
- 파일 `assets/cg/kv.webp` ✅ 1920×1080 299KB · 썸네일 `assets/cg/thumb/kv.webp` ✅ 480×270 28KB · 🟢 최종
- 타이틀 화면 전체 배경으로 깔리고(왼쪽 열에 로고·메뉴), 키 비주얼이 없을 때만 `title` 배경 + 스프라이트 두 장으로 대신 그린다(`src/main.ts` titleVisual·titleSprites).

### 엔딩 폴라로이드(`ENDING_CG`)

엔딩 화면 왼쪽 폴라로이드 안에 넣는 대표 CG.

- 아카네 엔딩 → `homeward_osana` 「처음 바래다주는 길」 (아카네 루트 o7 — 손잡고 걷는 귀갓길)
- 히나 엔딩 → `polaroid_tenko` 「첫 장에 넣을 사진」 (히나 루트 t7 — 현상된 즉석사진)

## 배경 — 임시 SVG

현재는 `scripts/art/backgrounds.mjs` 가 코드로 그린 SVG(viewBox 1600×900)다. **최종 교체 사양:**

| 항목 | 사양 |
|---|---|
| 형식 | **WebP**(권장, 품질 80~85) 또는 JPEG. 투명 불필요 |
| 해상도 | **1920×1080(16:9)** 권장. 무대가 늘 16:9 라 그대로면 잘리지 않는다. 비율이 다르면 가운데 기준으로 잘린다(`background-size: cover`) |
| 용량 | 파일당 800KB 이하(백그라운드로 전부 미리 받으므로 휴대폰 데이터 고려) |
| 구도 | 인물이 무대 폭 27%·50%·73% 자리에 서고, 아래쪽 약 28~42%는 대사창·탭이 반투명하게 덮는다. 사람·글자 없는 빈 장소 그림 |
| 톤 | 아래 표의 시간대(낮/노을/밤)에 맞춘다. `tone` 값이 UI 유리 색(밤 = 남색 유리)과 장소 표시 아이콘(해/달)을 고른다. 비 배경은 id 의 `_rain` 으로 판별 |
| 레터박스 | 무대 밖 여백은 같은 배경을 흐려 채운다(`.backdrop`). 따로 만들 그림 없음 |
| 화풍 | 캐릭터·CG 와 어울리는 밝은 애니메이션 배경 화풍(초여름, 맑은 하늘빛) |

| id | 설명 | 톤 | 대본 사용 | 현재 파일 | 상태 | 픽셀 | 크기 |
|---|---|---|---|---|---|---|---|
| `title` | 타이틀 화면 배경(초여름 하늘과 학교 언덕) | 낮 | 타이틀 대체 | `assets/placeholder/bg/title.svg` | 🟡 임시 | 1600×900 (viewBox) | 39KB |
| `road_morning` | 등굣길 주택가(아침) | 낮 | ○ | `assets/placeholder/bg/road_morning.svg` | 🟡 임시 | 1600×900 (viewBox) | 85KB |
| `road_evening` | 하굣길 주택가(노을) | 노을 | ○ | `assets/placeholder/bg/road_evening.svg` | 🟡 임시 | 1600×900 (viewBox) | 87KB |
| `road_rain` | 하굣길 주택가(소나기) | 낮·비 | ○ | `assets/placeholder/bg/road_rain.svg` | 🟡 임시 | 1600×900 (viewBox) | 71KB |
| `road_night` | 밤 귀갓길(가로등, 여름밤) | 밤 | ○ | `assets/placeholder/bg/road_night.svg` | 🟡 임시 | 1600×900 (viewBox) | 83KB |
| `classroom_day` | 2학년 3반 교실(낮, 창가) | 낮 | ○ | `assets/placeholder/bg/classroom_day.svg` | 🟡 임시 | 1600×900 (viewBox) | 77KB |
| `classroom_evening` | 교실(방과 후 노을) | 노을 | ○ | `assets/placeholder/bg/classroom_evening.svg` | 🟡 임시 | 1600×900 (viewBox) | 77KB |
| `hallway` | 복도와 자판기(낮) | 낮 | ○ | `assets/placeholder/bg/hallway.svg` | 🟡 임시 | 1600×900 (viewBox) | 36KB |
| `shoe_lockers` | 현관 신발장(방과 후) | 낮 | ○ | `assets/placeholder/bg/shoe_lockers.svg` | 🟡 임시 | 1600×900 (viewBox) | 51KB |
| `shoe_lockers_rain` | 현관 신발장(밖은 소나기) | 낮·비 | ○ | `assets/placeholder/bg/shoe_lockers_rain.svg` | 🟡 임시 | 1600×900 (viewBox) | 54KB |
| `courtyard` | 중정 벤치(점심시간) | 낮 | ○ | `assets/placeholder/bg/courtyard.svg` | 🟡 임시 | 1600×900 (viewBox) | 47KB |
| `shotengai` | 동네 상점가와 오래된 막과자 가게(늦은 오후) | 낮 | ○ | `assets/placeholder/bg/shotengai.svg` | 🟡 임시 | 1600×900 (viewBox) | 79KB |
| `riverbank_evening` | 강변 둑길(노을) | 노을 | ○ | `assets/placeholder/bg/riverbank_evening.svg` | 🟡 임시 | 1600×900 (viewBox) | 53KB |
| `station_morning` | 역 앞 맨션가(아침) | 낮 | ○ | `assets/placeholder/bg/station_morning.svg` | 🟡 임시 | 1600×900 (viewBox) | 42KB |
| `apartment_door` | 맨션 복도의 현관문 앞(저녁) | 노을 | ○ | `assets/placeholder/bg/apartment_door.svg` | 🟡 임시 | 1600×900 (viewBox) | 26KB |
| `shrine_steps` | 언덕 위 작은 신사 돌계단(노을, 고양이 자리) | 노을 | ○ | `assets/placeholder/bg/shrine_steps.svg` | 🟡 임시 | 1600×900 (viewBox) | 74KB |
| `festival_street` | 여름 축제 노점 거리(밤, 제등) | 밤 | ○ | `assets/placeholder/bg/festival_street.svg` | 🟡 임시 | 1600×900 (viewBox) | 67KB |
| `riverbank_night` | 불꽃놀이를 보는 강변 둑(밤) | 밤 | ○ | `assets/placeholder/bg/riverbank_night.svg` | 🟡 임시 | 1600×900 (viewBox) | 67KB |
| `shrine_night` | 불꽃놀이가 보이는 신사 언덕(밤) | 밤 | ○ | `assets/placeholder/bg/shrine_night.svg` | 🟡 임시 | 1600×900 (viewBox) | 38KB |
| `black` | 검은 화면(파일 없음) | - | ○ | 단색 #08070c | - |  |  |

## 음악(BGM) — 임시 합성음

현재는 `scripts/gen-placeholder-audio.mjs` 가 외부 음원 없이 합성한 MP3(44.1kHz 스테레오 112kbps, 24~40초 루프)다. **최종 교체 사양:**

| 항목 | 사양 |
|---|---|
| 형식 | **MP3**(128~192kbps) 또는 **M4A/AAC**, 44.1kHz 스테레오. Ogg 만 쓰면 일부 iOS 에서 재생되지 않을 수 있다 |
| 루프 | **필수.** `src/engine/audio.ts` 가 파일 전체를 디코드해 처음~끝을 그대로 반복한다(`loop = true`, 루프 지점 지정 없음). 끝과 처음이 이어지게 만들고 앞뒤 무음을 넣지 않는다. 길이 1~2분 권장 |
| 전환 | 새 곡은 1.2초 페이드 인, 바뀌는 곡은 0.9초 페이드 아웃(코드가 처리 — 파일에 페이드 넣지 않음) |
| 음량 | 피크 -1dBFS 이하, 곡끼리 체감 음량을 맞춘다(임시 음원은 RMS 약 -20dBFS). 그래도 튀면 `assets.ts` 항목의 `gain`(0~1)으로 곡별 보정. 플레이어 음량 설정(기본 BGM 60 · 효과음 70)이 그 위에 곱해진다 |
| 라이선스 | 직접 제작 또는 상업 이용 가능 라이선스만, 출처 기록([교체 방법](#교체-방법공통) 참고) |

| id | 분위기 | 대본 사용 | 현재 파일 | 상태 | 크기 |
|---|---|---|---|---|---|
| `title` | 타이틀: 초여름 바람 같은 잔잔한 곡 | 타이틀 | `assets/placeholder/audio/bgm_title.mp3` | 🟡 임시 ✅ | 411KB |
| `daily` | 일상: 경쾌하고 가벼운 학교생활 | ○ | `assets/placeholder/audio/bgm_daily.mp3` | 🟡 임시 ✅ | 438KB |
| `heart` | 설렘: 느리고 따뜻한 두근거림 | ○ | `assets/placeholder/audio/bgm_heart.mp3` | 🟡 임시 ✅ | 399KB |
| `evening` | 노을: 그리움이 섞인 하굣길 | ○ | `assets/placeholder/audio/bgm_evening.mp3` | 🟡 임시 ✅ | 411KB |
| `festival` | 축제: 피리·북 느낌의 들뜬 축제 | ○ | `assets/placeholder/audio/bgm_festival.mp3` | 🟡 임시 ✅ | 399KB |
| `confession` | 고백: 조용하고 맑은 피아노풍 | ○ | `assets/placeholder/audio/bgm_confession.mp3` | 🟡 임시 ✅ | 411KB |

## 효과음(SFX) — 임시 합성음

| 항목 | 사양 |
|---|---|
| 형식 | MP3/M4A 모노 96~128kbps, 44.1kHz |
| 길이·재생 | 한 번만 재생(루프 없음). 앞쪽 무음 없이 바로 시작, 0.2~4초(소나기 `rain` 은 수 초). 같은 소리를 60ms 안에 다시 부르면 무시한다 |
| 음량 | 피크 -1dBFS 이하(임시 음원은 -3dBFS 근처). 선택음(`select`)처럼 자주 나는 소리는 작게 |
| 라이선스 | 직접 녹음·제작 또는 상업 이용 가능 라이선스만, 출처 기록 |

| id | 설명 | 사용 | 현재 파일 | 상태 | 크기 |
|---|---|---|---|---|---|
| `select` | UI 선택음 | UI | `assets/placeholder/audio/sfx_select.mp3` | 🟡 임시 ✅ | 5.8KB |
| `bell` | 학교 차임벨 | ○ | `assets/placeholder/audio/sfx_bell.mp3` | 🟡 임시 ✅ | 71KB |
| `door` | 교실 미닫이문 | ○ | `assets/placeholder/audio/sfx_door.mp3` | 🟡 임시 ✅ | 17KB |
| `rain` | 소나기 소리(수 초) | ○ | `assets/placeholder/audio/sfx_rain.mp3` | 🟡 임시 ✅ | 43KB |
| `camera` | 즉석카메라 셔터 | ○ | `assets/placeholder/audio/sfx_camera.mp3` | 🟡 임시 ✅ | 17KB |
| `firework` | 불꽃 터지는 소리 | ○ | `assets/placeholder/audio/sfx_firework.mp3` | 🟡 임시 ✅ | 52KB |
| `message` | 휴대폰 메시지 알림 | ○ | `assets/placeholder/audio/sfx_message.mp3` | 🟡 임시 ✅ | 11KB |
| `sparkle` | 반짝(놀람·깨달음 강조) | ○ | `assets/placeholder/audio/sfx_sparkle.mp3` | 🟡 임시 ✅ | 21KB |
| `footsteps` | 달려오는 발소리 | ○ | `assets/placeholder/audio/sfx_footsteps.mp3` | 🟡 임시 ✅ | 30KB |
| `cat` | 고양이 울음(합성 임시음) | ○ | `assets/placeholder/audio/sfx_cat.mp3` | 🟡 임시 ✅ | 11KB |

## 그림 교체 파이프라인 (`scripts/import-art.py`)

캐릭터 스프라이트·이벤트 CG·키 비주얼을 다시 받았을 때 쓰는 변환 스크립트. 필요: Python 3 + Pillow + numpy.

**입력**(기본 `art-inbox/` — `.gitignore` 대상이라 원본은 저장소에 들어가지 않는다)

```
art-inbox/char/osana/{outfit}_{hair}_{expr}.png    예: art-inbox/char/osana/uniform_default_smile.png
art-inbox/char/tenko/{outfit}_{hair}_{expr}.png    예: art-inbox/char/tenko/yukata_ponytail_shy.png
art-inbox/cg/{id}.png                              예: art-inbox/cg/rain_osana.png, art-inbox/cg/kv.png
```

- 확장자는 png·webp·jpg(jpeg). 같은 이름이 여럿이면 png > webp > jpg 순으로 하나만 쓴다.
- 표정(expr): `neutral` `smile` `fluster` `shy` `pout` `sad`. 의상·헤어 조합은 `src/story/assets.ts` 의 `looks`.
- CG id: `kv` `rain_osana` `rain_tenko` `door_osana` `ramune_osana` `fireworks_osana` `homeward_osana` `cats_tenko` `bench_tenko` `selfie_tenko` `shutter_tenko` `polaroid_tenko` (`kv` = 타이틀 키 비주얼).
- 예전 안내대로 `art-inbox/{osana,tenko}/` 에 넣어도, `char/` 폴더가 없으면 그 폴더를 대신 읽는다(알림 표시).
- 원본은 신뢰하지 않는 데이터로 다룬다: PNG/WebP/JPEG 로만 열고, 심볼릭 링크는 읽지 않으며, 5천만 화소를 넘는 이미지는 거부한다.

**출력**

```
public/assets/char/{osana,tenko}/{outfit}_{hair}_{expr}.webp   1200x1800 RGBA (작업 캔버스 1600x2400)
public/assets/cg/{id}.webp                                     1920x1080
public/assets/cg/thumb/{id}.webp                               480x270
```

**처리 내용**

- 스프라이트: ① 불투명 원본이면 가장자리와 이어진 단색 배경을 지운다(크로마키 초록 같은 채도 높은 색이면 팔·머리카락 사이의 닫힌 틈도 지우고, 흰색 등 무채색이면 닫힌 틈은 남기고 경고). ② 가장자리 번짐(halo) 색 보정(알파·실루엣은 그대로). ③ 1600×2400 이 아니면 묶음(같은 의상·헤어) 전체에 같은 변환으로 2:3 캔버스·머리 위 5%·가로 가운데에 맞춤. ④ 캔버스 전체를 같은 비율로 줄여(기본 세로 1800px, `--sprite-height`) WebP 저장. ⑤ 묶음 안 실루엣 bbox 가 다르면 경고(표정 교체 시 흔들림).
- CG: 투명 부분은 검은색 위에 합성, 16:9 가 아니면 가운데를 잘라 맞춤, 원본이 작아 확대되면 경고, 썸네일 함께 생성.
- 파일은 임시 파일에 쓴 뒤 이름을 바꿔 넣는다(중간에 멈춰도 반쯤 쓴 파일이 남지 않음).

**옵션**(스크립트에서 읽은 목록)

| 옵션 | 설명 |
|---|---|
| `--src` | 입력 폴더(기본 art-inbox/) |
| `--out` | 출력 폴더(기본 public/assets/) |
| `--only` | 한 종류만 처리 — `char` 또는 `cg` |
| `--quality` | 스프라이트 WebP 품질(기본 {SPRITE_QUALITY}) |
| `--alpha-quality` | 스프라이트 알파 품질(기본 90) |
| `--cg-quality` | CG WebP 품질(기본 85) |
| `--thumb-quality` | CG 썸네일 품질(기본 80) |
| `--no-defringe` | 가장자리 번짐 보정 끄기 |
| `--defringe-strength` | 번짐 보정 세기 0~1(기본 1) |
| `-j`, `--jobs` | 병렬 작업 수 (기본 `min(4, CPU 수)`) |
| `--dry-run` | 처리·검사만 하고 파일은 쓰지 않음(크기는 메모리 인코딩으로 계산) |
| `--strict` | 경고가 있으면 종료 코드 1 |

**종료 코드:** 0 성공 · 1 오류가 있거나 처리할 파일이 없음, `--strict` 이면 경고·알림이 하나라도 있을 때 · 2 입력 폴더 없음.

**순서 예**

```bash
python3 scripts/import-art.py --dry-run --strict   # 쓰지 않고 검사만(크기는 메모리 인코딩으로 계산)
python3 scripts/import-art.py                      # art-inbox/ → public/assets/ 변환
python3 scripts/import-art.py --only cg            # CG·키 비주얼만
python3 scripts/import-art.py --src ~/받은그림 --only char   # 다른 폴더에서 스프라이트만
npm run validate && npm run docs                   # 연결 확인, 문서 갱신
```

새 의상·헤어 조합이나 새 CG 를 추가할 때는 `src/engine/types.ts`(타입), `src/story/assets.ts` 또는 `src/story/cg.ts`(매니페스트), `scripts/import-art.py` 의 `KNOWN_LOOKS`·`CG_IDS`(검사용)를 함께 고친다. 스크립트는 목록에 없는 조합·id 도 변환은 하되 알림을 남긴다.

## 출처 기록

| 분류 | 출처 | 라이선스·조건 | 비고 |
|---|---|---|---|
| 캐릭터 스프라이트·이벤트 CG·키 비주얼 | 사용자 제공 최종 일러스트 | 사용자 제공(이 게임에 사용) | 제작 프롬프트 `docs/ART_PROMPTS.md`, 변환 `scripts/import-art.py` |
| 배경(임시) | 이 저장소의 `scripts/art/backgrounds.mjs` 가 코드로 생성 | 외부 소재 없음 | 최종 교체 대상 |
| 음악·효과음(임시) | 이 저장소의 `scripts/gen-placeholder-audio.mjs` 가 합성 | 외부 음원·샘플 없음 | 최종 교체 대상 |
| 글꼴 | `@fontsource/gowun-batang`, `@fontsource/gowun-dodum`, `@fontsource/jua`, `pretendard` (npm) | SIL Open Font License 1.1 | `package.json` dependencies |
| 글꼴 타이틀 조각 `src/ui/styles/fonts/jua-title.woff2`, `gowun-batang-700-title.woff2` | google/fonts 의 OFL TTF(`ofl/jua/Jua-Regular.ttf`, `ofl/gowunbatang/GowunBatang-Bold.ttf`)에서 로고·부제 글자만 뽑은 부분 글꼴(pyftsubset) | SIL Open Font License 1.1(원본과 같음). 이름 표(저작권·OFL 안내)는 원본 그대로 둔다 | 타이틀이 받는 글꼴을 줄이려는 파생 파일(UI_DESIGN 4장). `GAME_TITLE`·`GAME_SUBTITLE`(src/story/config.ts)을 바꾸면 `tokens.css` 주석의 명령으로 다시 만들고 `unicode-range` 를 맞춘다(`tests/unit/layout.test.ts` 가 검사) |

최종 배경·음악·효과음을 넣으면 이 표에 한 줄씩 더한다(예: `| 배경 classroom_day | ○○ 작가 직접 제작 | 상업 이용·수정 허락(계약서 날짜) | 2026-xx-xx 확인 |`). 이 표는 `scripts/export-assets.ts` 안에 있다.

## 아직 없는(선택) 에셋과 정리 대상

- 아카네 잠옷·마스크 차림 스프라이트: 없음. 감기 문병 장면(o2)은 이벤트 CG `door_osana` 와 서술로 처리한다.
- 주인공 그림: 기획상 없음(CG 에서도 얼굴을 보이지 않게 그림).
- 사복: 본편 일정을 방과 후 중심으로 짜서 필요 없음.
