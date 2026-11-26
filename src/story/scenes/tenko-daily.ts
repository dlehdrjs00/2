/**
 * 히나 루트 — 일상 쪽 결말 「네가 먼저 보는 것」(t4.fork d → t4.d → td1 → td2 → td3 → 엔딩 tenko_daily)
 *
 * 축: {tenko:는} 내 서툰 매듭(한쪽만 짧은 커튼)까지 보고 있었다. 이번엔 내가 {tenko:가} 먼저 보는 걸 배운다.
 *  - t4.d(7/17 사당 뒤): 별표 대신 '다음엔 내가 고른 길을 걷자'(종업식 날까지 고르기로)(edits.md)
 *  - td1 {n1} 방과 후: 소나기 뒤 처마 앞 웅덩이에 학교가 거꾸로 비친다. {tenko:가} 짧은 커튼으로 교실을 찾는다
 *        → {osana}의 한마디('너 얘 되게 많이 보는구나') → 나는 {tenko:가} 뭘 먼저 보는지 하나도 몰랐다
 *  - td2 {n2}~{n4}: 담장 위(고양이) / 창가 맨 끝(커튼을 맞췄다가 다시 짧게) / 새로 붙은 축제 포스터('반칙')
 *  - td3 {n5} 종업식 날 낮(아침 소나기 뒤): 학교 뒷길 웅덩이 → 일부러 짧게 묶은 커튼 → 사진은 안 찍는다
 *        (처음 와 본 곳이지만 금방 처음이 아니게 될 테니까 / 같이 찍히는 건 축제 날 약속)
 *        → 내가 먼저 고백, 다음 산책을 데이트로 → {tenko}의 수첩 맨 뒷장 『{me} 군이 먼저 보는 것 … 나』 → 분명한 대답
 *        → 다음 길은 {tenko:가} 고른다 → end_hina_walk → 엔딩
 * 헤어: 월·화·금(td1, td2 첫 컷, td3) 기본, 수·목(td2 교실·상점가 컷) 포니테일.
 * 그림: end_hina_walk = 비 갠 낮, 젖은 길과 웅덩이에 비친 학교, 돌담·철망 위 수국, 갈림길.
 *       교복 기본 헤어 {tenko:가} 분홍 수첩을 한 팔로 안고 다른 손바닥으로 길을 가리키며 활짝 웃는다. td3.360 뒤에 띄운다.
 * 축제 쪽 '처음으로 함께 찍힌 사진'은 여기서 찍지 않고 축제 날 약속으로 남긴다(td2.280, td3.260).
 * 씨앗(공통 e2 두 판에 다른 작가가 심음): 2학년 3반 창가 커튼은 내가 묶고, 내가 묶으면 꼭 한쪽만 짧다.
 *   씨앗이 없는 구저장 흐름에서도 td1 이 {tenko}의 입으로 처음 알려 주는 것으로 성립한다.
 */
import type { Scene } from '../../engine/types';
import { bg, bgm, cg, ending, hide, isFlag, jump, label, me, mono, not, place, say, scene, sfx, show, when } from '../../engine/dsl';

