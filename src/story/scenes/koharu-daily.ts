/**
 * 코하루 루트 일상 쪽 결말 「옆자리는 비워 둘게요」 — kd1~kd4 (route koharu / part epilogue)
 *
 * 진입: k4 끝 결말 갈래 선택 k4.fork 의 d → k4.d 문자(금 7/17 신발장) → kd1. 갈래 선택·k4.d 줄은 edits.md (1).
 * 흐름(1학기 마지막 주, 점심이 있는 날은 월~목. 7/24 금은 종업식이라 점심 없음):
 *  - kd1 {n1} 월 점심, 1학년 교실: 동전 마술이 미끄러지고, 책상 밑에서 소우타가 몰래 받아 쥐여 준다 → "내일부터 조수"
 *  - kd2 {n2} 화 점심: 2학년 3반에서 아카네·히나가 한마디 → 1학년 교실, 옆 의자에 필통이 앉아 있다(조수 자리, 종업식까지 빌림)
 *         마지막에 코하루가 소우타 쪽을 먼저 보는 버릇 — 소우타는 '조수가 손을 펴고 있나 확인하는 것'으로 착각
 *  - kd3 {n3} 수 점심: 친구가 귀띔한다. 그 눈길은 선배 쪽에만 간다(아침엔 빈 의자를 본다). 조수가 끝나면 앉을 핑계도 끝난다
 *  - kd4 {n4} 목 점심: 혼자서 성공 → 반 아이들은 5교시 음악실로 → 빈 교실에서 필통을 든 채 의자를 당겨 준다(end_koharu_coin)
 *         → 소우타가 먼저 고백(‘조수라서’를 뺀다, k4.120 되부름) → 분명한 대답 → 허락 뒤 첫 {koharu} → 첫 '{me} 선배'
 *         → "내일도 같이 갈래?" → "옆자리는 비워 둘게요" → 엔딩 koharu_daily
 * 호칭: 고백 장면(kd4.260) 전까지 소우타의 말·독백은 {koharuFamily}('그 애'), 그 뒤로 {koharu}.
 *       코하루는 대답(kd4.210) 뒤 kd4.280 에서 처음 '{me} 선배'. 축제 갈래(k6)와 섞이지 않는다.
 * 스프라이트: 코하루 교복은 손 인사 자세라 동전·필통을 다루는 동안은 hide 하고 서술로, 들고 있는 순간은 CG 로만 쓴다.
 * 조연: 친구(kh_friend, 이름표 '{koharu}의 친구'), 1학년 아이들(classmates). 아카네·히나는 kd2 첫머리에만(교복, 화요일 기본 헤어).
 * 새 흐름(처마 장면을 지난 플레이, ep3.done)과 구저장 흐름은 아카네·히나가 코하루를 아는 정도가 달라 두 군데만 갈라 쓴다.
 */
import type { Scene } from '../../engine/types';
import { bg, bgm, cg, ending, goto, hide, isFlag, jump, label, me, mono, not, place, say, sayAs, scene, sfx, show, when } from '../../engine/dsl';
import { EP3_DONE } from './common';

/** 1학년 교실 조연 이름표 */
const FRIEND = '{koharu}의 친구';
const FIRST_YEARS = '1학년 아이들';

