# 에셋 목록과 교체 규격

> `npm run export-assets` 로 `src/story/assets.ts` 매니페스트에서 자동 생성. 파일 존재 여부와 크기는 생성 시점 기준.
> **현재 연결된 그림·음악은 모두 개발용 임시 에셋**이다(코드로 그린 SVG, 코드로 합성한 음원). 완성된 일러스트·음악이 아니다.

## 교체 방법

1. 최종 파일을 `public/assets/` 아래(예: `public/assets/char/osana/`, `public/assets/bg/`, `public/assets/audio/`)에 넣는다.
2. `src/story/assets.ts` 에서 경로를 바꾸고 `placeholder: false` 로 바꾼다.
   - 캐릭터: `SPRITE_SETS.<캐릭터>.dir` 과 `ext` 만 바꾸면 된다(파일명 규칙 `${outfit}_${hair}_${expr}.${ext}` 유지).
   - 배경·음악·효과음: 항목별 `src` 를 바꾼다.
3. `npm run validate` 로 누락 파일을 확인한다(없는 파일은 오류로 표시됨).
4. 모든 에셋이 최종으로 바뀌면 타이틀의 "임시 에셋" 표시가 자동으로 사라진다.

## 캐릭터 스프라이트

권장 규격(최종): **PNG 또는 WebP(알파 채널)**, 세로 **2400px 이상**(가로 약 1600px, 2:3 비율), 머리 위 여백 약 5%, 허벅지 중간에서 잘린 반신.
얼굴 위치·크기를 표정끼리 픽셀 단위로 맞출 것(표정 교체 시 흔들림 방지). 화면 높이의 약 96%로 하단 정렬되어 표시된다. 파일당 600KB 이하 권장(WebP).

### 아카네(소꿉친구) — 🟡 임시 (`assets/placeholder/char/osana`)

| 의상/헤어 | 표정 | 파일 | 상태 | 크기 |
|---|---|---|---|---|
| 교복(베이지 카디건), 반묶음+리본 | 기본(neutral) | `uniform_default_neutral.svg` | ✅ | 41KB |
| 교복(베이지 카디건), 반묶음+리본 | 웃음(smile) | `uniform_default_smile.svg` | ✅ | 39KB |
| 교복(베이지 카디건), 반묶음+리본 | 당황(fluster) | `uniform_default_fluster.svg` | ✅ | 41KB |
| 교복(베이지 카디건), 반묶음+리본 | 부끄러움(shy) | `uniform_default_shy.svg` | ✅ | 41KB |
| 교복(베이지 카디건), 반묶음+리본 | 삐짐(pout) | `uniform_default_pout.svg` | ✅ | 41KB |
| 교복(베이지 카디건), 반묶음+리본 | 쓸쓸(sad) | `uniform_default_sad.svg` | ✅ | 41KB |
| 유카타(남색 바탕 금붕어 무늬, 붉은 오비), 반묶음+리본 | 기본(neutral) | `yukata_default_neutral.svg` | ✅ | 38KB |
| 유카타(남색 바탕 금붕어 무늬, 붉은 오비), 반묶음+리본 | 웃음(smile) | `yukata_default_smile.svg` | ✅ | 36KB |
| 유카타(남색 바탕 금붕어 무늬, 붉은 오비), 반묶음+리본 | 당황(fluster) | `yukata_default_fluster.svg` | ✅ | 38KB |
| 유카타(남색 바탕 금붕어 무늬, 붉은 오비), 반묶음+리본 | 부끄러움(shy) | `yukata_default_shy.svg` | ✅ | 38KB |
| 유카타(남색 바탕 금붕어 무늬, 붉은 오비), 반묶음+리본 | 삐짐(pout) | `yukata_default_pout.svg` | ✅ | 38KB |
| 유카타(남색 바탕 금붕어 무늬, 붉은 오비), 반묶음+리본 | 쓸쓸(sad) | `yukata_default_sad.svg` | ✅ | 38KB |

