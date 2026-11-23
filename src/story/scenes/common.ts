/**
 * 공통 루트 (c1~c7) — 1주 차 월요일~금요일
 *
 * 선택지 4회(c3.ch, c4.ch, c6.ch, c7.ch). 옵션 a = 소꿉친구(+1), b = 전학생(+1).
 * 각 선택 직후 짧은 반응 분기 → label 로 합류. c7 마지막에 루트 결정.
 * 히나 헤어: c5·c6(체육 있는 날)만 포니테일, 나머지는 기본(긴 웨이브).
 * 주인공의 착각: 소꿉친구의 배려는 '습관'(c1.110·c6.030), 전학생의 직진은 '친화력'(c6.j45)으로 받아들인다.
 */
import type { Scene } from '../../engine/types';
import {
  bg,
  bgm,
  card,
  choice,
  chose,
  decideRoute,
  goto,
  hide,
  jump,
  label,
  me,
  mono,
  opt,
  place,
  routeBranch,
  say,
  scene,
  sfx,
  show,
  when,
} from '../../engine/dsl';

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
    mono('c3.020', '{tenkoFamily:는} 웃으며 받아 넘겼다. 그런데 말이 끊길 때마다 짧게 숨을 고른다. 조금 지친 거다.'),
    show('osana', { pos: 'left', expr: 'neutral', outfit: 'uniform', hair: 'default' }),
    say('c3.030', 'osana', '{me}, 다음 시간 음악실이잖아. {tenkoFamily:는} 별관 가는 길 모를 텐데.', 'neutral'),
    choice('c3.ch', '쉬는 시간은 10분. 누구에게 먼저 말을 걸까?', [
      opt('a', '뒤돌아본 {osana}에게 먼저 대답한다', { heroine: 'osana', goto: 'c3.a' }),
      opt('b', '둘러싸인 {tenkoFamily}에게 먼저 다가간다', { heroine: 'tenko', goto: 'c3.b' }),
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
    show('tenko', { expr: 'smile' }),
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
      opt('a', '{osana:와} 다니던 막과자 가게를 추천한다', { heroine: 'osana', goto: 'c4.a' }),
      opt('b', '추천보다 먼저 {tenko}의 취향을 묻는다', { heroine: 'tenko', goto: 'c4.b' }),
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

    label('c4.join'),
    mono('c4.j10', '{tenko:는} 손바닥만 한 수첩을 꺼내 무언가를 적었다. 칸마다 글씨가 빽빽했다.'),
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
    mono('c5.030', '첫 판도, 둘째 판도, 셋째 판도 {tenko} 혼자 이겼다. {osana:는} 수첩을 든 채 굳었다.'),
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
      opt('a', '{tenko}에게 우산을 빌려주고 {osana}의 우산에 들어간다', { heroine: 'osana', goto: 'c6.a' }),
      opt('b', '같은 방향인 {tenko}에게 같이 쓰자고 한다', { heroine: 'tenko', goto: 'c6.b' }),
    ]),

    label('c6.a'),
    me('c6.a10', '{tenko}, 이거 써. 나는 {osana} 우산에 들어가면 돼.'),
    hide('all'),
    bg('road_rain'),
    bgm('heart'),
    show('osana', { pos: 'left', expr: 'neutral', outfit: 'uniform', hair: 'default' }),
    show('tenko', { pos: 'right', expr: 'smile', outfit: 'uniform', hair: 'ponytail' }),
    mono('c6.a20', '{osana}의 우산은 둘이 쓰기엔 작았다. 걸을수록 우산이 슬그머니 내 쪽으로 기울었다.'),
    me('c6.a30', '너 어깨 젖는다. 내 쪽으로 기울이지 마.'),
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
    say('c6.b30', 'tenko', '{me} 군, 어깨 다 젖었어. 우산이 너무 내 쪽이야.', 'fluster'),
    me('c6.b40', '묶은 머리가 젖으면 말리기 번거로울 테니까. 나는 금방 말라.'),
    say('c6.b50', 'tenko', '그런 것까지 보고 있었어?', 'shy'),

    label('c6.join'),
    mono('c6.j10', '편의점 앞 갈림길에 닿을 즈음, 빗줄기가 조금 가늘어졌다.'),
    when(chose('c6.ch', 'b'), 'c6.jb'),
    say('c6.j20', 'tenko', '우산은 내일 아침에 돌려줄게. {osana}짱이 챙겨 준 거잖아.', 'smile'),
    goto('c6.ask'),
    label('c6.jb'),
    mono('c6.j25', '집 앞까지 씌워 주겠다고 했지만, {tenko:는} 바로 저 골목이라며 웃었다.'),
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
  // c7. 금요일 노을 교실 — 선택지 4, 루트 결정
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
      opt('a', '평소와 다른 {osana}의 표정', { heroine: 'osana', goto: 'c7.a' }),
      opt('b', '{tenko}의 주말 탐험 계획', { heroine: 'tenko', goto: 'c7.b' }),
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

    label('c7.join'),
    sfx('bell'),
    hide('all'),
    bg('road_evening'),
    show('osana', { pos: 'left', expr: 'neutral', outfit: 'uniform', hair: 'default' }),
    show('tenko', { pos: 'right', expr: 'smile', outfit: 'uniform', hair: 'default' }),
    say('c7.j20', 'tenko', '다음 주도 잘 부탁해, 두 사람.', 'smile'),
    say('c7.j30', 'osana', '새삼스럽게.', 'smile'),
    mono('c7.j40', '낯설던 일주일이 어느새 익숙해져 있었다. 다음 주도 이렇게 흘러갈 거라고, 그때는 의심하지 않았다.'),
    decideRoute(),
    routeBranch({ osana: 'o1_shop', tenko: 't1_cats' }),
  ]),
];
