import { describe, it, expect, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { Participant } from '@/features/waiting-room'
import type { SubmissionRecord } from '../api/submissions'
import RecordDetailSheet from '../components/RecordDetailSheet.vue'

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

function record(overrides: Partial<SubmissionRecord> = {}): SubmissionRecord {
  return {
    id: 'r1',
    uid: 'u3',
    team: 'B',
    round: 2,
    photo: 'data:image/jpeg;base64,killshot',
    status: 'approved',
    createdAtMs: NOW,
    targetTeam: 'A',
    judgedAtMs: NOW,
    ...overrides,
  }
}

/** 이번 라운드(2차) 배정 명단 — 제출 팀 B 2명, 잡힌 팀 A 2명 */
const PARTICIPANTS = [
  participant('u3', 'B'),
  participant('u4', 'B'),
  participant('u1', 'A'),
  participant('u2', 'A'),
]

/** 시트는 포털로 body에 렌더된다 — 포털 마운트를 기다린 뒤 document.body에서 확인한다 */
async function mountSheet(target: SubmissionRecord, participants: Participant[] = PARTICIPANTS) {
  const wrapper = mount(RecordDetailSheet, {
    props: {
      record: target,
      participants,
      assignmentRound: 2,
      nowMs: NOW,
      open: true,
    },
  })
  await flushPromises()
  return wrapper
}

describe('RecordDetailSheet', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('확정 기록은 사진·제출자·잡힌 팀·판정 시각을 보여준다', async () => {
    await mountSheet(record())

    const text = document.body.textContent!
    expect(text).toContain('킬샷 기록')
    expect(text).toContain('라운드 2')
    expect(text).toContain('팀 B · 주황')
    expect(text).toContain('u3')
    expect(text).toContain('확정')
    expect(text).toContain('잡힌 팀')
    expect(text).toContain('팀 A · 파랑')
    expect(text).toContain('방금 판정')
    const photo = document.body.querySelector<HTMLImageElement>('img[alt="제출된 킬샷"]')!
    expect(photo.getAttribute('src')).toBe('data:image/jpeg;base64,killshot')
  })

  it('반려 기록은 잡힌 팀 없이 반려 안내를 보여준다', async () => {
    await mountSheet(record({ status: 'rejected', targetTeam: null }))

    const text = document.body.textContent!
    expect(text).toContain('반려')
    expect(text).toContain('킬로 인정되지 않은 제출이에요.')
    expect(text).not.toContain('잡힌 팀')
  })

  it('라운드가 지난 대기 기록은 판정 없이 지난 제출임을 알린다', async () => {
    await mountSheet(record({ status: 'pending', targetTeam: null, judgedAtMs: null, round: 1 }))

    const text = document.body.textContent!
    expect(text).toContain('대기')
    expect(text).toContain('라운드 1')
    expect(text).toContain('판정되지 않은 채 라운드가 지난 제출이에요.')
    expect(text).not.toContain('판정 확정')
  })

  it('이번 라운드 기록은 제출 팀과 잡힌 팀의 팀원 구성을 모두 보여준다', async () => {
    await mountSheet(record())

    const text = document.body.textContent!
    expect(text).toContain('팀원 u3 · u4')
    expect(text).toContain('팀원 u1 · u2')
  })

  it('이번 라운드에 배정되지 않은 참가자의 잔존 완장은 팀원에 섞이지 않는다', async () => {
    await mountSheet(record(), [...PARTICIPANTS, { ...participant('u9', 'B'), assignedRound: 1 }])

    expect(document.body.textContent!).toContain('팀원 u3 · u4')
    expect(document.body.textContent!).not.toContain('u9')
  })

  it('지난 라운드 기록은 팀원 구성 대신 남아 있지 않다고 알린다', async () => {
    await mountSheet(record({ round: 1 }))

    const text = document.body.textContent!
    expect(text).toContain('지난 라운드의 팀원 구성은 남아 있지 않아요.')
    expect(text).not.toContain('팀원 u3')
  })
})