### 히나(전학생) — 🟡 임시 (`assets/placeholder/char/tenko`)

| 의상/헤어 | 표정 | 파일 | 상태 | 크기 |
|---|---|---|---|---|
| 교복(연회색 카디건), 긴 웨이브+하늘색 머리핀 | 기본(neutral) | `uniform_default_neutral.svg` | ✅ | 43KB |
| 교복(연회색 카디건), 긴 웨이브+하늘색 머리핀 | 웃음(smile) | `uniform_default_smile.svg` | ✅ | 41KB |
| 교복(연회색 카디건), 긴 웨이브+하늘색 머리핀 | 당황(fluster) | `uniform_default_fluster.svg` | ✅ | 43KB |
| 교복(연회색 카디건), 긴 웨이브+하늘색 머리핀 | 부끄러움(shy) | `uniform_default_shy.svg` | ✅ | 43KB |
| 교복(연회색 카디건), 긴 웨이브+하늘색 머리핀 | 삐짐(pout) | `uniform_default_pout.svg` | ✅ | 43KB |
| 교복(연회색 카디건), 긴 웨이브+하늘색 머리핀 | 쓸쓸(sad) | `uniform_default_sad.svg` | ✅ | 43KB |
| 교복(연회색 카디건), 높은 포니테일+하늘색 리본 | 기본(neutral) | `uniform_ponytail_neutral.svg` | ✅ | 39KB |
| 교복(연회색 카디건), 높은 포니테일+하늘색 리본 | 웃음(smile) | `uniform_ponytail_smile.svg` | ✅ | 37KB |
| 교복(연회색 카디건), 높은 포니테일+하늘색 리본 | 당황(fluster) | `uniform_ponytail_fluster.svg` | ✅ | 39KB |
| 교복(연회색 카디건), 높은 포니테일+하늘색 리본 | 부끄러움(shy) | `uniform_ponytail_shy.svg` | ✅ | 39KB |
| 교복(연회색 카디건), 높은 포니테일+하늘색 리본 | 삐짐(pout) | `uniform_ponytail_pout.svg` | ✅ | 39KB |
| 교복(연회색 카디건), 높은 포니테일+하늘색 리본 | 쓸쓸(sad) | `uniform_ponytail_sad.svg` | ✅ | 39KB |
| 유카타(연하늘 바탕 흰 나팔꽃, 남색 오비), 포니테일 | 기본(neutral) | `yukata_ponytail_neutral.svg` | ✅ | 40KB |
| 유카타(연하늘 바탕 흰 나팔꽃, 남색 오비), 포니테일 | 웃음(smile) | `yukata_ponytail_smile.svg` | ✅ | 38KB |
| 유카타(연하늘 바탕 흰 나팔꽃, 남색 오비), 포니테일 | 당황(fluster) | `yukata_ponytail_fluster.svg` | ✅ | 41KB |
| 유카타(연하늘 바탕 흰 나팔꽃, 남색 오비), 포니테일 | 부끄러움(shy) | `yukata_ponytail_shy.svg` | ✅ | 41KB |
| 유카타(연하늘 바탕 흰 나팔꽃, 남색 오비), 포니테일 | 삐짐(pout) | `yukata_ponytail_pout.svg` | ✅ | 40KB |
| 유카타(연하늘 바탕 흰 나팔꽃, 남색 오비), 포니테일 | 쓸쓸(sad) | `yukata_ponytail_sad.svg` | ✅ | 41KB |

## 배경

권장 규격(최종): **1920×1080 이상 16:9**(가능하면 2560×1440), WebP/JPEG, 파일당 800KB 이하. 좌우 5%가 잘려도 되게, 화면 아래 30%는 대사창이 반투명하게 덮는다.

