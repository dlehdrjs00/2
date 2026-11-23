# 캐릭터 그림 생성용 프롬프트 — 《내일도 같이 갈래?》

외부 이미지 생성 도구(ChatGPT 이미지, Midjourney/niji, NovelAI, Stable Diffusion 등)로 캐릭터 그림을 만들 때 쓰는 프롬프트 모음입니다.
프롬프트는 대부분의 도구가 가장 정확하게 따르는 **영어**로 적었고, 설명은 한국어입니다.

- **필수:** 캐릭터 스프라이트 30장(표정 6종 × 의상·헤어 5조합) — 게임 화면에 서 있는 그림
- **선택:** 이벤트 CG 10장 + 타이틀 키 비주얼 1장 — 주요 장면을 한 장의 그림으로 보여 주는 연출(받으면 엔진에 CG 표시 기능을 붙여 넣겠습니다)

---

## 0. 먼저 읽어 주세요 — 일관성 유지 요령

비주얼노벨 스프라이트는 **같은 그림에서 얼굴만 바뀌어야** 화면에서 자연스럽습니다. 표정마다 포즈·크기·옷 주름이 달라지면 대사가 넘어갈 때 캐릭터가 덜컹거립니다.

1. **기준 이미지 첨부:** 생성할 때마다 제공하신 디자인 시트를 함께 넣으세요.
   - 소꿉친구(아카네): 첫 번째 시트의 **오른쪽 B 디자인만** 참고
   - 전학생(히나): 두 번째 시트 A(긴 웨이브)·B(포니테일) — 동일 인물
   - Midjourney/niji 라면 `--cref <시트 이미지> --cw 100`, SD 라면 IP-Adapter/레퍼런스 기능, ChatGPT 라면 이미지 첨부 후 "this exact character" 로 지시
2. **베이스 먼저, 표정은 나중에:** 의상·헤어 조합마다 **기본 표정(neutral) 1장을 먼저 완성**하고, 나머지 5개 표정은
   그 그림을 편집해서 **얼굴만** 바꾸세요(인페인팅 / Vary Region / "change only the facial expression, keep everything else identical").
