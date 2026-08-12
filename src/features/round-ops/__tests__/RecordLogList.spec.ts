import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import type { GameModeId } from '@/features/game-mode'
import type { Participant } from '@/features/waiting-room'
import type { SubmissionRecord } from '../api/submissions'
import RecordLogList from '../components/RecordLogList.vue'

const NOW = new Date('2026-07-25T19:20:00Z').getTime()

function participant(id: string, team: string): Participant {
  return {
    id,
    name: id,
    team,
    assignedRound: 2,
    gender: null,
    isXTeam: false,
    sameGenderStreak: 0,
    previousPartnerIds: [],
    isReady: true,
  }
}

function record(id: string, overrides: Partial<SubmissionRecord> = {}): SubmissionRecord {
  return {
    id,
    uid: 'u3',
    team: 'B',
    round: 2,
    photo: 'data:image/jpeg;base64,killshot',
    status: 'pending',
    createdAtMs: NOW,
    targetTeam: null,
    judgedAtMs: null,
    ...overrides,
  }
}

function mountList(records: SubmissionRecord[], roundModes?: Record<string, GameModeId>) {
  return mount(RecordLogList, {
    props: {
      records,
      participants: [participant('u1', 'A'), participant('u3', 'B')],
      nowMs: NOW,
      roundModes,
    },
  })
}

/** 라운드 구분선(h3)만 뽑는다 — 라운드 필터 칩도 '라운드 N'을 쓰므로 요소로 구분한다 */
function roundDividers(wrapper: ReturnType<typeof mountList>): string[] {
  return wrapper.findAll('h3').map((divider) => divider.text())
}

describe('RecordLogList', () => {
  it('라운드 구분선과 함께 나열하고 표시 중인 건수를 보여준다', () => {
    const wrapper = mountList([
      record('r2', { round: 2 }),
      record('r1', { round: 1, status: 'rejected', judgedAtMs: NOW }),
    ])

    const text = wrapper.text()
    expect(text).toContain('2건')
    expect(text).toContain('라운드 2')
    expect(text).toContain('라운드 1')
    // 최신 라운드가 위 — api 정렬 순서를 그대로 그린다
    expect(text.indexOf('라운드 2')).toBeLessThan(text.indexOf('라운드 1'))
    expect(text).toContain('u3')
    expect(text).toContain('방금 제출')
  })

  /**
   * "라운드 3"만으로는 그 라운드가 그룹전이었는지 왕잡기였는지 되짚을 수 없다 — 방 문서의
   * 차수 → 모드 이력(roundModes)이 있으면 구분선에 함께 적는다.
   */
  it('라운드 구분선에 그 차수의 확정 모드를 병기하고, 이력이 없는 차수는 예전 라벨을 지킨다', () => {
    const records = [record('r2', { round: 2 }), record('r1', { round: 1 })]

    // 라운드 2만 이력이 있는 방 — 필터 칩 라벨(좁아서 모드 미포함)은 그대로 둔다
    const withHistory = mountList(records, { 2: 'king-hunt' })
    expect(roundDividers(withHistory)).toEqual(['라운드 2 · 왕잡기', '라운드 1'])
    expect(withHistory.find('[data-round="2"]').text()).toBe('라운드 2')

    // 이력을 남기기 전에 확정된 기존 방
    expect(roundDividers(mountList(records))).toEqual(['라운드 2', '라운드 1'])
  })

  it('확정 건은 제출 팀 → 잡힌 팀을 병기한다 — 색+라벨 규칙', () => {
    const wrapper = mountList([
      record('r1', { status: 'approved', targetTeam: 'A', judgedAtMs: NOW }),
    ])

    expect(wrapper.text()).toContain('팀 B · 주황')
    expect(wrapper.text()).toContain('팀 A · 파랑')
    expect(wrapper.find('button[data-record="r1"]').text()).toContain('확정')
  })

  it('상태 필터로 반려만 남긴다', async () => {
    const wrapper = mountList([
      record('approved-1', { status: 'approved', targetTeam: 'A', judgedAtMs: NOW }),
      record('rejected-1', { status: 'rejected', judgedAtMs: NOW }),
    ])

    await wrapper.find('[data-value="rejected"]').trigger('click')

    expect(wrapper.find('button[data-record="rejected-1"]').exists()).toBe(true)
    expect(wrapper.find('button[data-record="approved-1"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('1건')
  })

  it('라운드 필터 칩은 라운드가 2개 이상일 때만 보이고 선택한 라운드만 남긴다', async () => {
    const singleRound = mountList([record('r1', { round: 2 })])
    expect(singleRound.find('[data-round]').exists()).toBe(false)

    const wrapper = mountList([
      record('round2', { round: 2 }),
      record('round1', { round: 1 }),
    ])

    await wrapper.find('[data-round="1"]').trigger('click')

    expect(wrapper.find('button[data-record="round1"]').exists()).toBe(true)
    expect(wrapper.find('button[data-record="round2"]').exists()).toBe(false)
  })

  it('조건에 맞는 기록이 없으면 필터 빈 상태를 보여준다', async () => {
    const wrapper = mountList([
      record('approved-1', { status: 'approved', targetTeam: 'A', judgedAtMs: NOW }),
    ])

    await wrapper.find('[data-value="rejected"]').trigger('click')

    expect(wrapper.text()).toContain('조건에 맞는 기록이 없어요.')
  })

  it('기록이 아예 없으면 빈 상태 안내를 보여준다', () => {
    const wrapper = mountList([])

    expect(wrapper.text()).toContain('아직 기록이 없어요.')
  })

  it('행을 누르면 해당 기록으로 select를 낸다', async () => {
    const target = record('r1', { status: 'approved', targetTeam: 'A', judgedAtMs: NOW })
    const wrapper = mountList([target])

    await wrapper.find('button[data-record="r1"]').trigger('click')

    expect(wrapper.emitted('select')).toEqual([[target]])
  })
})
