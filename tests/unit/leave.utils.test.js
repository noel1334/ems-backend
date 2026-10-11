import { describe, expect, it } from 'vitest';
import { dateRange, dayOfWeekForPrisma } from '../../src/modules/leave/leave.utils.js';

describe('leave utilities',()=>{
  it('returns an inclusive date range',()=>expect(dateRange(new Date('2026-01-01'),new Date('2026-01-03'))).toHaveLength(3));
  it('maps Sunday to 7',()=>expect(dayOfWeekForPrisma(new Date('2026-01-04'))).toBe(7));
  it('maps Monday to 1',()=>expect(dayOfWeekForPrisma(new Date('2026-01-05'))).toBe(1));
});
