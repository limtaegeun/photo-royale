import { describe, it, expect, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { SubmissionRecord } from '@/features/round-ops'
import type { RoundLedger } from '@/features/round-ledger'
import CockpitRecordSheet from '../components/CockpitRecordSheet.vue'

const NOW = new Date('2026-09-20T10:00:00Z').getTime()
const MINUTE_MS = 60 * 1000

/** 기본은 대기(pending) 한 건 — 테스트마다 바뀌는 필드만 override한다 */
function record(overrides: Partial<SubmissionRecord> = {}): SubmissionRecord {
  return {
    id: 's1',
    uid: 'player1',
    team: 'A',
    round: 2,
    photo: 'data:image/jpeg;base64,killshot',
    status: 'pending',
    createdAtMs: NOW - 2 * MINUTE_MS,
    targetTeam: null,
    multiplier: 1,
    judgedAtMs: null,
    ...overrides,
  }
}

/** 팀 A(player1·player2)·B(player3) 2차 원장 — 집계·아웃은 override로 만든다 */
function ledger(overrides: Partial<RoundLedger> = {}): RoundLedger {
  return {
    roundNo: 2,
    mode: 'normal',
    teams: { A: ['player1', 'player2'], B: ['player3'] },
    xTeams: [],
    confirmedAtMs: 0,
    tally: null,
    hits: null,
    tails: null,
    credits: null,
    result: null,
    ...overrides,
  }
}

/** 정산이 끝난 지난 라운드 원장 — player1 기준 등급·포인트·원점수를 지정한다 */
function settledLedger(
  roundNo: number,
  mine: { tier: number; points: number; score: number },
  other: { tier: number; points: number; score: number },
): RoundLedger {
  return ledger({
    roundNo,
    result: {
      teamScores: { A: mine.score, B: other.score },
      playerScores: { player1: mine.score, player2: mine.score, player3: other.score },
      playerTiers: { player1: mine.tier, player2: mine.tier, player3: other.tier },
      playerPoints: { player1: mine.points, player2: mine.points, player3: other.points },
      finishedAtMs: 0,
    },
  })
}

type SheetProps = InstanceType<typeof CockpitRecordSheet>['$props']

/** 시트는 포털로 body에 렌더된다 — 포털 마운트를 기다린 뒤 document.body에서 확인한다 */
async function mountSheet(overrides: Partial<SheetProps> = {}) {
  const wrapper = mount(CockpitRecordSheet, {
    props: {
      mySubmissions: [],
      ledger: null,
      myTeam: 'A',
      myUid: 'player1',
      pastLedgers: [],
      nowMs: NOW,
      open: true,
      ...overrides,
    },
  })
  await flushPromises()
  return wrapper
}

function bodyText(): string {
  return document.body.textContent ?? ''
}

describe('CockpitRecordSheet', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('제목과 세 섹션 헤딩을 보여준다', async () => {
    await mountSheet()

    const text = bodyText()
    expect(text).toContain('내 기록')
    expect(text).toContain('이번 라운드 내 킬샷')
    expect(text).toContain('우리 팀 이번 라운드')
    expect(text).toContain('지난 라운드')
  })

  describe('이번 라운드 내 킬샷', () => {
    it('내 제출을 최신순으로 썸네일·제출 시각·상태 배지와 함께 나열한다', async () => {
      await mountSheet({
        mySubmissions: [
          record({ id: 'old', createdAtMs: NOW - 10 * MINUTE_MS, status: 'rejected' }),
          record({ id: 'new', createdAtMs: NOW - 30 * 1000, status: 'pending' }),
        ],
      })

      const rows = [...document.body.querySelectorAll<HTMLElement>('li[data-record]')]
      expect(rows.map((row) => row.dataset.record)).toEqual(['new', 'old'])
      expect(rows[0]!.textContent).toContain('방금 제출')
      expect(rows[0]!.textContent).toContain('대기')
      expect(rows[1]!.textContent).toContain('10분 전 제출')
      expect(rows[1]!.textContent).toContain('반려')
      expect(bodyText()).toContain('2건')

      // 본인 사진만 썸네일로 — 확대·저장 경로(링크·버튼)가 없다
      const photos = [...document.body.querySelectorAll<HTMLImageElement>('img[alt="내 킬샷"]')]
      expect(photos).toHaveLength(2)
      expect(photos[0]!.getAttribute('src')).toBe('data:image/jpeg;base64,killshot')
      expect(document.body.querySelector('li[data-record] a')).toBeNull()
      expect(document.body.querySelector('li[data-record] button')).toBeNull()
    })

    it('서버 시각 반영 전(null) 제출은 방금 올린 것이라 맨 앞에 둔다', async () => {
      await mountSheet({
        mySubmissions: [
          record({ id: 'settled', createdAtMs: NOW - MINUTE_MS }),
          record({ id: 'fresh', createdAtMs: null }),
        ],
      })

      const rows = [...document.body.querySelectorAll<HTMLElement>('li[data-record]')]
      expect(rows.map((row) => row.dataset.record)).toEqual(['fresh', 'settled'])
    })

    it('인정된 킬샷은 잡은 팀을, 낙오 포착이면 3배까지 성공 배지에 적는다', async () => {
      await mountSheet({
        mySubmissions: [
          record({ id: 'single', status: 'approved', targetTeam: 'B' }),
          record({ id: 'triple', status: 'approved', targetTeam: 'C', multiplier: 3 }),
        ],
      })

      const badges = [...document.body.querySelectorAll<HTMLElement>('[data-status="approved"]')]
      expect(badges.map((badge) => badge.textContent?.trim())).toEqual([
        '인정 · 팀 B',
        '인정 · 팀 C · 3배',
      ])
      expect(badges.every((badge) => badge.dataset.tone === 'success')).toBe(true)
    })

    it('상태 배지 톤 — 대기는 중립 채움, 반려는 위험 외곽선', async () => {
      await mountSheet({
        mySubmissions: [
          record({ id: 'p', status: 'pending' }),
          record({ id: 'r', status: 'rejected' }),
        ],
      })

      const pending = document.body.querySelector<HTMLElement>('[data-status="pending"]')!
      expect(pending.dataset.tone).toBe('neutral')
      expect(pending.dataset.appearance).toBe('fill')
      const rejected = document.body.querySelector<HTMLElement>('[data-status="rejected"]')!
      expect(rejected.dataset.tone).toBe('danger')
      expect(rejected.dataset.appearance).toBe('outline')
    })

    it('제출이 없으면 빈 상태 문구를 보여준다', async () => {
      await mountSheet({ mySubmissions: [] })

      expect(bodyText()).toContain('아직 올린 킬샷이 없어요.')
      expect(document.body.querySelector('li[data-record]')).toBeNull()
    })

    it('킬샷이 없는 모드(스태프 추격전)는 빈 상태 대신 모드 안내를 보여준다', async () => {
      await mountSheet({ killshotsDisabled: true, mySubmissions: [record()] })

      const text = bodyText()
      expect(text).toContain('이 모드에는 킬샷이 없어요.')
      expect(text).not.toContain('아직 올린 킬샷이 없어요.')
      expect(document.body.querySelector('li[data-record]')).toBeNull()
    })
  })

  describe('우리 팀 이번 라운드', () => {
    it('원장이 없으면 집계 없음 문구를 보여준다', async () => {
      await mountSheet({ ledger: null })

      expect(bodyText()).toContain('이번 라운드 집계가 없어요.')
    })

    it('집계가 없는 팀은 킬 0건·생존으로 읽는다', async () => {
      await mountSheet({ ledger: ledger() })

      const text = bodyText()
      expect(text).toContain('킬 0건')
      expect(document.body.querySelector('[data-team-status="alive"]')?.textContent?.trim()).toBe(
        '생존',
      )
    })

    it('킬은 일반·3배를 합쳐 세고 3배 건수를 따로 적는다', async () => {
      await mountSheet({
        ledger: ledger({ tally: { A: { kills: 2, tripleKills: 1, kingKills: 0 } } }),
      })

      expect(bodyText()).toContain('킬 3건 (3배 1)')
    })

    it('3배 킬이 없으면 괄호 표기를 생략한다', async () => {
      await mountSheet({
        ledger: ledger({ tally: { A: { kills: 2, tripleKills: 0, kingKills: 0 } } }),
      })

      expect(bodyText()).toContain('킬 2건')
      expect(bodyText()).not.toContain('3배')
    })

    it('우리 팀이 잡혔으면 탈락 배지를 보여준다 — 2인 팀은 라이프 1', async () => {
      await mountSheet({ ledger: ledger({ hits: { A: 1 } }) })

      expect(document.body.querySelector('[data-team-status="out"]')?.textContent?.trim()).toBe(
        '탈락',
      )
      expect(document.body.querySelector('[data-team-status="alive"]')).toBeNull()
    })

    it('편입 모드에서 내 크레딧이 있으면 편입 크레딧을 보여준다', async () => {
      await mountSheet({ ledger: ledger({ credits: { player1: 2, player3: 1 } }) })

      expect(bodyText()).toContain('편입 크레딧 2')
    })

    it('크레딧 맵에 내가 없으면 편입 크레딧 줄을 두지 않는다', async () => {
      await mountSheet({ ledger: ledger({ credits: { player3: 1 } }) })

      expect(bodyText()).not.toContain('편입 크레딧')
    })

    it('내 완장을 아직 모르면 배정 확인 중 문구로 대신한다', async () => {
      await mountSheet({ ledger: ledger(), myTeam: null })

      expect(bodyText()).toContain('팀 배정을 확인하는 중이에요.')
      expect(bodyText()).not.toContain('킬 0건')
    })
  })

  describe('지난 라운드', () => {
    it('끝난 라운드가 없으면 빈 상태 문구를 보여준다', async () => {
      await mountSheet({ pastLedgers: [] })

      expect(bodyText()).toContain('아직 끝난 라운드가 없어요.')
    })

    it('내 누적 순위·포인트·원점수와 라운드별 등급 내역을 보여준다', async () => {
      await mountSheet({
        pastLedgers: [
          settledLedger(1, { tier: 2, points: 7, score: 10 }, { tier: 1, points: 10, score: 20 }),
          settledLedger(2, { tier: 1, points: 10, score: 30 }, { tier: 2, points: 7, score: 10 }),
        ],
      })

      const text = bodyText()
      // 포인트 17 동점(player1·player2) → 원점수도 같아 공동 1위, player3(17)도 같은 포인트지만 원점수 30 < 40
      expect(text).toContain('순위 1위 · 누적 17P · 원점수 40')
      expect(text).toContain('1R 2등급 · 2R 1등급')
    })

    it('등급 없음(원점수 0 이하)은 0점 이하로 적는다', async () => {
      await mountSheet({
        pastLedgers: [settledLedger(1, { tier: 0, points: 1, score: 0 }, { tier: 1, points: 10, score: 20 })],
      })

      const text = bodyText()
      expect(text).toContain('순위 2위 · 누적 1P · 원점수 0')
      expect(text).toContain('1R 0점 이하')
    })

    it('끝난 라운드는 있지만 내 기록이 없으면 그 사실을 알린다', async () => {
      await mountSheet({
        myUid: 'latecomer',
        pastLedgers: [settledLedger(1, { tier: 1, points: 10, score: 20 }, { tier: 2, points: 7, score: 10 })],
      })

      expect(bodyText()).toContain('지난 라운드에 내 기록이 없어요.')
    })
  })
})
