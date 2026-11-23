# 내일도 같이 갈래? (가제)

일본 학원물 애니메이션 분위기의 짧은 **학원 일상 러브코미디 비주얼노벨** 웹게임 — 첫 플레이 버전(v0.1).
설치 없이 브라우저에서 실행되며 PC와 휴대폰 가로 화면을 지원합니다.

- 공통 이야기(선택지 4회) → 히로인별 본편 → 선택된 히로인의 여름 축제 후일담(고백) → 엔딩
- 엔딩 2개: 소꿉친구 / 전학생
- 이름·학교·날짜는 임시값이며 `src/story/config.ts` 한 곳에서 바꿉니다.
- **그림과 음악은 모두 개발용 임시 에셋**(코드로 그린 SVG, 코드로 합성한 음원)입니다. → [docs/ASSETS.md](docs/ASSETS.md)

## 실행

```bash
npm install
npm run dev        # 개발 서버 http://localhost:5173
npm run build      # dist/ 에 정적 파일 생성 (상대 경로 빌드라 어느 하위 경로에 올려도 동작)
npm run preview    # 빌드 결과 미리보기 http://localhost:4173
```

`dist/` 폴더를 정적 호스팅(GitHub Pages, Netlify, 사내 웹서버 등)에 그대로 올리면 링크로 플레이할 수 있습니다.
GitHub Pages 용 워크플로(`.github/workflows/deploy-pages.yml`)는 **수동 실행 전용**으로 준비만 되어 있습니다
(저장소 Settings → Pages → Source 를 GitHub Actions 로 바꾼 뒤 Actions 탭에서 Run workflow).

## 검사

```bash
npm run check          # 타입 검사 + 스토리 검증 + 단위 테스트 + 빌드
npm run validate       # 스토리 연결·id·에셋 파일·전 분기 시뮬레이션·루트 규칙·추정 플레이 시간
npm run validate -- --paths   # 모든 선택 조합과 도달 루트 출력
npm test               # 단위 테스트(Vitest): 루트 규칙, 동점, 저장/불러오기, 손상 데이터, 화면 배치
npm run test:e2e       # 브라우저 테스트(Playwright, Chromium): 두 엔딩 플레이, 입력 중복, 자동/건너뛰기, 모바일 배치
npm run docs           # docs/SCRIPT.md(검토용 대본), docs/ASSETS.md(에셋 목록) 다시 생성
```

## 조작

| 동작 | 마우스/터치 | 키보드 |
|---|---|---|
| 대사 진행 / 글자 즉시 완성 | 화면 클릭·탭 | Enter, Space, → |
| 선택지 | 버튼 누르기 | 1~3 |
| 자동 진행 | [자동] | A |
| 읽은 대사 건너뛰기 | [스킵] | S |
| 대화 기록 | [기록], 마우스 휠 위로 | L, ↑ |
| 메뉴(저장·불러오기·설정·전체화면·타이틀) | [메뉴] | Esc |

- 건너뛰기는 **이미 읽은 대사만** 넘기며 처음 보는 대사와 선택지에서 멈춥니다. 자동 진행은 선택지에서 기다립니다.
- 메뉴가 열려 있거나 세로 화면 안내가 떠 있는 동안에는 진행·자동 진행·건너뛰기가 모두 멈춥니다.
- 저장: 수동 슬롯 6개 + 자동 저장 1개(대사가 바뀔 때마다). 새로고침 후 [이어하기]로 마지막 문장에서 다시 시작합니다.
- 저장·설정·읽은 대사 기록은 브라우저 로컬 저장소에만 남습니다(기기 간 동기화 없음).

## 구조

```
src/
  engine/            게임 엔진(스토리 내용을 모름)
    types.ts         장면·스텝·상태 타입
    dsl.ts           대본 작성 도우미(say, me, mono, choice, show, bg …)
    runner.ts        실행기: 진행, 선택, 루트 결정(decideRoute), 조건 분기
    validate.ts      스토리 검증기(연결 오류·없는 id·도달 불가 엔딩·루트 혼입)
    save.ts          저장 슬롯·스키마 버전·손상/비호환 복구·읽음 기록·엔딩 기록
    storage.ts       localStorage 안전 래퍼(막혀 있으면 메모리로 대체)
    settings.ts      글자 속도·자동 진행 속도·음량·대사창 불투명도
    audio.ts         Web Audio: 자동재생 제한 해제, 파일 없거나 실패해도 진행
    text.ts          이름 치환과 받침에 맞는 조사 자동 선택
  ui/                화면(무대, 대사창, 선택지, 메뉴, 레이아웃, 세로 안내)
  story/             ★ 스토리 데이터
    config.ts        이름·학교·날짜·엔딩 제목(한 곳에서 변경)
    assets.ts        배경·캐릭터(표정/의상/헤어)·음악·효과음 경로
    scenes/common.ts 공통 루트
    scenes/osana.ts  소꿉친구 루트 + 후일담
    scenes/tenko.ts  전학생 루트 + 후일담
scripts/             검증·대본/에셋 문서 출력·임시 에셋 생성 스크립트
docs/
  STORY_BIBLE.md     설정집(인물·비트 시트·작성 규칙)
  SCRIPT.md          검토용 대본(자동 생성)
  ASSETS.md          에셋 목록·교체 규격(자동 생성)
tests/unit, tests/e2e
```

### 대본 작성 규칙 요약

- 대사·카드·선택지·엔딩·라벨에는 고유 id(`c1.010` 형식)를 직접 붙입니다. 저장 위치와 읽음 기록이 이 id를 가리키므로
  대사를 추가·삭제해 배열 순서가 바뀌어도 저장이 깨지지 않습니다. 이미 공개한 id는 바꾸지 마세요.
- 이름은 `{osana}`, `{tenko:는}`, `{me:를}` 처럼 치환 키로 씁니다(조사 자동).
- 수정 후 `npm run validate` 로 연결 오류와 분기를 확인하세요.

### 저장 데이터

- 키: `ashita.save.auto`, `ashita.save.1`~`6`, `ashita.global`(읽은 대사·엔딩), `ashita.settings`
- 모든 저장에는 `schema`(현재 1)가 들어 있고, 손상·미래 버전·다른 게임 데이터는 안내 후 삭제할 수 있습니다.
- 대사가 삭제되어 저장 위치를 찾을 수 없으면 "그 장면 처음부터" 불러오기를 제안합니다.
