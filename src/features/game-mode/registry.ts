/**
 * 게임 모드 레지스트리 — modes/ 아래 모드 1개 = 파일 1개 정의를 한 곳에 조립한다.
 * 새 모드 추가 시: types.ts의 GameModeId 유니온 → modes/<id>.ts 정의 → 여기 IDS·레코드 순.
 */
import type { GameModeDefinition, GameModeId } from './types'
import { normalMode } from './modes/normal'
import { tailChaseMode } from './modes/tailChase'
import { groupMode } from './modes/group'
import { kingHuntMode } from './modes/kingHunt'
import { staffChaseMode } from './modes/staffChase'
import { bombPlantMode } from './modes/bombPlant'
import { kkomkkomiMode } from './modes/kkomkkomi'
import { fastSurvivalMode } from './modes/fastSurvival'

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
  normal: normalMode,
  'tail-chase': tailChaseMode,
  group: groupMode,
  'king-hunt': kingHuntMode,
  'staff-chase': staffChaseMode,
  'bomb-plant': bombPlantMode,
  kkomkkomi: kkomkkomiMode,
  'fast-survival': fastSurvivalMode,
}

/** 저장된 문자열이 유효한 모드 id인지 — 알 수 없는 값은 호출부에서 기본값으로 대체한다 */
export function isGameModeId(value: string): value is GameModeId {
  return (GAME_MODE_IDS as readonly string[]).includes(value)
}
