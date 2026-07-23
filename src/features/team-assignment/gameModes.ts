/**
 * 게임 모드 레지스트리 — 기획서 규칙서 v1.0 3장 기반.
 *
 * 어몽어스식 "[1] 모드 선택 → [2] 세부 모듈(X 등)" 구조에서 [1]에 해당한다. 모드가 8종이고
 * 모드마다 참가자에게 보여줄 규칙서가 다르므로, "규칙서 표시 구조"만 여기서 모듈화한다.
 * 배정 알고리즘 자체는 모드 공통이며(모드별 편성 차이는 후속 작업), X는 모드가 아니라
 * 독립 모듈 축이다(기존 isXTeam 토글 유지) — 그래서 이 목록에 X는 없다.
 */

/** 8종 모드 식별자 — Firestore rooms.gameMode에 그대로 저장된다 */
export type GameModeId =
  | 'normal'
  | 'tail-chase'
  | 'group'
  | 'king-hunt'
  | 'staff-chase'
  | 'bomb-plant'
  | 'kkomkkomi'
  | 'fast-survival'

/** 규칙서 한 항목 — 정적 텍스트 또는 라운드 컨텍스트가 필요한 동적 항목 */
export type GameModeRuleEntry =
  | { kind: 'composition' } // 팀 구성 규칙 — 2인 1조/1인 팀 variant는 카드가 배정 컨텍스트로 채운다
  | { kind: 'group' } // 그룹 규칙 — "그룹은 완장 색깔" + 이번 라운드 그룹 색 문구
  | { kind: 'static'; text: string; caption?: string }

export interface GameModeDefinition {
  id: GameModeId
  /** 규칙서 배지·모드 선택 리스트에 쓰는 한글 라벨 */
  label: string
  /** 모드 선택 리스트의 한 줄 설명 */
  description: string
  /** 규칙서 — 배열 순서대로 번호를 매겨 렌더한다 */
  rules: GameModeRuleEntry[]
}

/** 필드/모드가 아직 없는 방(기존 방 포함)의 기본값 */
export const DEFAULT_GAME_MODE: GameModeId = 'normal'

/** 모드 선택 리스트·검증에 쓰는 고정 순서 — 기획 우선순위 순 */
export const GAME_MODE_IDS: readonly GameModeId[] = [
  'normal',
  'tail-chase',
  'group',
  'king-hunt',
  'staff-chase',
  'bomb-plant',
  'kkomkkomi',
  'fast-survival',
]

export const GAME_MODES: Record<GameModeId, GameModeDefinition> = {
  normal: {
    id: 'normal',
    label: '일반전',
    description: '2인 1조 팀전 기본 생존 서바이벌',
    rules: [
      { kind: 'composition' },
      { kind: 'group' },
      { kind: 'static', text: '상대 완장 알파벳을 찍어 제출하세요.' },
    ],
  },
  'tail-chase': {
    id: 'tail-chase',
    label: '꼬리잡기',
    description: '알파벳 상성 꼬리물기',
    rules: [
      { kind: 'composition' },
      {
        kind: 'static',
        text: '바로 다음 알파벳만 사냥할 수 있습니다.',
        caption: 'A는 B만, Z는 A를 사냥합니다.',
      },
      { kind: 'static', text: '잡히면 완장을 떼고 잡은 팀의 꼬리로 편입됩니다.' },
    ],
  },
  group: {
    id: 'group',
    label: '그룹전',
    description: '완장 색 4개 그룹 연합전',
    rules: [
      { kind: 'composition' },
      { kind: 'group' },
      { kind: 'static', text: '같은 색 그룹끼리는 동맹이라 서로 공격할 수 없습니다.' },
      { kind: 'static', text: '그룹 점수와 우리 팀 점수를 합산해 정산합니다.' },
    ],
  },
  'king-hunt': {
    id: 'king-hunt',
    label: '왕잡기',
    description: '그룹의 왕을 지키고 상대 왕을 사냥',
    rules: [
      { kind: 'composition' },
      { kind: 'group' },
      { kind: 'static', text: '각 그룹은 왕 1명을 비밀리에 지정합니다.' },
      {
        kind: 'static',
        text: '왕의 킬은 2배 점수입니다.',
        caption: '왕이 잡히면 그룹 전체가 막대한 감점을 받습니다.',
      },
    ],
  },
  'staff-chase': {
    id: 'staff-chase',
    label: '스태프 추격전',
    description: '전원 협동 도망 모드',
    rules: [
      { kind: 'static', text: '모든 참가자는 동맹입니다. 사냥꾼(스태프)을 피해 생존하세요.' },
      { kind: 'static', text: '제한 시간까지 생존한 인원에 비례해 전체 점수를 얻습니다.' },
    ],
  },
  'bomb-plant': {
    id: 'bomb-plant',
    label: '폭탄설치전',
    description: '거점 QR 점령전',
    rules: [
      { kind: 'composition' },
      {
        kind: 'static',
        text: '공격은 거점 A·B의 QR을 스캔해 2분 폭탄을 가동합니다.',
        caption: '수비는 2분 안에 재스캔으로 해제해야 합니다.',
      },
      {
        kind: 'static',
        text: '하나라도 폭파되면 공격 승리, 전원 아웃되거나 무폭파면 수비 승리입니다.',
      },
    ],
  },
  kkomkkomi: {
    id: 'kkomkkomi',
    label: '꼼꼬미',
    description: '숨바꼭질 × 포토 게임',
    rules: [
      { kind: 'static', text: '술래를 피해 숨고, 술래 거점의 꼼꼬미 QR을 스캔하면 확정 생존입니다.' },
      {
        kind: 'static',
        text: '생존 판정은 게임 툴의 최초 타임스탬프 기준입니다.',
        caption: '술래의 촬영 시각이 내 스캔 시각보다 빠르면 아웃입니다.',
      },
    ],
  },
  'fast-survival': {
    id: 'fast-survival',
    label: '빠른생존',
    description: '자원 수집 서바이벌',
    rules: [
      { kind: 'composition' },
      { kind: 'static', text: '식량·약·물 QR을 각 1개씩 수집해 본부 반납 QR을 스캔하세요.' },
      { kind: 'static', text: '자원 거점은 인당 1회만 획득할 수 있습니다.' },
    ],
  },
}

/** 저장된 문자열이 유효한 모드 id인지 — 알 수 없는 값은 호출부에서 기본값으로 대체한다 */
export function isGameModeId(value: string): value is GameModeId {
  return (GAME_MODE_IDS as readonly string[]).includes(value)
}
