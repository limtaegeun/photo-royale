export { default as WaitingRoomPage } from './WaitingRoomPage.vue'
// 입장 화면(P01)이 쓰는 최소 표면만 공개한다 — 방 생성·코드 검증·내가 만든 방 목록
export { default as MyRoomList } from './components/MyRoomList.vue'
export { ROOM_CODE_LENGTH, createRoom, normalizeRoomCode, roomExists } from './api/rooms'
