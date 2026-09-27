import { z } from "zod";

export const processAttendanceRangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  employeeId: z.string().uuid().optional(),
});