3. **배경:** 투명 PNG 가 되면 투명으로. 안 되면 **단색 크로마키 초록(#00B140)** 으로 받아 주세요.
   흰 배경은 흰 셔츠와 구분이 어려워 배경 제거 품질이 떨어집니다. (두 캐릭터 모두 초록 계열 색이 없어서 초록이 안전합니다)
4. **같은 포즈 유지:** 표정이 달라도 포즈·손 위치·카메라 거리·인물 크기는 같게. 교복 → 유카타처럼 의상이 바뀔 때만 포즈가 달라져도 됩니다.
5. 글자·서명·워터마크·테두리가 들어가면 안 됩니다.

---

## 1. 스프라이트 규격

| 항목 | 값 |
|---|---|
| 비율·크기 | 세로 **2:3**, 최소 **1600×2400px** (가능하면 2048×3072) |
| 구도 | **cowboy shot**(머리 꼭대기 ~ 허벅지 중간), 정면 또는 살짝 3/4, 시선은 화면(플레이어) 쪽 |
| 여백 | 머리 꼭대기 위 약 5%, 인물은 가로 중앙 |
| 배경 | 투명 또는 단색 #00B140, 바닥 그림자 없음 |
| 파일 형식 | PNG (JPG 도 가능하지만 PNG 권장) |
| 게임 표시 | 화면 높이의 약 116% 크기로 하단이 조금 잘려 표시됩니다. 얼굴·상반신이 가장 중요합니다 |

### 파일 이름과 넣을 곳

받은 그림은 **이 대화에 그대로 첨부**해 주시거나 저장소의 `art-inbox/` 폴더에 아래 이름으로 넣어 주시면, 제가 배경 제거·정렬·WebP 변환·게임 연결까지 처리합니다. 첨부하실 때 파일 이름이 다르면 "아카네 교복 부끄러움"처럼 알려 주셔도 됩니다.

```
art-inbox/osana/uniform_default_neutral.png   (아카네 교복)
art-inbox/osana/yukata_default_neutral.png    (아카네 유카타)
art-inbox/tenko/uniform_default_neutral.png   (히나 교복·긴 머리)
art-inbox/tenko/uniform_ponytail_neutral.png  (히나 교복·포니테일)
art-inbox/tenko/yukata_ponytail_neutral.png   (히나 유카타·포니테일)
```
`neutral` 자리에 `smile` `fluster` `shy` `pout` `sad` 를 넣어 표정별로 6장씩, 총 30장입니다.

---

## 2. 공통 스타일 프롬프트

모든 스프라이트 프롬프트 **앞**에 붙여 주세요.

```text
high-quality anime visual novel character sprite, single character, cowboy shot from head to mid-thigh,
standing pose, facing the viewer, clean crisp lineart, soft cel shading with gentle gradients,
glossy detailed hair with soft highlights, large expressive eyes with detailed gradient irises and catchlights,
bright early-summer color palette, soft warm lighting, polished commercial galgame quality,
plain solid chroma key green background (#00B140), no background scenery, no floor shadow,
vertical 2:3 composition, centered, small margin above the head
```

### 네거티브(지원하는 도구만)

```text
text, letters, watermark, signature, logo, frame, border, multiple characters, extra people,
background scenery, floor, cast shadow, cropped head, cut off hair, extra fingers, missing fingers,
deformed hands, extra arms, asymmetrical eyes, blurry, low resolution, jpeg artifacts,
chibi, 3d render, photorealistic, sexualized, revealing clothes
```

---

## 3. 캐릭터 고정 묘사

캐릭터 이름(아카네·히나)은 이미지 도구가 모르는 정보라 **외형 묘사만** 씁니다. 표정 문구만 바꾸고 이 부분은 그대로 유지하세요.

### 3-1. 소꿉친구 — 아카네 (디자인 시트 B)

```text
a 17-year-old Japanese high school girl,
long straight reddish chestnut-brown hair reaching her waist with slightly wavy ends,
half-up hairstyle with a small bun at the back tied with a dark plum-black ribbon,
side-swept bangs, two small pink bar-shaped hair clips on the left side of her bangs,
crimson red-brown eyes, slightly upturned confident eyes, a mischievous tsundere charm,
fair skin, slender build
```

**교복 의상(uniform)**

```text
summer school uniform: white collared blouse, large burgundy ribbon bow at the collar,
beige V-neck knit cardigan with buttons and two front pockets, sleeves slightly long,
navy blue pleated skirt,
pose: one hand on her hip, the other arm relaxed at her side, body turned slightly three-quarter, head tilted a little
```

**유카타 의상(yukata)**

```text
summer festival yukata: deep navy blue yukata with red goldfish pattern swimming across the fabric,
red obi sash with a small yellow obijime cord, same half-up hairstyle with the dark ribbon,
pose: holding a round paper uchiwa fan near her chest with one hand, other hand lightly holding the yukata sleeve
```

### 3-2. 전학생 — 히나 (디자인 시트 A·B, 동일 인물)

```text
a 17-year-old Japanese high school girl,
long fluffy wavy rose-pink hair reaching her waist, a thin braid along the right side of her face,
blue-violet (periwinkle lavender) eyes, soft round friendly eyes, gentle bright cheerful aura,
fair skin with a natural light blush, slender build
```

**헤어 A — 기본(default, 긴 웨이브)**

```text
hair down, long wavy pink hair, a small light sky-blue bar hair clip on the left side of her bangs
```

**헤어 B — 포니테일(ponytail)**

```text
high ponytail of long wavy pink hair tied with a light sky-blue ribbon bow, side locks framing her face,
same face, same eye color, same hair color as before
```

**교복 의상(uniform)**

```text
summer school uniform: white collared blouse, large burgundy ribbon bow at the collar,
light gray knit cardigan with buttons, sleeves slightly long covering part of her hands,
navy blue pleated skirt,
pose: hugging a pastel pink spiral notebook to her chest with both hands, standing straight, slight head tilt
```

**유카타 의상(yukata, 포니테일)**

```text
summer festival yukata: light sky-blue yukata with white morning glory flower pattern, navy blue obi sash,
high ponytail with the light sky-blue ribbon,
pose: holding a small white instant camera at her chest with both hands
```

---

## 4. 표정 6종

공통 스타일 + 캐릭터 고정 묘사 + 의상 뒤에 **표정 문구 하나**만 바꿔 붙입니다. 표정 편집(인페인팅)으로 만들 때는 이 문구만 넣으세요.

| 파일 이름 | 표정 | 아카네용 문구 | 히나용 문구 |
|---|---|---|---|
| `neutral` | 기본 | `slightly smug mischievous closed-mouth smile, half-lidded confident eyes, looking at viewer` | `gentle warm closed-mouth smile, relaxed eyebrows, looking at viewer` |
| `smile` | 웃음 | `playful happy grin with mouth open, eyes squinted with joy, light blush` | `bright joyful open-mouth smile, eyes happily closed in upward arcs, light blush` |
| `fluster` | 당황 | `flustered and caught off guard, wide eyes, small wavy open mouth, big sweat drop on her temple, blush` | `surprised and flustered, wide sparkling eyes, small open "o" mouth, sweat drop on her temple, blush` |
| `shy` | 부끄러움 | `embarrassed tsundere, deep blush across cheeks and nose, eyes looking away to the side, lips pressed together` | `shy and bashful, deep blush across cheeks, eyes looking down to the side, small shy smile` |
| `pout` | 삐짐 | `pouting, puffed cheeks, pursed lips, eyebrows furrowed, glancing sideways, light blush` | `playful pout, puffed cheeks, pursed lips, eyebrows slightly furrowed, looking up at viewer` |
| `sad` | 쓸쓸 | `wistful lonely expression, eyebrows tilted down, downcast eyes glistening slightly, small closed mouth` | `wistful sad expression, eyebrows tilted down, downcast eyes, faint lonely smile` |

> 아카네는 츤데레라 기본 표정부터 살짝 새침하고, 히나는 기본 표정이 부드럽습니다. 같은 표정이라도 두 사람의 성격 차이가 보이게 문구를 나눴습니다.

---

## 5. 스프라이트 30장 체크리스트

| # | 캐릭터 | 의상 / 헤어 | 파일 접두사 | 쓰이는 장면 |
|---|---|---|---|---|
| 1 | 아카네 | 교복 | `osana/uniform_default_` | 공통 전체, 아카네 루트 본편, 히나 루트의 친구 장면 |
| 2 | 아카네 | 유카타 | `osana/yukata_default_` | 아카네 루트 축제 후일담(o5~o7) |
| 3 | 히나 | 교복 / 긴 웨이브 | `tenko/uniform_default_` | 대부분의 학교 장면 |
| 4 | 히나 | 교복 / 포니테일 | `tenko/uniform_ponytail_` | 체육이 있는 날(공통 c5·c6, o3, t2) |
| 5 | 히나 | 유카타 / 포니테일 | `tenko/yukata_ponytail_` | 히나 루트 축제 후일담(t5~t7) |

각 줄마다 `neutral → smile → fluster → shy → pout → sad` 6장. 우선순위는 **1·3 → 4 → 2·5** 순서가 좋습니다(1·3번이 플레이 시간의 대부분을 차지).

### 완성 프롬프트 예시 — 아카네 교복 기본 표정

```text
high-quality anime visual novel character sprite, single character, cowboy shot from head to mid-thigh,
standing pose, facing the viewer, clean crisp lineart, soft cel shading with gentle gradients,
glossy detailed hair with soft highlights, large expressive eyes with detailed gradient irises and catchlights,
bright early-summer color palette, soft warm lighting, polished commercial galgame quality,
plain solid chroma key green background (#00B140), no background scenery, no floor shadow,
vertical 2:3 composition, centered, small margin above the head,
a 17-year-old Japanese high school girl,
long straight reddish chestnut-brown hair reaching her waist with slightly wavy ends,
half-up hairstyle with a small bun at the back tied with a dark plum-black ribbon,
side-swept bangs, two small pink bar-shaped hair clips on the left side of her bangs,
crimson red-brown eyes, slightly upturned confident eyes, a mischievous tsundere charm,
fair skin, slender build,
summer school uniform: white collared blouse, large burgundy ribbon bow at the collar,
beige V-neck knit cardigan with buttons and two front pockets, sleeves slightly long,
navy blue pleated skirt,
pose: one hand on her hip, the other arm relaxed at her side, body turned slightly three-quarter, head tilted a little,
slightly smug mischievous closed-mouth smile, half-lidded confident eyes, looking at viewer
```

### 표정 편집 지시 예시(ChatGPT 등 대화형 도구)

```text
Using the attached image, change ONLY the facial expression to:
"deep blush across cheeks and nose, eyes looking away to the side, lips pressed together".
Keep the pose, hands, clothes, hair, body size, position, framing and the green background exactly identical.
```

---

## 6. (선택) 이벤트 CG — 주요 장면 한 장 그림

스프라이트만으로도 게임은 완성되지만, 아래 장면에 CG 가 있으면 상용 비주얼노벨 같은 몰입감이 크게 올라갑니다.
받으시면 엔진에 CG 표시 명령을 추가하고 해당 대사 위치에 연결하겠습니다.

**규격:** 가로 **16:9, 1920×1080 이상**, 배경 포함 완성 그림, 아래쪽 약 25%는 대사창이 반투명하게 덮으므로 얼굴은 화면 위쪽 2/3 안에.
**공통 스타일(앞에 붙이기):**

```text
high-quality anime visual novel event CG, cinematic composition, 16:9 widescreen, detailed background,
soft cel shading, emotional lighting, polished commercial galgame quality, no text, no watermark
```

**주인공(그림 없음) 묘사:** 플레이어 자신이므로 **얼굴이 보이지 않게**(뒷모습, 어깨·손만, 또는 프레임 밖) 그립니다.

```text
the male protagonist is shown only from behind or partially (shoulder, arm, hand), face not visible,
short black hair, summer school uniform: white short-sleeved shirt and dark navy trousers
```
축제 장면에서는 `wearing a simple dark navy jinbei` 로 바꿔 주세요.

| 번호 | 파일 이름 | 장면(대본 위치) | 구도·내용 |
|---|---|---|---|
| KV | `cg/kv_title.png` | 타이틀 화면 | 맑은 여름 하늘 아래 학교 앞 언덕길, 교복 차림의 아카네(왼쪽, 허리에 손)와 히나(오른쪽, 손 흔들기)가 화면을 보며 웃음. **위쪽 1/3 또는 왼쪽에 로고 넣을 빈 하늘** |
| 01 | `cg/cg01_rain_osana.png` | 공통 c6 소나기 — 아카네 우산을 함께 쓴 경우 | 비 오는 주택가, 작은 남색 접이식 우산 하나를 주인공과 아카네가 함께 씀. 우산이 주인공 쪽으로 기울어 아카네 어깨가 젖음. 아카네는 부끄러워 옆을 봄. 앞쪽에 빌린 우산을 쓴 포니테일 히나가 뒤돌아보며 미소 |
| 02 | `cg/cg02_rain_tenko.png` | 공통 c6 소나기 — 히나와 우산을 함께 쓴 경우 | 같은 길, 우산이 히나 쪽으로 기울어 주인공 어깨가 젖음. 포니테일 히나가 올려다보며 볼을 붉힘("그런 것까지 보고 있었어?"). 옆에 자기 우산을 쓴 아카네 |
| 03 | `cg/cg03_door_osana.png` | 아카네 루트 o2 감기 문병 | 맨션 현관문이 체인 길이만큼 열린 틈. 마스크를 쓰고 잠옷 위에 카디건을 걸친 아카네가 눈을 돌린 채 노트를 받음. 따뜻한 실내등과 저녁 복도의 대비 |
| 04 | `cg/cg04_promise_osana.png` | 아카네 루트 o4 노을 강변 약속 | 노을 진 강변 둑에서 라무네 병을 든 교복 아카네가 웃음을 터뜨림("내일 토요일이거든"). 강물에 비친 노을, 철교 실루엣 |
| 05 | `cg/cg05_confession_osana.png` | 아카네 루트 o6 고백 직후 첫 불꽃 | 밤 강변 둑, 유카타 아카네가 주인공 소매를 꼭 쥔 채 눈가가 촉촉하게 웃음. 하늘에 첫 불꽃, 강물에 반사. 아래에서 올려다보는 구도 |
| 06 | `cg/cg06_homeward_osana.png` | 아카네 루트 o7 귀갓길 | 가로등이 이어진 밤길, 손을 잡고 걷는 두 사람의 뒷모습(아카네는 유카타). 아카네가 작은 수첩을 들고 돌아보며 장난스럽게 웃음 |
| 07 | `cg/cg07_cats_tenko.png` | 히나 루트 t1 신사 돌계단 | 노을 진 이끼 낀 돌계단, 교복 히나(긴 머리)가 계단에 앉아 있고 통통한 흰 고양이가 옆에 털썩 붙어 앉음. 놀람과 기쁨이 섞인 순수한 웃음, 손에 흰 즉석카메라. 주변에 다른 고양이 2~3마리 |
| 08 | `cg/cg08_invite_tenko.png` | 히나 루트 t4 언덕 위 전망 | 신사 뒤 언덕의 낡은 벤치, 노을 진 동네와 강이 내려다보임. 교복 히나가 두 손으로 얼굴을 가렸지만 빨개진 귀가 보임("내일도 같이 갈래?" 직후) |
| 09 | `cg/cg09_selfie_tenko.png` | 히나 루트 t6 고백 직후 첫 불꽃 | 밤 신사 언덕, 주인공이 팔을 뻗어 즉석카메라를 든 셀카 구도. 유카타·포니테일 히나가 주인공 어깨에 머리를 기대고 활짝 웃음, 머리 위 첫 불꽃 |
| 10 | `cg/cg10_photo_tenko.png` | 히나 루트 t7 귀갓길 | 가로등 아래, 두 사람의 손에 들린 현상된 즉석사진 클로즈업. 사진 속에는 불꽃 아래 웃는 두 사람. 배경은 흐릿한 여름밤 길과 편의점 불빛 |

### CG 프롬프트 예시 — 09 셀카

```text
high-quality anime visual novel event CG, cinematic composition, 16:9 widescreen, detailed background,
soft cel shading, emotional lighting, polished commercial galgame quality, no text, no watermark,
night on a small shrine hill overlooking a town, the first big firework blooming in the sky above,
selfie composition: the male protagonist's arm extended toward the viewer holding a small white instant camera,
his face not visible, wearing a simple dark navy jinbei,
a 17-year-old Japanese girl with long fluffy wavy rose-pink hair in a high ponytail tied with a light sky-blue ribbon,
blue-violet eyes, wearing a light sky-blue yukata with white morning glory pattern and a navy obi,
leaning her head on his shoulder and smiling brightly, firework light coloring her cheeks blue and red,
warm and romantic summer night atmosphere
```

나머지 CG 도 같은 방식으로 **공통 스타일 + 장면 묘사(위 표) + 캐릭터 고정 묘사(3장) + 의상** 순서로 이어 붙이면 됩니다.

---

## 7. 보내 주신 뒤 제가 하는 일

1. 배경 제거(투명/초록), 가장자리 다듬기, 표정끼리 위치·크기 정렬, 1600×2400 WebP 변환
2. `src/story/assets.ts` 연결(조합별로 6장이 모두 오면 그 조합부터 교체) → 임시 그림 표시가 사라짐
3. 실제 화면(PC·휴대폰 가로)에서 얼굴이 대사창·빠른 메뉴에 가리지 않는지 확인하고 위치 미세 조정
4. CG 가 오면 엔진에 CG 명령 추가 + 해당 대사 위치에 연결 + 저장/불러오기·기록에서 복원 확인

일부만 먼저 보내 주셔도 됩니다(예: 아카네 교복 6장). 받은 만큼 바로 넣어 화면 확인용 스크린샷을 보여 드리겠습니다.
