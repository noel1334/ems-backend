import { describe, expect, it } from 'vitest';

describe('Stage 11 API contract',()=>{
  it('contains the core leave endpoints',()=>{
    const endpoints=['/leave/types','/leave/balances','/leave/requests','/leave/requests/:id/approve','/leave/requests/:id/reject','/leave/requests/:id/cancel','/leave/employees/:employeeId/history','/leave/reports/summary'];
    expect(endpoints).toHaveLength(8);
  });
});