| id | 설명 | 사용 | 현재 파일 | 구분 | 상태 | 크기 |
|---|---|---|---|---|---|---|
| `title` | 타이틀 화면 배경(초여름 하늘과 학교 언덕) | ○ | `assets/placeholder/bg/title.svg` | 🟡 임시 | ❌ 없음 |  |
| `road_morning` | 등굣길 주택가(아침) | ○ | `assets/placeholder/bg/road_morning.svg` | 🟡 임시 | ✅ | 76KB |
| `road_evening` | 하굣길 주택가(노을) | ○ | `assets/placeholder/bg/road_evening.svg` | 🟡 임시 | ✅ | 76KB |
| `road_rain` | 하굣길 주택가(소나기) | ○ | `assets/placeholder/bg/road_rain.svg` | 🟡 임시 | ✅ | 79KB |
| `road_night` | 밤 귀갓길(가로등, 여름밤) | ○ | `assets/placeholder/bg/road_night.svg` | 🟡 임시 | ✅ | 88KB |
| `classroom_day` | 2학년 3반 교실(낮, 창가) | ○ | `assets/placeholder/bg/classroom_day.svg` | 🟡 임시 | ❌ 없음 |  |
| `classroom_evening` | 교실(방과 후 노을) | ○ | `assets/placeholder/bg/classroom_evening.svg` | 🟡 임시 | ❌ 없음 |  |
| `hallway` | 복도와 자판기(낮) | ○ | `assets/placeholder/bg/hallway.svg` | 🟡 임시 | ❌ 없음 |  |
| `shoe_lockers` | 현관 신발장(방과 후) | ○ | `assets/placeholder/bg/shoe_lockers.svg` | 🟡 임시 | ❌ 없음 |  |
| `shoe_lockers_rain` | 현관 신발장(밖은 소나기) | ○ | `assets/placeholder/bg/shoe_lockers_rain.svg` | 🟡 임시 | ❌ 없음 |  |
| `courtyard` | 중정 벤치(점심시간) | ○ | `assets/placeholder/bg/courtyard.svg` | 🟡 임시 | ❌ 없음 |  |
| `shotengai` | 동네 상점가와 오래된 막과자 가게(늦은 오후) | ○ | `assets/placeholder/bg/shotengai.svg` | 🟡 임시 | ❌ 없음 |  |
| `riverbank_evening` | 강변 둑길(노을) | ○ | `assets/placeholder/bg/riverbank_evening.svg` | 🟡 임시 | ❌ 없음 |  |
| `station_morning` | 역 앞 맨션가(아침) | ○ | `assets/placeholder/bg/station_morning.svg` | 🟡 임시 | ❌ 없음 |  |
| `apartment_door` | 맨션 복도의 현관문 앞(저녁) | ○ | `assets/placeholder/bg/apartment_door.svg` | 🟡 임시 | ❌ 없음 |  |
| `shrine_steps` | 언덕 위 작은 신사 돌계단(노을, 고양이 자리) | - | `assets/placeholder/bg/shrine_steps.svg` | 🟡 임시 | ❌ 없음 |  |
| `festival_street` | 여름 축제 노점 거리(밤, 제등) | ○ | `assets/placeholder/bg/festival_street.svg` | 🟡 임시 | ❌ 없음 |  |
| `riverbank_night` | 불꽃놀이를 보는 강변 둑(밤) | ○ | `assets/placeholder/bg/riverbank_night.svg` | 🟡 임시 | ❌ 없음 |  |
| `shrine_night` | 불꽃놀이가 보이는 신사 언덕(밤) | - | `assets/placeholder/bg/shrine_night.svg` | 🟡 임시 | ❌ 없음 |  |
| `black` | 검은 화면(파일 없음) | ○ | 단색 #08070c | - | — |  |

## 음악(BGM)

권장 규격(최종): **MP3(128~192kbps) 또는 M4A/AAC**, 44.1kHz 스테레오, 1~2분 루프(끝과 시작이 이어지게), 피크 -1dBFS. Ogg 만 쓰면 일부 iOS 에서 재생되지 않을 수 있다.

