/**
 * 공통 루트 (c1~c10) — 1주 차 월요일 ~ 2주 차 월요일 점심
 *
 * 흐름: c1 → c2 → c3 → c4 → c45(수) → c5(목) → c6(목) → c7(금)
 *        → [해금 시] 복도 첫 만남(c7 안) → 노을길 → c8_raffle(토 오전, 해금 전용)
 *        → (여덟 엔딩 확장, docs/EIGHT_ENDINGS_DESIGN.md 3절)
 *          발견: c8_raffle → e1_ice4 → e1s_sunday4 → e2_frog4 → e3_rain4(후반 선택 6회 +0.5) → 루트 결정(완전 동점이면 히든)
 *          미발견: c7 → e1_ice3 → c8_bakery → c9_puzzle → e2_frog3 → c10_window → e3_rain3 → 루트 결정(옛 규칙)
 *          구저장(해금 후 c8·c9·c10 진행 중): c8_bakery → c9_puzzle → c10_window → c10.join 옛 판정(+3, 히든 없음)
 *        에피소드 장면은 scenes/episodes4.ts(넷)·episodes3.ts(셋)에 있다.
 *
 * 초반 선택 4회(c3.ch, c4.ch, c6.ch, c7.ch): a = 소꿉친구, b = 전학생(+2, +2, +2, c7 만 +3),
 *   c = 셋이 함께(osana +1, tenko +1, 최근 히로인 갱신 없음). 기존 a·b 문구·반응·id 는 그대로 둔다.
 * c7 반응 뒤 종이 울리면 해금 판정 1회(unlock): 두 점수 차가 1 이하면 kh.met = true,
 *   코하루 시작 점수 = 두 점수의 평균. 미해금이면 복도 장면·토요일 오전을 통째로 건너뛴다.
 * 후반 선택 3회(c8.ch, c9.ch, c10.ch): a/b/k 개인 +3, c(함께)는 미해금일 때만, k 는 해금일 때만 보인다.
 * c10 마지막 독백 뒤 decideRoute: 최고점, 동점이면 공동 최고점 중 가장 최근에 개인 선택한 인물.
 * 미해금 플레이에서 지나가는 대사·이름표·선택지·장면 제목에는 코하루 흔적이 없어야 한다
 *   (해금 전용 줄은 isFlag('kh.met') 분기 안에만 둔다).
 * 문자 메시지 줄: sayAs(id, 화자, '{이름} · 문자', 본문) + 대화 시작에 sfx('message'). 사복 스프라이트는 띄우지 않는다.
 * 히나 헤어: c45·c5·c6(체육 있는 날)만 포니테일, 나머지는 기본(긴 웨이브).
 * 주인공의 착각: 소꿉친구의 배려는 '습관'(c1.110·c6.030), 전학생의 직진은 '친화력'(c6.j45)으로 받아들인다.
 */
import type { Scene } from '../../engine/types';
import {
  bg,
  bgm,
  card,
  cg,
  choice,
  chose,
  decideRoute,
  goto,
  hide,
  isFlag,
  jump,
  label,
  me,
  mono,
  not,
  opt,
  place,
  routeBranch,
  say,
  sayAs,
  scene,
  sfx,
  show,
  together,
  unlock,
  when,
} from '../../engine/dsl';

/**
 * 루트 결정에 쓰는 선택 순서(시간순). decideRoute 가 동점 처리 때 뒤에서부터 훑는다.
 * 미발견 경로(e3_rain3)와 구저장 발견 경로(c10.join)의 옛 규칙에 쓴다
 */
export const ROUTE_CHOICES = ['c3.ch', 'c4.ch', 'c6.ch', 'c7.ch', 'c8.ch', 'c9.ch', 'c10.ch'];
/** 발견 경로(새 흐름) 루트 결정 순서: 초반 4회 + 에피소드 후반 6회(e3_rain4 끝에서 한 번 판정) */
export const ROUTE_CHOICES6 = ['c3.ch', 'c4.ch', 'c6.ch', 'c7.ch', 'e1f.ch1', 'e1f.ch2', 'e2f.ch1', 'e2f.ch2', 'e3f.ch1', 'e3f.ch2'];
/** 금요일 복도 첫 만남을 실제로 본 플레이인지(해금 판정 결과) */
export const MET = 'kh.met';
/** 처마 장면(e3_rain4·e3_rain3)을 지난 새 흐름인지. 루트 첫 장면의 연결 줄이 본다 */
export const EP3_DONE = 'ep3.done';