export const KOHARU_DAILY_SCENES: Scene[] = [
  // ---------------------------------------------------------------------------
  // kd1 — {n1} 점심, 1학년 교실. 책상 두 개를 붙인 자리(k2.070 의 그 책상). 동전이 미끄러진다
  // ---------------------------------------------------------------------------
  scene({ id: 'kd1', title: '책상 밑의 동전', route: 'koharu', part: 'epilogue' }, [
    hide('all'),
    bg('classroom_day', 'black'),
    bgm('daily'),
    place('{n1} 점심 · 1학년 교실'),
    mono('kd1.050', '빵 봉지를 들고 1학년 교실 앞에 섰다. 2학년이 하나 끼었을 뿐인데 복도 소리가 반으로 줄었다.'),
    sfx('footsteps'),
    show('koharu', { pos: 'center', expr: 'smile', outfit: 'uniform', hair: 'default' }),
    say('kd1.060', 'koharu', '선배, 여기요! 복도에서 그냥 돌아가실까 봐 창문으로 내다보고 있었어요.'),
    me('kd1.070', '빵까지 사 왔는데 돌아가긴 아깝지.'),
    mono('kd1.080', '창가 쪽에 책상 두 개가 붙어 있었다. 지난주에 딸기우유를 엎었다던 바로 그 책상이었다.'),
    say('kd1.090', 'koharu', '세 번 닦았어요. 그래도 혹시 모르니까 선배는 이쪽 모서리요.', 'neutral'),
    sayAs('kd1.100', 'kh_friend', FRIEND, '안녕하세요. 얘 4교시 끝나기도 전부터 창문에 붙어 있었어요.'),
    say('kd1.110', 'koharu', '4교시 땐 아니었어! 종 치고 나서부터야.', 'fluster'),
    mono('kd1.120', '빵을 반쯤 먹었을 때 {koharuFamily:가} 책상 위를 싹 치웠다. 옆 책상 애들까지 의자를 끌고 모여들었다.'),
    say('kd1.130', 'koharu', '선배, 관객 해 주세요. 요즘 연습하는 게 있어요.', 'smile'),
    // 문구점 계산대의 동전(k3.220~230)을 본 흐름만. 897ae1f 저장이 k3 뒷부분·k4 에 있었으면 그 두 줄을 못 봤다(kh.coin)
    when(not(isFlag('kh.coin')), 'kd1.nc'),
    me('kd1.140', '문구점 계산대에서 굴리던 그거?'),
    say('kd1.150', 'koharu', '그건 못 본 걸로 하기로 했잖아요!', 'pout'),
    label('kd1.nc'),
    say('kd1.155', 'koharu', '망설이다 그냥 가는 꼬마들, 이걸로 웃겨서 붙잡을 거예요.', 'smile'),
    // 마술 동안은 손과 책상만 보이는 컷: 스프라이트를 내리고 서술로
    hide('koharu'),
    when(isFlag(EP3_DONE), 'kd1.case4'),
    mono('kd1.160', '책상 끝에 연보라 꽃무늬 필통이 놓였다. {koharuFamily:가} 지퍼를 끝까지 잠그고 은색 동전 하나를 손바닥에 올렸다.'),
    goto('kd1.trick'),
    label('kd1.case4'),
    mono('kd1.170', '개구리 대회 날 우리 반 책상 끝에 있던 연보라 꽃무늬 필통이었다. 지퍼를 잠근 {koharuFamily:가} 손바닥에 은색 동전을 올렸다.'),
    label('kd1.trick'),
    mono('kd1.180', '주먹을 쥐었다 펴자 동전이 없었다. 다들 숨을 들이켰다. 그런데 내 자리에서는 보였다.'),
    mono('kd1.190', '손등 쪽에 숨겨 둔 동전이 미끄러져 책상 모서리를 넘어가는 게. 생각보다 손이 먼저 나갔다.'),
    mono('kd1.200', '바닥에 닿기 전에 책상 밑에서 받았다. 아무 소리도 나지 않았다.'),
    mono('kd1.210', '{koharuFamily:가} 굳은 얼굴로 나를 봤다. 책상 밑으로 내려온 그 애 손에 동전을 쥐여 줬다.'),
    mono('kd1.220', '지퍼를 여는 손끝이 한 번 필통 안에 들어갔다 나왔다. 필통을 기울이자 바닥에서 동전이 굴렀다.'),
    sayAs('kd1.230', 'classmates', FIRST_YEARS, '뭐야, 언제 들어갔어? 한 번 더!'),
    show('koharu', { pos: 'center', expr: 'smile', outfit: 'uniform', hair: 'default' }),
    say('kd1.240', 'koharu', '한 번 더는 없어. 마술사는 원래 그래.', 'smile'),
    mono('kd1.250', '박수가 흩어지고 나서야 {koharuFamily:가} 내 쪽으로 몸을 기울였다.'),
    say('kd1.260', 'koharu', '선배, 아까 책상 밑에서 손 엄청 빨랐어요.', 'shy'),
    me('kd1.270', '받는 건 원래 내 담당이잖아. 추첨 때 구슬도 내가 받았고.'),
    say('kd1.280', 'koharu', '……그러고 보니 그날도 선배가 받았네요.', 'shy'),
    say('kd1.290', 'koharu', '그럼 내일부터 선배는 제 조수예요. 떨어지는 거 받는 담당.', 'smile'),
    me('kd1.300', '조수 수당은?'),
    say('kd1.310', 'koharu', '생각해 볼게요. 비싼 건 안 돼요.', 'smile'),
    hide('koharu'),
    mono('kd1.320', '교실로 돌아가는 길, 손바닥에 동전 자국이 동그랗게 남아 있었다. 내일 또 갈 핑계가 하나 생겼다.'),
    jump('kd2'),
  ]),

  // ---------------------------------------------------------------------------
  // kd2 — {n2} 점심. 2학년 3반(아카네·히나, 화요일이라 히나 기본 헤어) → 1학년 교실, 조수 자리
  // ---------------------------------------------------------------------------
  scene({ id: 'kd2', title: '조수 자리', route: 'koharu', part: 'epilogue' }, [
    hide('all'),
    bg('classroom_day', 'black'),
    bgm('daily'),
    place('{n2} 점심 · {classroom}'),
    sfx('bell'),
    show('osana', { pos: 'left', expr: 'neutral', outfit: 'uniform', hair: 'default' }),
    show('tenko', { pos: 'right', expr: 'smile', outfit: 'uniform', hair: 'default' }),
    mono('kd2.010', '4교시 끝 종이 울리자마자 빵 봉지를 챙겼다. 앞자리 {osana:가} 의자째 돌아앉았다.'),
    say('kd2.020', 'osana', '오늘도 가? 어제 빵 들고 1학년 복도로 가는 2학년, 너 하나였거든.', 'neutral'),
    // 아카네·히나가 코하루를 얼마나 아는지는 흐름마다 다르다(새 흐름: 빙수집·종이개구리·처마를 함께 지남)
    when(isFlag(EP3_DONE), 'kd2.ep3'),
    say('kd2.030', 'tenko', '있잖아, 전에 복도에서 부딪힌 그 1학년이지? 볼 얘기는 누구 말이 맞았는지 물어봐 줘.', 'smile'),
    goto('kd2.go'),
    label('kd2.ep3'),
    say('kd2.040', 'tenko', '있잖아, {koharu}짱한테 전해 줘. 개구리 대회 2회전은 2학기에 하자고. 심판은 또 내가 할게.', 'smile'),
    say('kd2.050', 'osana', '딱 한 판만이야. 이번엔 진짜로.', 'smile'),
    label('kd2.go'),
    me('kd2.060', '전할게. 먼저 간다. 조수가 늦으면 안 된대서.'),
    say('kd2.070', 'tenko', '에? 조수?', 'neutral'),
    hide('all'),
    mono('kd2.080', '문을 닫는데 안에서 속삭이는 소리가 들렸다. “{osana}짱, 방금 얼굴 봤어?” “어제부터 저래.”'),

    bg('classroom_day'),
    place('1학년 교실'),
    mono('kd2.090', '1학년 교실에 들어서자 {koharuFamily} 옆 의자부터 눈에 들어왔다. 연보라 필통이 의자 위에 얌전히 앉아 있었다.'),
    sayAs('kd2.100', 'kh_friend', FRIEND, '아침부터 저기 아무도 못 앉게 했어요. 조수 자리라고요.'),
    sayAs('kd2.110', 'kh_friend', FRIEND, '원래 주인한테는 딸기우유 하나 주고 종업식까지 빌렸대요.'),
    show('koharu', { pos: 'center', expr: 'smile', outfit: 'uniform', hair: 'default' }),
    say('kd2.120', 'koharu', '화요일은 선배 요일이잖아요. 요일제는 지켜야죠.', 'smile'),
    me('kd2.130', '그거 자전거 얘기 아니었어?'),
    say('kd2.140', 'koharu', '자전거는 꽝 났으니까 의자로 해요.', 'smile'),
    mono('kd2.150', '말해 놓고 {koharuFamily:가} 먼저 어깨를 들썩였다. 필통을 책상에 올리고 앉으니, 책상 밑으로 손 뻗기 딱 좋은 거리였다.'),
    when(not(isFlag(EP3_DONE)), 'kd2.trick'),
    me('kd2.160', '참, {tenko:가} 개구리 대회 2회전은 2학기에 하재. 심판은 또 자기가 본대.'),
    say('kd2.170', 'koharu', '좋아요! 그럼 {osana} 선배 손가락 골대도 미리 예약해 둬야겠다.', 'smile'),
    label('kd2.trick'),
    hide('koharu'),
    mono('kd2.180', '오늘도 동전은 손바닥에서 깨끗이 사라졌다. 지퍼에 손이 가기 직전, {koharuFamily:가} 내 쪽을 힐끗 봤다.'),
    mono('kd2.190', '그 순간 또 미끄러졌다. 이번엔 펴 두었던 내 손바닥으로 곧장 떨어졌다. 책상 밑으로 돌려주자 지퍼가 열렸다.'),
    sayAs('kd2.200', 'classmates', FIRST_YEARS, '어제보다 빨라졌다!'),
    show('koharu', { pos: 'center', expr: 'smile', outfit: 'uniform', hair: 'default' }),
    mono('kd2.210', '박수 속에서 생각했다. 마지막에 나를 보는 건, 조수가 손을 펴고 있나 확인하는 거겠지.'),
    jump('kd3'),
  ]),

  // ---------------------------------------------------------------------------
  // kd3 — {n3} 점심, 1학년 교실. 코하루가 매점에 간 사이 친구가 귀띔한다(c7.m70 '그런 표정' 되부름, c8r.290 되부름)
  // ---------------------------------------------------------------------------
  scene({ id: 'kd3', title: '마지막에 보는 쪽', route: 'koharu', part: 'epilogue' }, [
    hide('all'),
    bg('classroom_day', 'black'),
    bgm('daily'),
    place('{n3} 점심 · 1학년 교실'),
    mono('kd3.010', '수요일은 {koharuFamily}의 요일인데도 조수 자리엔 필통이 앉아 있었다. 주인은 매점에 갔다고 했다.'),
    sayAs('kd3.020', 'kh_friend', FRIEND, '선배, 잠깐요. 이건 걔 없을 때 말해야 돼서요.'),
    sayAs('kd3.030', 'kh_friend', FRIEND, '걔 원래 아무한테나 마술 보여 줘요. 버스 정류장에서 처음 본 꼬마한테도요.'),
    sayAs('kd3.040', 'kh_friend', FRIEND, '근데 마지막에 돌아보는 건 선배 쪽뿐이에요. 아침에 우리끼리 할 때는 저 빈 의자를 봐요.'),
    me('kd3.050', '……조수가 손 펴고 있나 확인하는 거 아니야?'),
    sayAs('kd3.060', 'kh_friend', FRIEND, '제가 그런 표정 안 했다고 할 때도 아무도 안 믿어 줬잖아요. 이번엔 믿어 주세요.'),
    mono('kd3.070', '추첨하던 날 들은 말이 생각났다. 뒤돌아봐도 되는지는 먼저 확인하겠다던 말.'),
    sfx('footsteps'),
    show('koharu', { pos: 'center', expr: 'smile', outfit: 'uniform', hair: 'default' }),
    say('kd3.080', 'koharu', '딸기우유 두 개요! 하나는 조수 수당이에요.', 'smile'),
    me('kd3.090', '나 생각보다 싸게 고용됐네.'),
    say('kd3.100', 'koharu', '빨대는 제가 꽂아 드릴게요. 그건 특별 수당.', 'smile'),
    mono('kd3.110', '빨대 꽂힌 우유를 받아 들다가 알았다. 조수 노릇이 끝나는 날엔, 저 의자에 앉을 핑계도 같이 끝난다.'),
    jump('kd4'),
  ]),

  // ---------------------------------------------------------------------------
  // kd4 — {n4} 점심, 1학년 교실 → (반 아이들이 5교시 음악실로) 빈 교실. 성공 → end_koharu_coin → 고백 → 엔딩
  //   CG: 빈 교실의 낮, 교복. 동전이 든 연보라 필통을 한 손에, 다른 손으로 의자 등받이를 당겨 준다(입을 크게 벌려 웃음)
  // ---------------------------------------------------------------------------
  scene({ id: 'kd4', title: '옆자리는 비워 둘게요', route: 'koharu', part: 'epilogue' }, [
    hide('all'),
    bg('classroom_day', 'black'),
    bgm('daily'),
    place('{n4} 점심 · 1학년 교실'),
    show('koharu', { pos: 'center', expr: 'smile', outfit: 'uniform', hair: 'default' }),
    say('kd4.010', 'koharu', '오늘은 혼자 해 볼게요. 선배는 손 무릎에 올리고 구경만 하세요.', 'smile'),
    me('kd4.020', '그럼 조수는 뭐 해?'),
    say('kd4.030', 'koharu', '제일 앞자리 관객이요. 박수는 제일 크게.', 'smile'),
    hide('koharu'),
    mono('kd4.040', '동전이 손바닥에서 사라졌다. 오늘은 내 자리에서 봐도 아무것도 미끄러지지 않았다.'),
    mono('kd4.050', '지퍼에 손이 가기 직전, {koharuFamily:가} 또 내 쪽을 봤다. 받을 것 하나 없는 내 쪽을.'),
    mono('kd4.060', '이번엔 내가 먼저 고개를 끄덕였다. 지퍼가 열리고, 필통 바닥에서 동전이 반짝였다.'),
    sayAs('kd4.070', 'classmates', FIRST_YEARS, '와, 오늘은 진짜 혼자 했다!'),
    sayAs('kd4.080', 'kh_friend', FRIEND, '다들 5교시 음악실! {koharu}, 네 책은 내가 들고 간다. 책상은 너희가 돌려놔.'),
    sfx('footsteps'),
    mono('kd4.090', '의자 끄는 소리가 우르르 문밖으로 빠져나갔다. 햇빛이 고인 교실에 둘만 남았다.'),
    mono('kd4.100', '조수가 할 일은 이제 없었다. 빌린 의자를 원래 책상에 돌려놓으려고 일어섰다.'),
    cg('end_koharu_coin'),
    bgm('heart'),
    say('kd4.110', 'koharu', '어디 가요, 선배! 의자 여기 있잖아요.'),
    mono('kd4.120', '{koharuFamily:는} 동전이 든 필통을 한 손에 든 채, 다른 손으로 등받이를 끌어당겼다. 의자가 내 쪽으로 왔다.'),
    me('kd4.130', '오늘은 받을 것도 없었잖아.'),
    say('kd4.140', 'koharu', '그래도요.'),
    mono('kd4.150', '그 한마디에 의자에 앉았다. 월요일부터 미뤄 둔 말이 있었다. 이번엔 내가 핑계를 하나 뺄 차례였다.'),
    cg(null),
    show('koharu', { pos: 'center', expr: 'neutral', outfit: 'uniform', hair: 'default' }),
    me('kd4.160', '{koharuFamily}. 내일부터는 ‘조수라서’는 빼도 돼?'),
    say('kd4.170', 'koharu', '……네? 그럼 이제 점심때 안 오세요?', 'sad'),
    me('kd4.180', '아니. 그거 빼고 와도 되냐고. 나 동전 받으러 온 적 한 번도 없어.'),
    me('kd4.190', '꼬마한테 펜 보여 주던 것도, 동전 떨어뜨려 가며 연습한 것도, 마지막에 꼭 나부터 보는 것도 좋아.'),
    me('kd4.200', '네가 좋아, {koharuFamily}. 우리 사귀자.'),
    say('kd4.210', 'koharu', '……네. 저도 선배 좋아해요. 사귈래요.', 'shy'),
    say('kd4.220', 'koharu', '그리고 조수 자리요, 그거 처음부터 핑계였어요. 그냥 선배 자리였어요.', 'shy'),
    mono('kd4.230', '그 애는 끝까지 내 눈을 보고 말했다. 신발장에서 내 운동화 끝만 보던 애가.'),
    me('kd4.240', '하나만 더 물어볼게. 이름으로 불러도 될까.'),
    say('kd4.250', 'koharu', '……네. 불러 주세요.', 'neutral'),
    me('kd4.260', '{koharu}.'),
    mono('kd4.270', '처음 불러 본 이름이 빈 교실에 생각보다 크게 울렸다. {koharu:가} 입술을 오므렸다가 폈다.'),
    say('kd4.280', 'koharu', '그럼 저도요. ……{me} 선배.', 'shy'),
    mono('kd4.290', '그 애 목소리로 들으니 내 이름이 처음 듣는 말 같았다.'),
    sfx('bell'),
    say('kd4.300', 'koharu', '앗, 예비종! 근데 내일은 종업식이라 점심도 없네요.', 'sad'),
    me('kd4.310', '그럼 끝나고 같이 가자. {koharu}, 내일도 같이 갈래?'),
    say('kd4.320', 'koharu', '갈래요! 그 대신 가는 길엔 제가 선배 옆자리 맡을게요.', 'smile'),
    say('kd4.330', 'koharu', '여기 옆자리는요, 2학기까지 비워 둘게요.', 'shy'),
    mono('kd4.340', '{koharu:는} 문 앞까지 뛰어가다 한 번 돌아봤다. 이번엔 무언가를 확인하는 얼굴이 아니었다.'),
    hide('koharu'),
    mono('kd4.350', '책상 두 개를 원래대로 떼어 놓고, 의자 하나만은 그대로 두었다. 2학기 첫 점심까지 저 자리는 비어 있을 거다.'),
    ending('kd4.end', 'koharu_daily'),
  ]),
];