| id | 분위기 | 사용 | 현재 파일 | 구분 | 상태 | 크기 |
|---|---|---|---|---|---|---|
| `title` | 타이틀: 초여름 바람 같은 잔잔한 곡 | ○ | `assets/placeholder/audio/bgm_title.mp3` | 🟡 임시 | ❌ 없음 |  |
| `daily` | 일상: 경쾌하고 가벼운 학교생활 | ○ | `assets/placeholder/audio/bgm_daily.mp3` | 🟡 임시 | ❌ 없음 |  |
| `heart` | 설렘: 느리고 따뜻한 두근거림 | ○ | `assets/placeholder/audio/bgm_heart.mp3` | 🟡 임시 | ❌ 없음 |  |
| `evening` | 노을: 그리움이 섞인 하굣길 | ○ | `assets/placeholder/audio/bgm_evening.mp3` | 🟡 임시 | ❌ 없음 |  |
| `festival` | 축제: 피리·북 느낌의 들뜬 축제 | ○ | `assets/placeholder/audio/bgm_festival.mp3` | 🟡 임시 | ❌ 없음 |  |
| `confession` | 고백: 조용하고 맑은 피아노풍 | ○ | `assets/placeholder/audio/bgm_confession.mp3` | 🟡 임시 | ❌ 없음 |  |

## 효과음(SFX)

권장 규격(최종): MP3/M4A 모노 96~128kbps, 앞쪽 무음 없이 바로 시작, 0.2~4초.

| id | 설명 | 사용 | 현재 파일 | 구분 | 상태 | 크기 |
|---|---|---|---|---|---|---|
| `select` | UI 선택음 | ○ | `assets/placeholder/audio/sfx_select.mp3` | 🟡 임시 | ❌ 없음 |  |
| `bell` | 학교 차임벨 | ○ | `assets/placeholder/audio/sfx_bell.mp3` | 🟡 임시 | ❌ 없음 |  |
| `door` | 교실 미닫이문 | ○ | `assets/placeholder/audio/sfx_door.mp3` | 🟡 임시 | ❌ 없음 |  |
| `rain` | 소나기 소리(수 초) | ○ | `assets/placeholder/audio/sfx_rain.mp3` | 🟡 임시 | ❌ 없음 |  |
| `camera` | 즉석카메라 셔터 | - | `assets/placeholder/audio/sfx_camera.mp3` | 🟡 임시 | ❌ 없음 |  |
| `firework` | 불꽃 터지는 소리 | ○ | `assets/placeholder/audio/sfx_firework.mp3` | 🟡 임시 | ❌ 없음 |  |
| `message` | 휴대폰 메시지 알림 | ○ | `assets/placeholder/audio/sfx_message.mp3` | 🟡 임시 | ❌ 없음 |  |
| `sparkle` | 반짝(놀람·깨달음 강조) | ○ | `assets/placeholder/audio/sfx_sparkle.mp3` | 🟡 임시 | ❌ 없음 |  |
| `footsteps` | 달려오는 발소리 | ○ | `assets/placeholder/audio/sfx_footsteps.mp3` | 🟡 임시 | ❌ 없음 |  |
| `cat` | 고양이 울음(합성 임시음) | - | `assets/placeholder/audio/sfx_cat.mp3` | 🟡 임시 | ❌ 없음 |  |

## 아직 없는(선택) 에셋

- 아카네 잠옷·마스크 차림(감기 장면): 현재는 그림 없이 문틈 대화와 서술로 처리.
- 이벤트 CG(우산 장면, 고백 장면, 둘이 찍힌 즉석사진 등): 첫 버전 범위 밖. 추가 시 엔진에 CG 표시 명령을 붙이면 된다.
- 주인공 그림: 기획상 없음.
- 사복: 본편 일정을 방과 후 중심으로 짜서 필요 없게 함.