export const TENKO_DAILY_SCENES: Scene[] = [
  // ---------------------------------------------------------------------------
  // td1 — {n1} 방과 후, 비 갠 처마 앞 웅덩이. 한쪽만 짧은 커튼
  // ---------------------------------------------------------------------------
  scene({ id: 'td1', title: '거꾸로 비친 교실', route: 'tenko', part: 'epilogue' }, [
    hide('all'),
    bg('bg_after_rain', 'black'),
    bgm('daily'),
    place('{n1} · 방과 후, 운동장 쪽 처마'),
    mono('td1.010', '6교시 내내 창을 두드린 소나기가 종례 뒤에 그쳤다. 처마 끝부터 운동장까지 젖어 반짝였다.'),
    show('osana', { pos: 'left', expr: 'neutral', outfit: 'uniform', hair: 'default' }),
    show('tenko', { pos: 'right', expr: 'neutral', outfit: 'uniform', hair: 'default' }),
    say('td1.030', 'osana', '개었네. 무지개 뜨려나.', 'neutral'),
    mono('td1.040', '{osana:도} 나도 하늘부터 올려다봤다. {tenko}만 발밑을 보고 있었다.'),
    say('td1.050', 'tenko', '있잖아, 여기 봐. 웅덩이에 학교가 통째로 들어갔어.', 'smile'),
    mono('td1.060', '처마 앞 웅덩이에 교사가 거꾸로 담겨 있었다. 줄지어 선 창문들이 물결 따라 흔들렸다.'),
    say('td1.070', 'tenko', '저기가 우리 교실이다.', 'smile'),
    me('td1.080', '창문이 다 똑같은데 어떻게 알아?'),
    say('td1.090', 'tenko', '커튼. 창가 맨 끝 커튼만 한쪽이 짧잖아.', 'neutral'),
    say('td1.100', 'tenko', '{me} 군이 묶으면 꼭 그렇게 돼. 맑은 날에도, 비 오는 날에도.', 'smile'),
    mono('td1.110', '들여다보니 정말이었다. 거꾸로 선 교실 창에서 커튼 한쪽만 한 뼘 들려 있었다.'),
    say('td1.120', 'osana', '…10년을 봤는데, 그건 몰랐네.', 'neutral'),
    say('td1.130', 'osana', '{tenko}, 너 얘 되게 많이 보는구나.', 'smile'),
    say('td1.140', 'tenko', '에? 아, 아니야! 옆자리니까, 고개만 돌리면 보이는 거야!', 'fluster'),
    say('td1.150', 'osana', '그래. 고개를 되게 자주 돌리나 보지.', 'smile'),
    say('td1.160', 'osana', '난 당번이라 먼저 간다. 둘 다 웅덩이 밟지 말고.', 'neutral'),
    hide('osana'),
    mono('td1.170', '{osana:는} 웅덩이를 성큼 건너뛰었다. 건너기 전에 물속 교실을 한 번 내려다보고.'),
    show('tenko', { pos: 'center', expr: 'shy' }),
    say('td1.180', 'tenko', '…방금 그거, 못 들은 걸로 해 줘.', 'shy'),
    me('td1.190', '커튼 얘기?'),
    say('td1.200', 'tenko', '{osana}짱이 한 얘기!', 'fluster'),
    mono('td1.210', '옆자리에서 고개를 돌리면 보이는 것. 그 안에 내 손이 들어 있었다는 걸 처음 알았다.'),
    mono('td1.220', '그럼 나는 {tenko:가} 무엇을 먼저 보는지, 하나라도 알고 있었나.'),
    say('td1.230', 'tenko', '그, 그보다 {me} 군. 고른다던 길은 정했어?', 'neutral'),
    me('td1.240', '아직. 방금 하나 알았어.'),
    say('td1.250', 'tenko', '뭘?', 'neutral'),
    me('td1.260', '비 그치면 다들 하늘부터 보는데, 너는 발밑부터 본다는 거.'),
    say('td1.270', 'tenko', '불공평해. 커튼은 내가 먼저 찾았는데, 왜 내가 들킨 기분이야.', 'pout'),
    mono('td1.280', '{tenko:는} 수첩을 끌어안고 웅덩이를 폴짝 건넜다. 물속의 학교가 잠깐 흔들렸다.'),
    jump('td2'),
  ]),

  // ---------------------------------------------------------------------------
  // td2 — {n2} 아침 갈림길(기본 헤어) → {n3} 점심 교실(포니테일) → {n4} 방과 후 상점가(포니테일)
  // ---------------------------------------------------------------------------
  scene({ id: 'td2', title: '먼저 보는 것들', route: 'tenko', part: 'epilogue' }, [
    hide('all'),
    bg('road_morning', 'black'),
    bgm('daily'),
    place('{n2} · 아침, 편의점 앞 갈림길'),
    mono('td2.010', '다음 날 갈림길에서 맞혀 봤다. 먼저 볼 건 하늘이겠지. 어제 그만큼 비가 왔으니까.'),
    show('tenko', { pos: 'center', expr: 'neutral', outfit: 'uniform', hair: 'default' }),
    mono('td2.020', '골목에서 나온 {tenko:는} 하늘도, 나도 아닌 담장 위부터 봤다.'),
    say('td2.030', 'tenko', '좋은 아침! 오늘은 아무도 없네.', 'smile'),
    me('td2.040', '누가?'),
    say('td2.050', 'tenko', '고양이. 기다리면 온다며. 그래서 요즘은 담장 위부터 봐.', 'smile'),
    mono('td2.060', '내가 한 말이 {tenko}의 시선 끝에 걸려 있었다. 그게 조금 자랑스러웠다.'),
    me('td2.070', '여긴 8시 넘어야 와. 저 집 할아버지가 마당에 물 뿌리고 나면.'),
    sfx('cat'),
    mono('td2.080', '담 너머 물소리가 그치자, 정말로 회색 고양이가 담장 위로 훌쩍 올라왔다.'),
    say('td2.090', 'tenko', '왔다! …안 뛰어갈 거야. 기다릴 거야.', 'smile'),
    mono('td2.100', '{tenko:는} 꼼짝도 안 했다. 나는 고양이보다 그쪽을 더 오래 봤다.'),

    hide('all'),
    bg('classroom_day'),
    place('{n3} · 점심시간, 교실'),
    mono('td2.110', '수요일 아침엔 커튼을 세 번 풀었다 묶어 기어이 양쪽 길이를 맞췄다. 들키고 나니 괜히 신경이 쓰였다.'),
    show('osana', { pos: 'left', expr: 'neutral', outfit: 'uniform', hair: 'default' }),
    show('tenko', { pos: 'right', expr: 'neutral', outfit: 'uniform', hair: 'ponytail' }),
    mono('td2.120', '체육 뒤 머리를 묶고 돌아온 {tenko:는} 문을 열자마자 창가부터 봤다.'),
    say('td2.130', 'tenko', '…오늘은 똑같네.', 'sad'),
    me('td2.140', '맞춰 봤어. 월요일에 그 얘기 듣고.'),
    say('td2.150', 'tenko', '그럼 이제 웅덩이에서 우리 교실 못 찾잖아.', 'pout'),
    say('td2.160', 'osana', '커튼 하나로 둘이 되게 진지하다.', 'neutral'),
    say('td2.170', 'tenko', '{osana}짱, 이건 중요한 문제야. 표지판이 없어진 거라고.', 'pout'),
    mono('td2.180', '한쪽 끈을 풀어 평소처럼 대충 다시 묶었다. 커튼이 한 뼘 들렸다.'),
    say('td2.190', 'tenko', '돌아왔다!', 'smile'),
    say('td2.200', 'osana', '…너희 보고 있으면 내가 다 덥다.', 'pout'),

    hide('all'),
    bg('shotengai'),
    bgm('evening'),
    place('{n4} · 방과 후, 상점가'),
    show('tenko', { pos: 'center', expr: 'neutral', outfit: 'uniform', hair: 'ponytail' }),
    mono('td2.220', '목요일엔 내가 먼저 맞혀 보기로 했다. 상점가에 오면 {tenko:는} 새로 붙은 것부터 본다.'),
    me('td2.230', '{tenko}, 저기 축제 포스터 붙었다.'),
    say('td2.240', 'tenko', '앗, 반칙! 내가 먼저 보려고 했는데.', 'fluster'),
    me('td2.250', '아까부터 그쪽만 보면서 걸었잖아.'),
    say('td2.260', 'tenko', '그, 그건… 붙을 때가 됐으니까.', 'shy'),
    mono('td2.270', '{tenko:는} 포스터 속 불꽃 그림을 한참 올려다봤다.'),
    say('td2.280', 'tenko', '포스터는 안 찍을래. 진짜를 찍을 거니까. 그날, 그 언덕에서.', 'smile'),
    mono('td2.290', '머릿속에 종이 한 장이 생겼다. 『{tenko}: 비 그친 날엔 발밑. 아침엔 담장 위. 교실에선 창가 맨 끝.』'),
    mono('td2.300', '거기에 ‘새로 붙은 것’을 보탰다. 그제야 걷고 싶은 길이 정해졌다.'),
    jump('td3'),
  ]),

  // ---------------------------------------------------------------------------
  // td3 — {n5} 종업식 날 낮(아침 소나기 뒤). 교실 → 학교 뒷길 웅덩이 → end_hina_walk → 엔딩
  // ---------------------------------------------------------------------------
  scene({ id: 'td3', title: '내가 고른 길', route: 'tenko', part: 'epilogue' }, [
    hide('all'),
    bg('classroom_day', 'black'),
    bgm('daily'),
    place('{n5} · 종업식 날, 교실'),
    mono('td3.010', '아침에 쏟아진 소나기는 종업식이 끝날 무렵 그쳤다. 성적표를 받아 든 교실이 금세 비었다.'),
    show('osana', { pos: 'left', expr: 'neutral', outfit: 'uniform', hair: 'default' }),
    show('tenko', { pos: 'right', expr: 'neutral', outfit: 'uniform', hair: 'default' }),
    say('td3.020', 'osana', '난 도서실 장서 점검. 방학 전에 끝내야 하거든.', 'neutral'),
    say('td3.030', 'osana', '{tenko}, 수첩 그렇게 꽉 안으면 구겨진다. 아침부터 계속.', 'smile'),
    say('td3.040', 'tenko', '{osana}짱!', 'fluster'),
    hide('osana'),
    mono('td3.050', '{osana:는} 나가다 문 앞에서 내 어깨를 한 번 툭 쳤다. 잘하라는 건지, 늦지 말라는 건지.'),
    when(not(isFlag('kh.met')), 'td3.k'),
    mono('td3.060', '복도 끝에서는 {koharuFamily:가} 방학 잘 보내라며 두 손을 크게 흔들었다.'),
    label('td3.k'),
    show('tenko', { pos: 'center', expr: 'neutral' }),
    me('td3.070', '{tenko}. 고른 길, 오늘 걷자.'),
    say('td3.080', 'tenko', '종업식 날. 진짜 날짜 지켰네.', 'smile'),
    say('td3.090', 'tenko', '어느 쪽이야? 신사 쪽?', 'neutral'),
    me('td3.100', '반대. 뒷문으로 나가.'),

    hide('all'),
    bg('road_morning'),
    bgm('heart'),
    // 엔딩 폴라로이드(end_hina_walk)가 뜨는 곳이라 날짜를 붙인다. 캡션은 '7월 24일, 학교 뒷길'(옛·새 splitDate 모두)
    place('{n5} · 학교 뒷길'),
    show('tenko', { pos: 'center', expr: 'smile', outfit: 'uniform', hair: 'default' }),
    mono('td3.110', '뒷문을 나와 돌담을 따라 내려가는 좁은 길. 비 그친 날이면 혼자 이리로 돌아가곤 했다.'),
    say('td3.130', 'tenko', '여기 처음 와 봐. 학교 바로 뒤인데.', 'smile'),
    mono('td3.140', '{tenko:는} 먼저 발밑을 봤다. 그다음 돌담 위. 머릿속 종이에 적힌 순서 그대로였다.'),
    sfx('cat'),
    mono('td3.150', '돌담 위 마른 자리엔 벌써 고양이가 배를 깔고 있었다. 볕이 제일 먼저 드는 데다.'),
    say('td3.160', 'tenko', '{me} 군, 저기! 웅덩이.', 'smile'),
    mono('td3.170', '길이 살짝 꺼진 자리의 웅덩이에, 학교가 통째로 거꾸로 들어 있었다.'),
    say('td3.180', 'tenko', '우리 교실 커튼, 짧다. …오늘도 일부러 그렇게 묶었어?', 'shy'),
    me('td3.190', '응. 여기서 보이게.'),
    me('td3.200', '월요일에 네가 웅덩이 보는 걸 보고 여기가 생각났어. 보여 주고 싶었어.'),
    say('td3.210', 'tenko', '신사 언덕이랑은 완전 다르네. 여긴 그냥 길인데.', 'smile'),
    me('td3.220', '응. 그냥 길. 매일 지나갈 수 있는.'),
    say('td3.230', 'tenko', '…여긴 안 찍을래. 처음 와 본 곳인데도.', 'neutral'),
    me('td3.240', '처음 간 곳은 앨범에 넣는다며.'),
    say('td3.250', 'tenko', '응. 근데 여긴 금방 처음이 아니게 될 거야. 몇 번이고 또 올 거니까.', 'smile'),
    say('td3.260', 'tenko', '같이 찍히는 건 축제 날 약속이고. 그건 그날까지 아껴 둘래.', 'shy'),
    bgm('confession'),
    me('td3.270', '{tenko}. 이번 주 내내 네가 뭘 먼저 보는지 봤어.'),
    me('td3.280', '웅덩이, 담장 위, 창가 맨 끝, 새로 붙은 포스터. 하나 알 때마다 다음 게 궁금해졌어.'),
    me('td3.290', '좋아해. 그러니까 다음 산책은, 데이트로 같이 갈래?'),
    show('tenko', { expr: 'fluster' }),
    say('td3.300', 'tenko', '…있잖아. 내 수첩 맨 뒷장에, {me} 군 칸이 따로 있어.', 'shy'),
    say('td3.310', 'tenko', '『{me} 군이 먼저 보는 것』. 담장 위, 고양이 있나. 사람 얼굴, 지쳤나 안 지쳤나.', 'neutral'),
    say('td3.320', 'tenko', '근데 이번 주에 한 줄이 늘었어. 『나』.', 'shy'),
    me('td3.330', '…들켰네.'),
    say('td3.340', 'tenko', '응. 다 보였어. 그래서 대답도 벌써 정해 놨어.', 'smile'),
    say('td3.350', 'tenko', '좋아해, 나도. 다음 산책, 데이트로 갈래.', 'shy'),
    say('td3.360', 'tenko', '대신 다음 길은 내가 고를게.', 'smile'),
    cg('end_hina_walk'),
    mono('td3.370', '{tenko:가} 수첩을 한 팔로 안고, 다른 손으로 갈림길 오른쪽을 가리켰다. 웅덩이 속 학교가 반짝였다.'),
    say('td3.380', 'tenko', '저쪽. 저 길은 나도 아직 안 가 봤어. {me} 군은?', 'smile'),
    me('td3.390', '저긴 나도 끝까지는 몰라.'),
    say('td3.400', 'tenko', '잘됐다. 그럼 첫 데이트는 둘 다 처음 가는 길이야.', 'smile'),
    cg(null),
    say('td3.410', 'tenko', '{me} 군. 지금 뭐 제일 먼저 봤어?', 'smile'),
    me('td3.420', '너.'),
    say('td3.430', 'tenko', '알아. 그 줄은 벌써 적어 놨다니까.', 'shy'),
    ending('td3.end', 'tenko_daily'),
  ]),
];
