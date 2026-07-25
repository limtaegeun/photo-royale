/**
 * 완장 → 그룹 색 유틸리티 클래스 매핑의 단일 소스.
 *
 * 그룹 색을 쓰는 화면(대기실 명단 칩·배정 보드·라운드 배정 카드)마다 같은 리터럴 맵과 같은
 * 방어 로직을 복제하던 것을 여기로 모았다. Tailwind v4 스캐너는 .ts 소스도 훑으므로
 * 완전한 리터럴 클래스명을 이 파일에 두어도 유틸리티가 정상 생성된다(문자열 조합만 금지).
 *
 * 색만으로 의미를 전달하지 않는다는 규칙(DESIGN_SYSTEM §3-6)에 따라, 이 클래스를 쓰는 곳은
 * 항상 GROUP_LABELS의 한글/영문 라벨을 함께 노출해야 한다.
 */
import { GROUP_LABELS, groupForArmband, type TeamGroup } from './armbands'

/** 인라인 텍스트로 쓰는 그룹 색 */
const GROUP_TEXT = {
  blue: 'text-team-blue',
  orange: 'text-team-orange',
  green: 'text-team-green',
  red: 'text-team-red',
} as const satisfies Record<TeamGroup, string>

/** 채운 면(완장 타일 색 바·표식)으로 쓰는 그룹 색 */
const GROUP_SOLID_BG = {
  blue: 'bg-team-blue-solid',
  orange: 'bg-team-orange-solid',
  green: 'bg-team-green-solid',
  red: 'bg-team-red-solid',
} as const satisfies Record<TeamGroup, string>

/** 얇은 보더(1px 아바타 링 등)로 쓰는 그룹 색 — 읽기용 텍스트 색과 같은 값 */
const GROUP_BORDER = {
  blue: 'border-team-blue',
  orange: 'border-team-orange',
  green: 'border-team-green',
  red: 'border-team-red',
} as const satisfies Record<TeamGroup, string>

/** 굵은 보더(칩 2px 테두리)로 쓰는 그룹 색 — 완장 표식과 같은 solid 색 */
const GROUP_SOLID_BORDER = {
  blue: 'border-team-blue-solid',
  orange: 'border-team-orange-solid',
  green: 'border-team-green-solid',
  red: 'border-team-red-solid',
} as const satisfies Record<TeamGroup, string>

/**
 * 완장 알파벳 → 그룹. 표시 계층 전용의 방어적 래퍼로, groupForArmband가 throw하는 입력
 * (미배정 null·소문자·다중 문자 등)과 특수 완장 X를 모두 null(중립 표기)로 흡수한다.
 * 배정 로직은 이 함수가 아니라 groupForArmband를 직접 써서 잘못된 완장을 드러내야 한다.
 */
export function displayGroup(armband: string | null | undefined): TeamGroup | null {
  if (!armband || !/^[A-Z]$/.test(armband)) return null
  return groupForArmband(armband)
}

/** 그룹 색 인라인 텍스트 클래스 — 그룹을 정할 수 없으면 중립 보조 텍스트 색 */
export function groupTextClass(armband: string | null | undefined): string {
  const group = displayGroup(armband)
  return group === null ? 'text-content-secondary' : GROUP_TEXT[group]
}

/** 그룹 색 채운 배경 클래스 — 그룹을 정할 수 없으면 중립 fill */
export function groupSolidBgClass(armband: string | null | undefined): string {
  const group = displayGroup(armband)
  return group === null ? 'bg-neutral' : GROUP_SOLID_BG[group]
}

/** 그룹 색 얇은 보더 클래스 — 그룹을 정할 수 없으면 중립 보더 */
export function groupBorderClass(armband: string | null | undefined): string {
  const group = displayGroup(armband)
  return group === null ? 'border-stroke-strong' : GROUP_BORDER[group]
}

/** 그룹 색 굵은 보더 클래스 — 그룹을 정할 수 없으면 기본 보더 */
export function groupSolidBorderClass(armband: string | null | undefined): string {
  const group = displayGroup(armband)
  return group === null ? 'border-stroke' : GROUP_SOLID_BORDER[group]
}

/** 그룹 영문 라벨(예: 'BLUE') — 그룹을 정할 수 없으면 빈 문자열 */
export function groupLabelEn(armband: string | null | undefined): string {
  const group = displayGroup(armband)
  return group === null ? '' : GROUP_LABELS[group].en
}

/** 그룹 한글 라벨(예: '파랑') — 그룹을 정할 수 없으면 빈 문자열 */
export function groupLabelKo(armband: string | null | undefined): string {
  const group = displayGroup(armband)
  return group === null ? '' : GROUP_LABELS[group].ko
}
