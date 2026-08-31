export { default as WaitingRoomPage } from './WaitingRoomPage.vue'
// 입장 화면(P01)이 쓰는 최소 표면만 공개한다 — 방 생성·코드 검증·내가 만든 방 목록
export { default as MyRoomList } from './components/MyRoomList.vue'
export { ROOM_CODE_LENGTH, createRoom, normalizeRoomCode, roomExists } from './api/rooms'
// 라운드 운영(H04)이 방 문서·명단을 구독한다 — 방 데이터의 소유자는 여기다
export { endGame, isAssignedInRound, subscribeToParticipants, subscribeToRoom } from './api/rooms'
export type { Participant, RoomInfo, RoomStatus, RoundState } from './api/rooms'
// 라운드 재실행 세션 가드 — round-ops가 라운드 시작 성공 시 markRoundPlayed를 호출한다(best-effort)
export { hasPlayedRound, markRoundPlayed } from './roundPlayMarker'