export const COMMON_SCENES: Scene[] = [
  // ---------------------------------------------------------------------------
  // c1. 월요일 아침 등굣길 — 약속 없이 기다리는 소꿉친구
  // ---------------------------------------------------------------------------
  scene({ id: 'c1_morning', title: '월요일 아침', route: 'common', part: 'main' }, [
    bg('road_morning', 'black'),
    bgm('daily'),
    place('{d1} · 등굣길'),
    mono('c1.010', '장마가 끝나고 매미가 울기 시작했다. 현관문을 열자 담장에 기대 선 익숙한 얼굴이 고개를 들었다.'),
    show('osana', { pos: 'center', expr: 'pout', outfit: 'uniform', hair: 'default' }),
    say('c1.020', 'osana', '3분 늦었어.', 'pout'),
    me('c1.030', '약속한 적도 없는데 지각이 성립해?'),
    say('c1.040', 'osana', '약속은 안 했어도 지각은 지각이거든. 벌칙은 음료 하나.', 'smile'),
    mono('c1.050', '유치원 때부터 옆집이던 {osanaFamily} {osana}. 역 앞으로 이사 간 지 3년째, 오늘도 “어차피 가는 길”이라며 저기 서 있다.'),
    say('c1.060', 'osana', '그보다 들었어? 오늘 우리 반에 전학생 온대. 여자래.', 'neutral'),
    me('c1.070', '방학 직전에? 힘들겠다. 반에 금방 적응하면 좋을 텐데.'),
    mono('c1.080', '{osana:는} 잠깐 내 얼굴을 빤히 들여다보더니, 작게 웃었다.'),
    say('c1.090', 'osana', '너답네. 보통은 예쁘냐부터 물어보는데.', 'smile'),
    me('c1.100', '예쁜지 아닌지는 내가 도와줄 수 있는 게 아니잖아.'),
    mono('c1.110', '전학생이 와도 이 아침은 똑같을 거다. 10년 된 습관이고, {osana:가} 옆에 있는 건 공기처럼 당연하니까.'),
    jump('c2_homeroom'),
  ]),

  // ---------------------------------------------------------------------------
  // c2. 조례 — 전학생 소개, 옆자리
  // ---------------------------------------------------------------------------
  scene({ id: 'c2_homeroom', title: '옆자리 전학생', route: 'common', part: 'main' }, [
    hide('all'),
    bg('classroom_day'),
    sfx('bell'),
    place('{d1} · {classroom} 조례'),
    say('c2.010', 'teacher', '소문은 다들 들었겠지. 길게 끌지 않겠다. 들어와라.'),
    sfx('door'),
    show('tenko', { pos: 'center', expr: 'smile', outfit: 'uniform', hair: 'default' }),
    mono('c2.020', '분홍빛 긴 웨이브 머리가 문턱을 넘자, 교실이 한 박자 늦게 술렁였다.'),
    say('c2.030', 'tenko', '{tenkoFamily} {tenko}입니다. 아버지 일로 세 번째 전학인데, 이번엔 오래 있을 것 같아요. 잘 부탁드립니다!', 'smile'),
    say('c2.050', 'teacher', '자리는 창가 맨 뒤, {meFamily} 옆이다. {meFamily}, 교과서 좀 같이 보여 줘라.'),
    say('c2.060', 'tenko', '옆자리네. 이름 물어봐도 돼?', 'smile'),
    me('c2.070', '{meFamily} {me}. 교과서는 반씩 보자.'),
    say('c2.080', 'tenko', '{meFamily} 군. 아, {me} 군이라고 불러도 돼? 이름으로 부르면 더 빨리 친해지잖아.', 'neutral'),
    me('c2.090', '편한 대로 불러.'),
    say('c2.100', 'tenko', '그럼 {me} 군. 잘 부탁해, 옆자리 씨.', 'smile'),
    mono('c2.110', '그 순간 앞자리 {osana}의 어깨가 딱 굳었다. 에어컨 바로 앞자리라 추운가 보다.'),
    jump('c3_break'),
  ]),

  // ---------------------------------------------------------------------------
  // c3. 1교시 후 쉬는 시간 — 선택지 1
  // ---------------------------------------------------------------------------
  scene({ id: 'c3_break', title: '쉬는 시간 10분', route: 'common', part: 'main' }, [
    sfx('bell'),
    place('1교시 후 쉬는 시간'),
    show('tenko', { pos: 'right', expr: 'smile' }),
    say('c3.010', 'classmates', '전엔 어디 살았어? 동아리는? 그 머리, 매일 직접 하는 거야?'),
    mono('c3.020', '{tenkoFamily:는} 웃으며 받아넘겼다. 그런데 말이 끊길 때마다 짧게 숨을 고른다. 조금 지친 거다.'),
    show('osana', { pos: 'left', expr: 'neutral', outfit: 'uniform', hair: 'default' }),
    say('c3.030', 'osana', '{me}, 다음 시간 음악실이잖아. {tenkoFamily:는} 별관 가는 길 모를 텐데.', 'neutral'),
    choice('c3.ch', '쉬는 시간은 10분. 누구에게 먼저 말을 걸까?', [
      opt('a', '뒤돌아본 {osana}에게 먼저 대답한다', { heroine: 'osana', points: 2, goto: 'c3.a' }),
      opt('b', '둘러싸인 {tenkoFamily}에게 먼저 다가간다', { heroine: 'tenko', points: 2, goto: 'c3.b' }),
      opt('c', '두 사람에게 같이 음악실에 가자고 한다', { effects: together(), goto: 'c3.c' }),
    ]),

    label('c3.a'),
    me('c3.a10', '맞다, 음악실. 같이 데려가자. 너 길 설명 잘하잖아.'),
    say('c3.a20', 'osana', '딱히 친절해서 그러는 거 아니야. 첫날부터 지각하면 불쌍하잖아.', 'pout'),
    say('c3.a30', 'osana', '{tenkoFamily}, 음악실 같이 가자. 다들 질문은 점심때 마저 해.', 'neutral'),
    say('c3.a40', 'tenko', '살았다. 고마워, 둘 다!', 'smile'),
    goto('c3.join'),

    label('c3.b'),
    me('c3.b10', '얘들아, 다음 시간 음악실이야. 질문은 점심때 마저 하자.'),
    say('c3.b20', 'tenko', '고마워. 누가 뭘 물어봤는지 슬슬 헷갈리던 참이었어.', 'smile'),
    me('c3.b30', '질문 서른 개면 누구라도 그래. 길은 {osana:가} 알려 줄 거야.'),
    say('c3.b40', 'osana', '왜 내가. 뭐, 어차피 가는 길이니까.', 'pout'),
    goto('c3.join'),

    label('c3.c'),
    me('c3.c10', '{tenkoFamily}, 질문 하나만 더. 음악실이 어느 쪽인지는 알아?'),
    say('c3.c20', 'tenko', '전혀. 자신 있게 반대로 갈 수 있어.', 'smile'),
    me('c3.c30', '그럼 셋이 가자. {osana:가} 앞장서고, 난 뒤에서 반대로 가는 사람 잡을게.'),
    say('c3.c40', 'osana', '너부터 잡아. 음악책 두고 가잖아.', 'pout'),
    me('c3.c50', '…출발하기도 전에 잡혔네.'),
    say('c3.c60', 'tenko', '아, 이런 반 좋다. 잠깐만, 내 것도 챙길게!', 'smile'),

    label('c3.join'),
    hide('all'),
    bg('hallway'),
    show('osana', { pos: 'left', expr: 'neutral' }),
    show('tenko', { pos: 'right', expr: 'neutral', hair: 'default' }),
    say('c3.j10', 'tenko', '저기, 두 사람 혹시 사귀어?', 'neutral'),
    sfx('sparkle'),
    say('c3.j20', 'osana', '아, 아니거든!', 'fluster'),
    me('c3.j30', '소꿉친구야. 가족 같은 거지.'),
    say('c3.j40', 'osana', '…가족 같은 거, 래.', 'sad'),
    show('tenko', { expr: 'neutral' }),
    mono('c3.j50', '작게 중얼거리는 걸 보니 남매 취급은 싫은가 보다. {tenkoFamily:는} 알겠다는 듯 빙긋 웃었다.'),
    say('c3.j60', 'tenko', '그럼 나도 끼워 줘. 이 학교 첫 친구 두 명 확보! 이제 이름으로 불러 줘.', 'smile'),
    say('c3.j70', 'osana', '내일부터. 갑자기는 입에 안 붙어.', 'shy'),
    jump('c4_lunch'),
  ]),

  // ---------------------------------------------------------------------------
  // c4. 화요일 점심 중정 — 계란말이, 선택지 2
  // ---------------------------------------------------------------------------
  scene({ id: 'c4_lunch', title: '셋이서 점심', route: 'common', part: 'main' }, [
    hide('all'),
    bg('courtyard'),
    place('{d2} · 점심시간 중정'),
    show('osana', { pos: 'left', expr: 'neutral', outfit: 'uniform', hair: 'default' }),
    show('tenko', { pos: 'right', expr: 'smile', outfit: 'uniform', hair: 'default' }),
    me('c4.010', '{tenko}, 이쪽 벤치가 그늘이야.'),
    say('c4.020', 'tenko', '앗, 이름. 진짜 불러 줬네!', 'smile'),
    say('c4.025', 'osana', '어제 약속했잖아. …{tenko}.', 'shy'),
    say('c4.030', 'tenko', '두 배로 좋다! {osana}짱 도시락 예쁘다. 계란말이 반짝반짝해. 직접 싼 거야?', 'smile'),
    say('c4.040', 'osana', '…대충.', 'fluster'),
    me('c4.050', '{osana}네 어머니가 요리를 잘하시거든. 옛날부터.'),
    say('c4.060', 'osana', '…그렇지 뭐. 자, 이거. 많이 만들어서… 아니, 엄마가 많이 싸 줘서.', 'fluster'),
    mono('c4.070', '뚜껑 위에 올라온 계란말이는 달았다. 어릴 때부터 내가 좋아하던 맛이다.'),
    sfx('sparkle'),
    mono('c4.080', '{tenko:는} 눈을 반짝이며 {osana:와} 계란말이를 번갈아 봤다. 그렇게 맛있어 보이나.'),
    say('c4.090', 'tenko', '이 동네에 가 볼 만한 데 있어? 이사 가면 처음 간 곳을 사진으로 남기거든.', 'neutral'),
    choice('c4.ch', '{tenko}에게 동네를 소개한다면?', [
      opt('a', '{osana:와} 다니던 막과자 가게를 추천한다', { heroine: 'osana', points: 2, goto: 'c4.a' }),
      opt('b', '추천보다 먼저 {tenko}의 취향을 묻는다', { heroine: 'tenko', points: 2, goto: 'c4.b' }),
      opt('c', '셋이서 지도에 가 보고 싶은 곳을 하나씩 짚는다', { effects: together(), goto: 'c4.c' }),
    ]),

    label('c4.a'),
    me('c4.a10', '상점가 끝 막과자 가게, {shop}. {osana:랑} 초등학생 때부터 다닌 데야.'),
    say('c4.a20', 'osana', '할머니가 아직도 우리 이름을 기억하셔. 제일 싼 과자만 사도 덤을 주시고.', 'smile'),
    say('c4.a30', 'tenko', '막과자 가게! 드라마에서만 봤어. 꼭 가 볼래.', 'smile'),
    say('c4.a40', 'osana', '가게 앞 평상엔 삼색 고양이도 와. 모찌라고, 얘가 붙인 이름이야.', 'smile'),
    goto('c4.join'),

    label('c4.b'),
    me('c4.b10', '추천하기 전에, {tenko:는} 뭘 좋아해? 그걸 알아야 고르지.'),
    say('c4.b20', 'tenko', '어, 나? 음, 고양이! 그리고 동네가 한눈에 내려다보이는 높은 데.', 'shy'),
    me('c4.b30', '그럼 언덕 위 {shrine}. 돌계단에 고양이들이 모여. 대장은 통통한 흰 고양이 다이후쿠.'),
    say('c4.b40', 'osana', '이 동네 고양이 이름은 거의 다 얘가 지었어. 반에서도 고양이 박사라고 불려.', 'neutral'),
    goto('c4.join'),

    label('c4.c'),
    me('c4.c10', '내가 정하면 맨날 가던 데만 나올걸. 하나씩 골라 볼래?'),
    mono('c4.c20', '내 휴대폰으로 동네 지도를 띄워서 빈 도시락 뚜껑 옆에 놓았다.'),
    say('c4.c30', 'osana', '그럼 난 여기. 저녁에 가면 갓 구운 전병 냄새가 골목 끝까지 나.', 'smile'),
    say('c4.c40', 'tenko', '난 파란 지붕! 아침마다 보이는데 뭘 파는지 아직도 모르겠어.', 'smile'),
    me('c4.c50', '거기 세탁소야. 그럼 나는…… 여기 있는 벤치. 두 군데 다 걸으면 쉴 데가 필요해.'),
    say('c4.c60', 'tenko', '냄새 맡고, 세탁하고, 쉬기. 첫 동네 여행치곤 알차네.', 'smile'),
    say('c4.c70', 'osana', '잠깐, 누가 세탁물을 들고 가는데.', 'pout'),

    label('c4.join'),
    mono('c4.j10', '{tenko:는} 늘 안고 다니던 분홍 수첩에 무언가를 적었다. 칸마다 글씨가 빽빽했다.'),
    jump('c45_journal'),
  ]),

  // ---------------------------------------------------------------------------
  // c45. 수요일 종례 직후 교실 — 학급 일지 (선택지 없음, 모든 플레이 공통)
  // ---------------------------------------------------------------------------
  scene({ id: 'c45_journal', title: '학급 일지', route: 'common', part: 'main' }, [
    hide('all'),
    bg('classroom_day'),
    place('{d3} · {classroom} 종례 후'),
    show('osana', { pos: 'left', expr: 'neutral', outfit: 'uniform', hair: 'default' }),
    show('tenko', { pos: 'right', expr: 'neutral', outfit: 'uniform', hair: 'ponytail' }),
    mono('c45.010', '학급 일지 제일 아래에 한 칸이 남았다. ‘오늘 우리 반에서 있었던 일.’ 특이 사항 없…… 거기까지 썼는데 옆에서 {tenko:가} 읽었다.'),
    say('c45.020', 'tenko', '벌써 없어? 나한텐 여기 온 지 겨우 사흘째인데?', 'pout'),
    mono('c45.030', '앞자리에서 하얀 지우개가 굴러왔다. {osana:가} 내 연필 끝을 톡 쳤다.'),
    say('c45.040', 'osana', '체육 때 긴 줄넘기 했잖아. 우리 반 연속 세 번. 그거 써.', 'neutral'),
    me('c45.050', '네 번 아니야? 마지막에 나 분명히 뛰었는데.'),
    say('c45.060', 'tenko', '맞아. 줄은 멈췄고 {me} 군 혼자 한 번 더 뛰었어.', 'smile'),
    mono('c45.070', '{tenko:가} 발뒤꿈치를 살짝 들었다 놓자 {osana:가} 책상에 이마를 묻었다. 어깨가 들썩였다.'),
    say('c45.080', 'osana', '그럼 ‘다 같이 세 번, {meFamily} 혼자 한 번’.', 'smile'),
    say('c45.090', 'tenko', '쉼표 뒤까지 꼭 써 줘. 내가 제일 좋아하는 데야.', 'smile'),
    mono('c45.100', '일지에 그대로 적었다. 빈칸 하나 채웠을 뿐인데 내일 선생님이 읽을 때 슬쩍 뒤에 서 있고 싶어졌다.'),
    jump('c5_gym'),
  ]),

  // ---------------------------------------------------------------------------
  // c5. 목요일 체육 후 자판기 — 가위바위보 음료 내기 (선택지 없음)
  // ---------------------------------------------------------------------------
  scene({ id: 'c5_gym', title: '음료 내기', route: 'common', part: 'main' }, [
    card('c5.010', '{d4}', '체육이 있는 날'),
    hide('all'),
    bg('hallway'),
    place('체육 후 쉬는 시간 · 복도 자판기 앞'),
    show('osana', { pos: 'left', expr: 'smile', outfit: 'uniform', hair: 'default' }),
    show('tenko', { pos: 'right', expr: 'smile', outfit: 'uniform', hair: 'ponytail' }),
    say('c5.020', 'osana', '목마르다. 음료 내기 하자. 통산 412전 209승 203패, 내가 여섯 판 앞서.', 'smile'),
    say('c5.025', 'tenko', '나도 낄래! 가위바위보라면 자신 있어.', 'smile'),
    show('osana', { expr: 'fluster' }),
    mono('c5.030', '첫 판도, 둘째 판도, 셋째 판도 {tenko} 혼자 이겼다. {osana:는} 허리에 손을 짚은 채 굳었다.'),
    say('c5.040', 'tenko', '전학 첫날 친구 만들기엔 이게 최고거든. 그리고 {osana}짱, 지기 싫으면 꼭 주먹 내더라.', 'smile'),
    say('c5.050', 'osana', '한 판 더! 방금 건 몸풀기였어.', 'pout'),
    mono('c5.060', '{osana:는} 정말로 주먹을 냈다. {tenko:는} 보. 덩달아 주먹을 낸 나는, 그 뒤로도 꼬박꼬박 졌다.'),
    me('c5.070', '자, 패자의 공물이다. 그러고 보니 {tenko}, 묶은 머리 잘 어울린다. 활발해 보여.'),
    say('c5.080', 'tenko', '에? {me} 군은 칭찬을 그냥 하는구나.', 'fluster'),
    say('c5.090', 'tenko', '고마워. 체육 있는 날만 묶거든. 덕분에 오늘 하루 기분 좋겠다.', 'smile'),
    show('osana', { expr: 'shy' }),
    me('c5.100', '{osana}, 방금 리본 만지던데. 풀렸어? 다시 묶어 줄까?'),
    say('c5.110', 'osana', '안 풀렸거든.', 'pout'),
    say('c5.120', 'tenko', '후훗. {me} 군, 그건 좀 아닌 것 같아.', 'smile'),
    jump('c6_rain'),
  ]),

  // ---------------------------------------------------------------------------
  // c6. 같은 날 방과 후 소나기 — 선택지 3, 제목 대사의 첫 등장
  // ---------------------------------------------------------------------------
  scene({ id: 'c6_rain', title: '소나기와 우산', route: 'common', part: 'main' }, [
    hide('all'),
    bg('shoe_lockers_rain'),
    bgm(null),
    sfx('rain'),
    place('{d4} · 방과 후 신발장'),
    show('osana', { pos: 'left', expr: 'neutral', outfit: 'uniform', hair: 'default' }),
    show('tenko', { pos: 'right', expr: 'neutral', outfit: 'uniform', hair: 'ponytail' }),
    mono('c6.010', '신발을 갈아 신는 사이, 굵은 소나기가 쏟아졌다.'),
    say('c6.020', 'osana', '아침에 네 가방에 접이식 우산 넣어 놨어. 너 일기예보 안 보지?', 'pout'),
    me('c6.030', '어, 진짜 있네. 고마워. {osana:는} 옛날부터 이런 건 꼭 챙기더라.'),
    say('c6.040', 'osana', '네가 안 챙기니까 그렇지.', 'shy'),
    say('c6.050', 'tenko', '아하하, 난 우산이 없네. 집이 편의점 앞 갈림길 근처라 뛰면 금방이긴 한데.', 'fluster'),
    choice('c6.ch', '우산은 두 개, 사람은 셋.', [
      opt('a', '{tenko}에게 우산을 빌려주고 {osana}의 우산에 들어간다', { heroine: 'osana', points: 2, goto: 'c6.a' }),
      opt('b', '같은 방향인 {tenko}에게 같이 쓰자고 한다', { heroine: 'tenko', points: 2, goto: 'c6.b' }),
      opt('c', '두 우산을 붙여 셋이 나란히 걷는다', { effects: together(), goto: 'c6.c' }),
    ]),

    label('c6.a'),
    me('c6.a10', '{tenko}, 이거 써. 나는 {osana} 우산에 들어가면 돼.'),
    hide('all'),
    bg('road_rain'),
    bgm('heart'),
    show('osana', { pos: 'left', expr: 'neutral', outfit: 'uniform', hair: 'default' }),
    show('tenko', { pos: 'right', expr: 'smile', outfit: 'uniform', hair: 'ponytail' }),
    cg('rain_osana'),
    mono('c6.a20', '{osana}의 우산은 둘이 쓰기엔 작았다. 우산대는 내가 들었는데, {osana:가} 자꾸 그걸 슬그머니 내 쪽으로 밀었다.'),
    me('c6.a30', '너 어깨 젖는다. 내 쪽으로 밀지 마.'),
    say('c6.a40', 'osana', '…네가 감기 걸리면 아침에 기다리는 내가 곤란하거든.', 'shy'),
    goto('c6.join'),

    label('c6.b'),
    me('c6.b10', '{tenko}, 같은 방향이니까 내 우산 같이 쓰자.'),
    say('c6.b20', 'osana', '응. 그게 제일 합리적이네. 난 내 거 쓰면 되고.', 'neutral'),
    hide('all'),
    bg('road_rain'),
    bgm('heart'),
    show('osana', { pos: 'left', expr: 'neutral', outfit: 'uniform', hair: 'default' }),
    show('tenko', { pos: 'right', expr: 'neutral', outfit: 'uniform', hair: 'ponytail' }),
    cg('rain_tenko'),
    say('c6.b30', 'tenko', '{me} 군, 어깨 다 젖었어. 우산이 너무 내 쪽이야.', 'fluster'),
    me('c6.b40', '묶은 머리가 젖으면 말리기 번거로울 테니까. 나는 금방 말라.'),
    say('c6.b50', 'tenko', '그런 것까지 보고 있었어?', 'shy'),
    goto('c6.join'),

    // 셋이 함께: 비 오는 길로 나가지만 우산 CG 는 열지 않는다
    label('c6.c'),
    me('c6.c10', '갈림길까진 길 넓잖아. {osana:가} 왼쪽, 내가 오른쪽. {tenko:는} 가운데 서 봐.'),
    hide('all'),
    bg('road_rain'),
    bgm('daily'),
    show('osana', { pos: 'left', expr: 'neutral', outfit: 'uniform', hair: 'default' }),
    show('tenko', { pos: 'right', expr: 'smile', outfit: 'uniform', hair: 'ponytail' }),
    say('c6.c20', 'tenko', '우산이 이어진 긴 지붕이다. 잠깐, 내 머리.', 'fluster'),
    mono('c6.c30', '내가 우산을 손가락 두 마디쯤 들자 닿았던 머리끈이 쏙 빠졌다.'),
    say('c6.c40', 'osana', '{me}, 보도블록 한 칸만 천천히. 긴 지붕 반쪽이 혼자 가고 있거든.', 'neutral'),
    me('c6.c50', '이 속도?'),
    say('c6.c60', 'tenko', '응, 지금 셋이 딱 맞아. 비 그쳐도 이대로 좀 걷자.', 'smile'),

    label('c6.join'),
    cg(null),
    mono('c6.j10', '편의점 앞 갈림길에 닿을 즈음, 빗줄기가 조금 가늘어졌다.'),
    when(chose('c6.ch', 'b'), 'c6.jb'),
    when(chose('c6.ch', 'c'), 'c6.jc'),
    say('c6.j20', 'tenko', '우산은 내일 아침에 돌려줄게. {osana}짱이 챙겨 준 거잖아.', 'smile'),
    goto('c6.ask'),
    label('c6.jb'),
    mono('c6.j25', '집 앞까지 씌워 주겠다고 했지만, {tenko:는} 바로 저 골목이라며 웃었다.'),
    goto('c6.ask'),
    label('c6.jc'),
    say('c6.c70', 'tenko', '우리 집은 저기 흰 처마 뒤야. 저기까진 뛰어가도 돼.', 'smile'),
    label('c6.ask'),
    say('c6.j30', 'tenko', '있잖아, 내일도 같이 가도 돼?', 'smile'),
    me('c6.j40', '물론.'),
    mono('c6.j45', '첫날 이름을 물을 때처럼 {tenko:는} 늘 먼저 묻는다. 전학을 세 번 다니면 저런 친화력이 생기나 보다.'),
    say('c6.j50', 'osana', '…방향 같으면 어쩔 수 없지.', 'pout'),
    hide('tenko'),
    mono('c6.j60', '{tenko:가} 뛰어간 뒤로 {osana:는} 한참 말이 없었다. 비 오는 날의 {osana:는} 늘 조금 조용하다.'),
    jump('c7_friday'),
  ]),

  // ---------------------------------------------------------------------------
  // c7. 금요일 노을 교실 — 선택지 4, 해금 판정, (해금 시) 복도 첫 만남, 노을길
  // ---------------------------------------------------------------------------
  scene({ id: 'c7_friday', title: '금요일 노을', route: 'common', part: 'main' }, [
    hide('all'),
    bg('classroom_evening'),
    bgm('evening'),
    place('{d5} · 방과 후 교실'),
    show('osana', { pos: 'left', expr: 'neutral', outfit: 'uniform', hair: 'default' }),
    show('tenko', { pos: 'right', expr: 'smile', outfit: 'uniform', hair: 'default' }),
    mono('c7.010', '오늘 아침엔 갈림길에서 {tenko:가} 손을 흔들었다. {osana}의 전적 수첩엔 {tenko}의 칸도 생겼다.'),
    say('c7.020', 'tenko', '{me} 군, 주말에 카메라 들고 동네 돌아볼 건데 어디가 좋을까? 지도에 별표만 잔뜩 쳐 놨어.', 'smile'),
    sfx('message'),
    show('osana', { expr: 'sad' }),
    mono('c7.030', '대답하려는데 {osana}의 휴대폰이 울렸다. 화면을 본 얼굴이 굳는다. 귀찮은 공지를 볼 때와는 달랐다.'),
    choice('c7.ch', '신경 쓰이는 건…', [
      opt('a', '평소와 다른 {osana}의 표정', { heroine: 'osana', points: 3, goto: 'c7.a' }),
      opt('b', '{tenko}의 주말 탐험 계획', { heroine: 'tenko', points: 3, goto: 'c7.b' }),
      opt('c', '두 사람과 함께 칠판을 지우며 잠깐 더 남는다', { effects: together(), goto: 'c7.c' }),
    ]),

    label('c7.a'),
    me('c7.a10', '{osana}, 무슨 일 있어? 표정이 안 좋은데.'),
    say('c7.a20', 'osana', '어? 아, 아무것도 아니야. 그보다 너, 수학 숙제는 했어? 월요일까지잖아.', 'fluster'),
    mono('c7.a40', '아무것도 아닌 얼굴이 아니었다. 캐물으면 더 숨길 테니, 말해 줄 때까지 기다리기로 했다.'),
    say('c7.a50', 'tenko', '{osana}짱, 고민 있으면 나한테도 말해 줘. 듣는 건 자신 있어.', 'smile'),
    me('c7.a60', '{tenko}, 사진 찍기 좋은 데는 다음에 지도 펴 놓고 같이 고르자.'),
    goto('c7.join'),

    label('c7.b'),
    me('c7.b10', '사진이면 학교 뒤 언덕길 끝. 동네가 한눈에 보이고, 담장 위에서 고양이가 낮잠도 자.'),
    say('c7.b20', 'tenko', '반 애들이 고양이 박사라더니 진짜네. 별표 추가! 언젠가 안내해 줘.', 'smile'),
    say('c7.b30', 'osana', '그 언덕길, 여름엔 모기 엄청 많아. 갈 거면 모기약 챙겨.', 'neutral'),
    mono('c7.b40', '{osana:는} 휴대폰을 주머니에 넣었다. 그 뒤로는 평소와 다름없어 보였다.'),
    goto('c7.join'),

    // 셋이 함께: 문자 내용을 묻지 않고, 언덕길도 알려 주지 않는다
    label('c7.c'),
    me('c7.c10', '나 오늘 칠판 당번인데, 저 끝에 닿는 사람?'),
    say('c7.c20', 'tenko', '발꿈치 들면…… 안 닿네. 열심히 들었는데.', 'fluster'),
    say('c7.c30', 'osana', '너희 둘 다 지우개 긴 쪽을 위로 해 봐.', 'neutral'),
    mono('c7.c40', '나란히 남은 세 줄이 순서대로 지워졌다. {osana:는} 휴대폰을 뒤집어 책상에 놓았다.'),
    me('c7.c50', '이런, 다 지워 버렸다. {tenko}, 동네 지도 그릴 자리 필요했는데.'),
    say('c7.c60', 'tenko', '깨끗한 칠판 두고? 월요일에도 여기 있잖아.', 'smile'),
    say('c7.c70', 'osana', '응. 월요일에 보자, 둘 다.', 'smile'),

    label('c7.join'),
    sfx('bell'),
    // 종이 울린 직후, 노을길 전에 한 번만 판정한다(이미 판정한 저장은 그대로 둔다)
    unlock('koharu', ['osana', 'tenko'], 1, MET),
    when(not(isFlag(MET)), 'c7.road'),

    // ---- 7월 10일 금요일 · 돌아 나오는 모퉁이 (해금 전용, 이름표는 끝까지 익명) ----
    hide('all'),
    bg('hallway'),
    show('osana', { pos: 'left', expr: 'neutral', outfit: 'uniform', hair: 'default' }),
    show('tenko', { pos: 'right', expr: 'neutral', outfit: 'uniform', hair: 'default' }),
    mono('c7.m10', '우리 셋이 계단 쪽으로 꺾는데, 맞은편에서 걷던 여학생이 옆의 친구를 돌아봤다. 두 볼이 바람을 넣은 것처럼 동그래졌다.'),
    sayAs('c7.m20', 'koharu', '여학생', '아까 네 얼굴이 딱 이랬다니까. 이렇게, 음—'),
    cg('kh_meet'),
    mono('c7.m30', '콩. 앞을 안 보고 한 발 더 온 여학생의 어깨가 내 어깨에 닿았다.'),
    sayAs('c7.m40', 'koharu', '여학생', '앗. 죄송해요, 선배! 어디 안 부딪히셨어요?'),
    me('c7.m50', '방금 어깨에. 난 괜찮아. 너는?'),
    sayAs('c7.m60', 'koharu', '여학생', '저도요. 친구 얼굴 보여 주다가 앞을 못 봤어요.'),
    sayAs('c7.m70', 'kh_friend', '여학생의 친구', '저 진짜 그런 표정 안 했어요.'),
    say('c7.m80', 'tenko', '응. 어느 쪽 말이 맞는지는 우리 셋 다 평생 모르겠다.', 'smile'),
    say('c7.m90', 'osana', '그 와중에 그게 제일 억울했구나.', 'smile'),
    mono('c7.m95', '친구가 자기 볼을 만져 보자 여학생이 먼저 웃었다. 나도, 옆에 선 두 사람도 따라 웃었다.'),
    cg(null),

    // ---- 노을길 (모든 경로 합류) ----
    label('c7.road'),
    hide('all'),
    bg('road_evening'),
    show('osana', { pos: 'left', expr: 'neutral', outfit: 'uniform', hair: 'default' }),
    show('tenko', { pos: 'right', expr: 'smile', outfit: 'uniform', hair: 'default' }),
    say('c7.j20', 'tenko', '다음 주도 잘 부탁해, 두 사람.', 'smile'),
    say('c7.j30', 'osana', '새삼스럽게.', 'smile'),
    mono('c7.j40', '낯설던 일주일이 어느새 익숙해져 있었다. 다음 주도 이렇게 흘러갈 거라고, 그때는 의심하지 않았다.'),
    when(isFlag(MET), 'c7.met'),
    jump('e1_ice3'),
    label('c7.met'),
    jump('c8_raffle'),
  ]),

  // ---------------------------------------------------------------------------
  // c8r. 토요일 오전 상점가 문구점 앞 추첨대 — 해금 전용(금요일 첫 만남을 실제로 본 플레이)
  //   이름을 밝히기 전까지 이름표는 '여학생'. kh_draw 는 '참가상!' 발표부터 두 사람의 웃음까지.
  // ---------------------------------------------------------------------------
  scene({ id: 'c8_raffle', title: '요일표', route: 'common', part: 'main' }, [
    hide('all'),
    bg('shotengai', 'black'),
    bgm('daily'),
    place('{d6} 오전 · 상점가 문구점 앞'),
    // 원고 한 문단(치환 후 86자)을 대사창 권장 길이 74자 안으로 문장 경계에서 나눔(글자 그대로)
    mono('c8r.010', '토요일 오전, 문구점에서 샤프심과 노트를 샀다. 잔돈 밑에 추첨 보조권 두 장이 딸려 나왔다.'),
    mono('c8r.015', '가게 앞 추첨대에는 ‘다섯 장에 한 번’이라고 쓰여 있었다.'),
    sfx('footsteps'),
    show('koharu', { pos: 'center', expr: 'smile', outfit: 'casual', hair: 'default' }),
    sayAs('c8r.020', 'koharu', '여학생', '아, 복도 선배! 오늘은 앞 보고 왔어요.', 'smile'),
    me('c8r.030', '다행이다. 어깨는 오늘 쉬는 날이라.'),
    sayAs('c8r.040', 'koharu', '여학생', '그거 두 장이에요? 저 세 장 있어요.', 'neutral'),
    me('c8r.050', '합치면 딱 다섯 장이네. 한 번 같이 돌릴래?'),
    sayAs('c8r.060', 'koharu', '여학생', '네! 근데 우리 순서 오기 전에 한 가지 정해야 해요.', 'smile'),
    mono('c8r.070', '여학생이 일등 상품을 가리켰다. 앞바구니에 노란 리본을 단 자전거였다.'),
    sayAs('c8r.080', 'koharu', '여학생', '저거 뽑으면 선배는 무슨 요일에 타실래요?', 'neutral'),
    me('c8r.090', '벌써 주인처럼 묻네. 음, 화·목·토.'),
    sayAs('c8r.100', 'koharu', '여학생', '그럼 저는 월·수·금. 일요일은요?', 'smile'),
    me('c8r.110', '타고 싶은 사람이 먼저 말하기.'),
    sayAs('c8r.120', 'koharu', '여학생', '좋아요. 일요일이라고 연락해도 모르는 사람이라고 하시면 안 돼요. 전 1학년 {koharuFamily} {koharu:예요}.', 'smile'),
    me('c8r.130', '2학년 {meFamily} {me}. 화·목·토 담당이야.'),
    say('c8r.140', 'koharu', '잘 부탁해요, {meFamily} 선배.', 'smile'),
    say('c8r.150', 'raffle', '다섯 장 받았습니다. 한 분이 손잡이 잡고 한 바퀴요.'),
    me('c8r.160', '{koharuFamily:가} 돌려. 내가 받을게.'),
    mono('c8r.170', '달각. 흰 구슬 하나가 굴러 나와 내 손바닥에 얌전히 멈췄다.'),
    cg('kh_draw'),
    say('c8r.180', 'raffle', '참가상! 휴대용 휴지 한 팩입니다.'),
    say('c8r.190', 'koharu', '……선배. 이거 타고 학교 가기엔 좀 작아요.'),
    me('c8r.200', '앞바구니도 없네.'),
    mono('c8r.210', '누가 먼저였는지 모르겠다. 둘이 동시에 웃는 바람에 뒤에 줄 선 아저씨가 당첨된 줄 알고 박수를 쳤다.'),
    cg(null),
    show('koharu', { expr: 'smile' }),
    me('c8r.220', '오늘 내 몫은 박수로 받았어. 휴지는 {koharuFamily:가} 가져.'),
    say('c8r.230', 'koharu', '그럼 휴지도 요일제로 해요. 월요일까지는 제가 맡아 둘게요.', 'smile'),
    mono('c8r.240', '조그만 휴지 한 팩이 조그만 가방 안에 쏙 들어갔다.'),
    say('c8r.250', 'koharu', '선배, 번호 바꿀래요? 일요일에 진짜 말 걸면 어떡해요.', 'neutral'),
    me('c8r.260', '그럼 받지. 번호 찍어 줘.'),
    say('c8r.270', 'koharu', '‘{meFamily} 선배’. 저장했어요.', 'smile'),
    me('c8r.280', '난 ‘{koharuFamily}’. 이제 복도에서 만나면 이름 부를 수 있겠다.'),
    say('c8r.290', 'koharu', '네. 뒤돌아봐도 되는지는 먼저 확인할게요.', 'smile'),
    // 새 흐름: 추첨 뒤 빙수집 넷(후반 선택을 아직 하지 않은 구저장도 이쪽으로 온다)
    jump('e1_ice4'),
  ]),

  // ---------------------------------------------------------------------------
  // c8. 토요일 오후 빵집 차양 아래 — 후반 선택 ①(문자 중심, 사복 스프라이트 없음)
  // ---------------------------------------------------------------------------
  scene({ id: 'c8_bakery', title: '빵집 차양 아래', route: 'common', part: 'main' }, [
    hide('all'),
    bg('shotengai'),
    bgm('daily'),
    place('{d6} 오후 · 상점가 빵집 차양 아래'),
    mono('c8.010', '오후엔 빵 사러 옆 블록에 나갔다. 막 구운 빵이 나온 참이었다. 열 식힐 겸 차양 밑에 서서 휴대폰을 꺼냈다.'),
    mono('c8.020', '빵 봉지에 여름 한정 맛을 맞히는 퀴즈가 있다. 맞혀도 상품은 없고, 정답은 봉지 밑바닥. 이걸 혼자 보면 또 밑부터 열 텐데.'),
    choice('c8.ch', undefined, [
      opt('a', '{osana}에게 힌트를 하나 달라고 한다', { heroine: 'osana', points: 3, goto: 'c8.a' }),
      opt('b', '힌트를 찍어서 {tenko}에게 퀴즈를 낸다', { heroine: 'tenko', points: 3, goto: 'c8.b' }),
      opt('k', '{koharuFamily}에게 상품 없는 퀴즈를 보낸다', { heroine: 'koharu', points: 3, goto: 'c8.k', visibleIf: isFlag(MET) }),
      opt('c', '단체 대화방에 같은 문제를 낸다', { effects: together(), goto: 'c8.c', visibleIf: not(isFlag(MET)) }),
    ]),

    label('c8.a'),
    sfx('message'),
    sayAs('c8.a10', 'me', '{me} · 문자', '여름 한정 크림. ‘노랗고 차갑다.’ 넌 뭔지 알겠어?'),
    sayAs('c8.a20', 'osana', '{osana} · 문자', '옥수수.'),
    sayAs('c8.a30', 'me', '{me} · 문자', '왜 그렇게 단호해.'),
    sayAs('c8.a40', 'osana', '{osana} · 문자', '우리 엄마도 하나 사 왔어. 난 먹어 보고도 틀렸으니까 너한테는 기회를 주는 거야.'),
    mono('c8.a50', '빵 가운데 씨눈 같은 게 씹혔다. 다음 한 입은 그걸 찾느라 조금 더 천천히 먹었다.'),
    goto('c8.join'),

    label('c8.b'),
    sfx('message'),
    sayAs('c8.b10', 'tenko', '{tenko} · 문자', '노랗고 차갑다? 파인애플. 내가 좋아하니까!'),
    sayAs('c8.b20', 'me', '{me} · 문자', '옥수수래. 근데 파인애플이었으면 나도 사 먹었을 것 같아.'),
    sayAs('c8.b30', 'tenko', '{tenko} · 문자', '좋아. 다음에 그 빵집에서 같은 말 하자. 둘이 말하면 진짜 만들어 줄지도 몰라.'),
    mono('c8.b40', '다음엔 빵 하나를 살 때도 메뉴판을 유심히 보게 될 것 같았다.'),
    goto('c8.join'),

    label('c8.k'),
    sfx('message'),
    sayAs('c8.k10', 'me', '{me} · 문자', '이번엔 상품 없어. 그래도 할래? ‘노랗고 차가운 크림.’'),
    sayAs('c8.k20', 'koharu', '{koharu} · 문자', '옥수수요! 저 아침에 그거 먹었거든요. 정답을 알고 참가했는데 실격이에요?'),
    sayAs('c8.k30', 'me', '{me} · 문자', '실격. 상품은 없어.'),
    sayAs('c8.k40', 'koharu', '{koharu} · 문자', '상품이 똑같네. 선배, 다음 문제도 보내 주세요. 이번엔 아는 척 안 할게요.'),
    goto('c8.join'),

    label('c8.c'),
    sfx('message'),
    sayAs('c8.c10', 'tenko', '{tenko} · 문자', '레몬! 아, 파인애플! 대답 두 번 하면 안 돼?'),
    sayAs('c8.c20', 'osana', '{osana} · 문자', '먼저 말한 걸로 해. 난 옥수수.'),
    sayAs('c8.c30', 'me', '{me} · 문자', '정답. {osana}한테 상품 없는 우승을 드립니다.'),
    sayAs('c8.c40', 'osana', '{osana} · 문자', '그럼 반 나눠서 {tenko} 줘.'),
    sayAs('c8.c50', 'tenko', '{tenko} · 문자', '없던 상품 반 개 획득!'),

    label('c8.join'),
    jump('c9_puzzle'),
  ]),

  // ---------------------------------------------------------------------------
  // c9. 일요일 낮 집 식탁 — 후반 선택 ②(문자 중심). 집 안 배경이 없어 암전 위에 문자를 띄운다
  // ---------------------------------------------------------------------------
  scene({ id: 'c9_puzzle', title: '거꾸로 된 낱말', route: 'common', part: 'main' }, [
    hide('all'),
    bg('black', 'black'),
    bgm('daily'),
    place('{d7} 점심 · 집'),
    // 원고는 한 줄이지만 치환 후 93자로 검사 한도(88자)를 넘어 문장 경계에서 두 줄로 나눈다(글자는 그대로)
    mono('c9.010', '일요일 점심엔 선풍기가 식탁 위 신문을 한 장씩 넘겼다. 낱말풀이 마지막 세 칸만 비어 있었다.'),
    mono('c9.020', '‘더우면 펴고, 바람 불면 접는다.’ 생각나는 사람한테 단서를 보냈다.'),
    choice('c9.ch', undefined, [
      opt('a', '{osana}에게 다 풀면 뭐가 좋은지 묻는다', { heroine: 'osana', points: 3, goto: 'c9.a' }),
      opt('b', '{tenko}에게 마음에 드는 답을 부탁한다', { heroine: 'tenko', points: 3, goto: 'c9.b' }),
      opt('k', '{koharuFamily}에게 한 칸씩 번갈아 풀자고 한다', { heroine: 'koharu', points: 3, goto: 'c9.k', visibleIf: isFlag(MET) }),
      opt('c', '셋이 한 글자씩 이어 붙인다', { effects: together(), goto: 'c9.c', visibleIf: not(isFlag(MET)) }),
    ]),

    label('c9.a'),
    sfx('message'),
    sayAs('c9.a10', 'osana', '{osana} · 문자', '다 풀면 뒷면 답을 떳떳하게 볼 수 있어.'),
    sayAs('c9.a20', 'me', '{me} · 문자', '그것뿐이야?'),
    sayAs('c9.a30', 'osana', '{osana} · 문자', '응. 대신 틀린 칸 하나만 있어도 일요일 종일 신경 쓰여. 사진 보내 봐.'),
    mono('c9.a40', '답보다 먼저 곳곳에 동그라미가 쳐진 사진이 돌아왔다. 빈칸 옆에 ‘여기 네 글씨 좀 사람답게’라고 쓰여 있었다.'),
    goto('c9.join'),

    label('c9.b'),
    sfx('message'),
    sayAs('c9.b10', 'tenko', '{tenko} · 문자', '‘부채꽃’. 지금 만든 꽃 이름이야. 더우면 활짝 피고 바람 불면 쉰다.'),
    sayAs('c9.b20', 'me', '{me} · 문자', '칸 수까지 맞네.'),
    sayAs('c9.b30', 'tenko', '{tenko} · 문자', '맞혔어?'),
    sayAs('c9.b40', 'me', '{me} · 문자', '아니. 근데 이건 지우기 아깝다.'),
    mono('c9.b50', '정답란엔 연필로, 부채꽃은 옆에 볼펜으로 적었다.'),
    goto('c9.join'),

    label('c9.k'),
    sfx('message'),
    sayAs('c9.k10', 'koharu', '{koharu} · 문자', '첫 글자 ‘양’. 선배 차례예요.'),
    sayAs('c9.k20', 'me', '{me} · 문자', '‘산’. 벌써 양산인데 한 칸 남았어.'),
    sayAs('c9.k30', 'koharu', '{koharu} · 문자', '‘들’. 양산들.'),
    sayAs('c9.k40', 'me', '{me} · 문자', '하나로도 더운데 여러 개나?'),
    sayAs('c9.k50', 'koharu', '{koharu} · 문자', '그럼 ‘끝’이라고 쓰죠. 양산, 끝! 선배랑 하니까 칸이 남아도 재밌네요.'),
    goto('c9.join'),

    label('c9.c'),
    sfx('message'),
    sayAs('c9.c10', 'osana', '{osana} · 문자', '차.'),
    sayAs('c9.c20', 'tenko', '{tenko} · 문자', '양.'),
    sayAs('c9.c30', 'me', '{me} · 문자', '막. ……차양막? 우리 정말 맞힌 것 같은데.'),
    sayAs('c9.c40', 'tenko', '{tenko} · 문자', '그럼 앞으로 숙제도 한 글자씩 하자.'),
    sayAs('c9.c50', 'osana', '{osana} · 문자', '이름 쓰다 끝나겠다.'),

    label('c9.join'),
    mono('c9.j10', '선풍기를 한 칸 약하게 했다. 신문이 그제야 가만있었다.'),
    // 해금(MET)인 채로 c9 에 오는 것은 구저장뿐이다 → 옛 c10. 미발견 새 흐름은 종이개구리 셋을 거쳐 c10 으로
    when(isFlag(MET), 'c9.old'),
    jump('e2_frog3'),
    label('c9.old'),
    jump('c10_window'),
  ]),

  // ---------------------------------------------------------------------------
  // c10. 월요일 점심 복도 끝 창가 — 후반 선택 ③, 수업 뒤 루트 결정
  // ---------------------------------------------------------------------------
  scene({ id: 'c10_window', title: '종 치기 오 분 전', route: 'common', part: 'main' }, [
    hide('all'),
    bg('hallway', 'black'),
    bgm('daily'),
    place('{r1} 점심 · 복도 끝 창가'),
    show('osana', { pos: 'left', expr: 'neutral', outfit: 'uniform', hair: 'default' }),
    show('tenko', { pos: 'right', expr: 'smile', outfit: 'uniform', hair: 'default' }),
    mono('c10.010', '점심 먹은 그릇을 치우고 보니 오 분 남았다. 복도 끝 열린 창으로 바람이 들어왔다.'),
    say('c10.020', 'osana', '저기 창가, 지금만 햇빛 안 들어.', 'neutral'),
    say('c10.030', 'tenko', '그러네. 난 저기 끝까지 그늘 밟고 갈 수 있을 것 같아.', 'smile'),
    when(not(isFlag(MET)), 'c10.ask'),
    mono('c10.040', '1학년 교실로 돌아가던 {koharuFamily:가} 창 너머로 손을 들어 보였다.'),
    label('c10.ask'),
    choice('c10.ch', undefined, [
      opt('a', '{osana} 옆에서 잠깐 바람을 쐰다', { heroine: 'osana', points: 3, goto: 'c10.a' }),
      opt('b', '{tenko:가} 짚은 그늘로 건너간다', { heroine: 'tenko', points: 3, goto: 'c10.b' }),
      opt('k', '창 너머의 {koharuFamily} 쪽으로 간다', { heroine: 'koharu', points: 3, goto: 'c10.k', visibleIf: isFlag(MET) }),
      opt('c', '창가에 세 사람이 설 자리를 만든다', { effects: together(), goto: 'c10.c', visibleIf: not(isFlag(MET)) }),
    ]),

    label('c10.a'),
    me('c10.a10', '말없이 바람만 쐬는 거 오랜만이다.'),
    say('c10.a20', 'osana', '그러게. 너 지금 두 마디째야.', 'smile'),
    me('c10.a30', '첫마디는 뭔데?'),
    say('c10.a40', 'osana', '아까 ‘후아’ 한 거.', 'smile'),
    mono('c10.a50', '세 번째는 안 했다. 옆에서 {osana:가} 먼저 작게 웃었다.'),
    goto('c10.join'),

    label('c10.b'),
    say('c10.b10', 'tenko', '창틀 그림자가 섬이고 여긴 바다야. {me} 군, 이미 한 발 빠졌어.', 'smile'),
    me('c10.b20', '그럼 나 여기서 뭐 먹고 살아?'),
    say('c10.b30', 'tenko', '아, 그걸 생각 못 했네. 구조선 갑니다.', 'smile'),
    mono('c10.b40', '{tenko:가} 실내화 끝을 내 쪽으로 내밀었다. 겨우 신발코 하나 건너가고 둘 다 종 칠 때까지 웃었다.'),
    goto('c10.join'),

    // 해금 전용: 다른 둘을 내리고 교복 코하루를 가운데에
    label('c10.k'),
    hide('all'),
    show('koharu', { pos: 'center', expr: 'smile', outfit: 'uniform', hair: 'default' }),
    say('c10.k10', 'koharu', '선배, 저 저쪽 창에서도 한 번 인사했는데.', 'pout'),
    me('c10.k20', '못 봤어. 덜 억울하게 지금 두 번 해도 돼.'),
    show('koharu', { expr: 'neutral' }),
    mono('c10.k30', '{koharuFamily:가} 아주 점잖게 고개를 두 번 숙였다. 나도 두 번 숙였다.'),
    say('c10.k40', 'koharu', '이럴 줄 알았으면 세 번 했다고 할걸.', 'smile'),
    me('c10.k50', '내일까지 그렇게 서 있게? 이제 교실 가.'),
    mono('c10.k60', '복도 끝에서 작게 세 번째 인사가 날아왔다. 이번엔 나도 놓치지 않았다.'),
    goto('c10.join'),

    label('c10.c'),
    me('c10.c10', '저쪽 한 칸 더 열면 우리 셋 다 그늘이겠다.'),
    say('c10.c20', 'tenko', '진짜네. 근데 이러면 햇빛 안 드는 자리랑 바람 잘 부는 자리가 다른데?', 'neutral'),
    say('c10.c30', 'osana', '그럼 바람 한 번 불 때마다 교대.', 'smile'),
    mono('c10.c40', '종 치기 전까지 딱 두 번 불었다. 셋 다 한 번씩 좋은 자리에 섰다.'),

    label('c10.join'),
    hide('all'),
    bg('classroom_day'),
    sfx('bell'),
    mono('c10.j10', '오후 수업이 끝나고 의자 끄는 소리가 교실을 채웠다.'),
    // 미발견 새 흐름은 처마 셋(e3_rain3) 끝에서 판정한다
    when(not(isFlag(MET)), 'c10.ep3'),
    // 구저장 발견 경로 전용(옛 규칙, tieRoute 없음): 최고점 → 동점이면 공동 최고점 중 가장 최근 개인 선택.
    // 결과 안내 없이 해당 루트 첫 장면으로 컷
    decideRoute(ROUTE_CHOICES, { koharu: MET }),
    routeBranch({ osana: 'o1_shop', tenko: 't1_cats', koharu: 'k1' }),
    label('c10.ep3'),
    jump('e3_rain3'),
  ]),
];
