import { describe, expect, it } from 'vitest'
import { exclusionLine } from '../judgeExclusion'

describe('exclusionLine', () => {
  it('제출 팀과 탈락은 글자로 적는다', () => {
    expect(
      exclusionLine([
        { armband: 'H', reason: '탈락' },
        { armband: 'M', reason: '제출 팀' },
      ]),
    ).toBe('제외 H 탈락 · M 제출 팀')
  })

  it('모드 대상 제한은 수만 적는다', () => {
    expect(
      exclusionLine([
        { armband: 'A', reason: '같은 그룹' },
        { armband: 'E', reason: '같은 그룹' },
        { armband: 'H', reason: '탈락' },
        { armband: 'M', reason: '제출 팀' },
      ]),
    ).toBe('제외 같은 그룹 2팀 · H 탈락 · M 제출 팀')
  })

  it('탈락이 3팀까지는 글자로, 넘으면 수로 적는다', () => {
    const out = (armbands: string[]) => armbands.map((armband) => ({ armband, reason: '탈락' }))
    expect(exclusionLine(out(['A', 'B', 'C']))).toBe('제외 A·B·C 탈락')
    expect(exclusionLine(out(['A', 'B', 'C', 'D']))).toBe('제외 탈락 4팀')
  })

  it('모드가 대상 제한을 부르는 말을 바꿀 수 있다', () => {
    expect(
      exclusionLine([{ armband: 'A', reason: 'X끼리만' }], (reason) =>
        reason === 'X끼리만' ? 'X 아닌' : reason,
      ),
    ).toBe('제외 X 아닌 1팀')
  })

  it('빠진 팀이 없으면 그렇게 적는다', () => {
    expect(exclusionLine([])).toBe('제외한 팀 없음')
  })
})
