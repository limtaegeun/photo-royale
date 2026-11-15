/**
 * 규칙 설명서 화면(노션 ② "규칙 설명서 화면")의 모드 공통 문구 — 한 줄 요약, 기본 규칙 5개, 금지 행동 6개.
 * 문구는 노션 원문 그대로다(라운드 모드 카드는 모드 파일의 ruleCard가 소유한다). 아이템이 구현되면 기본 규칙
 * 6번으로 아이템 칸과 보급품 안내를 더한다(노션 개발 메모).
 */

/** 규칙 설명서 맨 위 한 줄 요약 */
export const RULES_GUIDE_SLOGAN = '다른 팀을 찍으면 킬! 나는 찍히지 않게!'

/** 기본 규칙 한 칸 — 본문은 문단(lines) 또는 이름 붙은 항목(terms) 중 하나다 */
export interface BasicRule {
  title: string
  /** 한 줄씩 보이는 본문 */
  lines?: readonly string[]
  /** 이름과 설명 한 쌍씩 보이는 본문(3번 "이럴 땐 인정되지 않아요") */
  terms?: ReadonlyArray<{ term: string; description: string }>
  /** 본문 위 하트 줄(시안 4번) — 하트 수와 옆 글자. 글자는 제목 문구에서 뽑는다 */
  hearts?: { count: number; label: string }
  /** 본문 위 숫자 칸(시안 5번) — 노션 본문의 숫자를 한눈에 보이게 칸으로 뽑는다. 본문 줄은 그대로 둔다 */
  stats?: ReadonlyArray<{ value: string; label: string }>
}

/** 기본 규칙 — 모든 모드에 공통. 배열 순서대로 1번부터 번호를 붙인다 */
export const BASIC_RULES: readonly BasicRule[] = [
  { title: '짝꿍과 2인 1조예요', lines: ['짝꿍과 같이 움직여요.'] },
  {
    title: '완장을 찍으면 킬이에요',
    lines: [
      '다른 팀 완장의 색과 알파벳이 또렷하게 보이게 찍어요.',
      '찍은 다음 어느 팀을 찍었는지 고르고 제출해요.',
      'GM이 사진을 보고 인정하면 킬이 돼요.',
    ],
  },
  {
    title: '이럴 땐 인정되지 않아요',
    terms: [
      { term: '미식별', description: '흔들리거나 가려서 누군지 안 보여요.' },
      { term: '불일치', description: '킬할 수 없는 팀의 완장이에요.' },
      { term: '한발늦음', description: '다른 팀이 먼저 잡았어요.' },
    ],
  },
  {
    title: '체력은 하트 1개예요',
    hearts: { count: 1, label: '하트 1개' },
    lines: [
      '킬샷을 맞으면 DEAD예요. 바로 베이스캠프로 돌아가요.',
      'DEAD가 된 라운드에서는 사진을 더 낼 수 없어요.',
      '베이스캠프에서는 마음껏 구경해도 됩니다.',
    ],
  },
  {
    title: '점수는 이렇게 쌓여요',
    stats: [
      { value: '+10', label: '킬샷 1번' },
      { value: '20분', label: '한 판' },
      { value: '3판', label: '점수 합산' },
    ],
    lines: [
      '킬샷 1번에 +10점이에요.',
      '한 판은 20분, 모두 3판을 해요. 세 판 점수를 더해 우승자를 정해요.',
      '짝꿍이 오지 않아 혼자 남은 팀은 체력과 점수가 2배예요.',
    ],
  },
]

/** 금지 행동 머리말 */
export const FORBIDDEN_INTRO = '이 게임은 서로를 믿어야 돌아가요.'

/** 이것만은 하지 말아요 — 접지 않고 항상 보인다 */
export const FORBIDDEN_ACTIONS: readonly string[] = [
  '카메라 렌즈 가리기',
  '완장 숨기고 걷기',
  '벽에 딱 붙어서 완장 막기',
  '영상으로 찍고 캡처해서 내기',
  '몰래 다른 수단으로 연락하기',
  '드론 띄우기',
]
