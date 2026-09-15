import Decimal from "decimal.js";

/**
 * Convert any supported numeric value to Decimal.
 */
export const toDecimal = (value) => {
  if (value instanceof Decimal) {
    return value;
  }

  if (value === null || value === undefined || value === "") {
    return new Decimal(0);
  }

  return new Decimal(value);
};

/**
 * Round monetary values to 2 decimal places.
 */
export const money = (value) => {
  return toDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
};

/**
 * Calculate a payroll component amount.
 *
 * Supported calculations:
 * - FIXED
 * - PERCENTAGE_OF_BASIC
 * - PERCENTAGE_OF_GROSS
 * - ATTENDANCE_DEDUCTION
 */
export const calculateComponentAmount = ({
  component,
  basicSalary,
  grossSalary,
  attendanceDeduction = 0,
}) => {
  const basic = toDecimal(basicSalary);
  const gross = toDecimal(grossSalary);

  switch (component.calculation) {
    case "FIXED":
      return money(component.amount);

    case "PERCENTAGE_OF_BASIC":
      return money(basic.mul(toDecimal(component.percentage || 0)).div(100));

    case "PERCENTAGE_OF_GROSS":
      return money(gross.mul(toDecimal(component.percentage || 0)).div(100));

    case "ATTENDANCE_DEDUCTION":
      return money(attendanceDeduction);

    default:
      throw new Error(
        `Unsupported payroll calculation type: ${component.calculation}`
      );
  }
};

/**
 * Calculate unpaid-day deduction.
 *
 * The deduction is based on the calendar days in the payroll period.
 *
 * Example:
 * Gross salary = ₦300,000
 * Period = 30 days
 * Unpaid days = 2
 *
 * Deduction = 300,000 / 30 × 2
 */
export const calculateUnpaidDeduction = ({
  grossSalary,
  unpaidDays,
  periodStart,
  periodEnd,
}) => {
  const gross = toDecimal(grossSalary);
  const days = toDecimal(unpaidDays);

  if (days.lessThanOrEqualTo(0)) {
    return new Decimal(0);
  }

  const start = new Date(periodStart);
  const end = new Date(periodEnd);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Invalid payroll period dates.");
  }

  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  const calendarDays =
    Math.floor((end.getTime() - start.getTime()) / millisecondsPerDay) + 1;

  if (calendarDays <= 0) {
    throw new Error("Payroll period must have valid dates.");
  }

  return money(gross.div(calendarDays).mul(days));
};

/**
 * Calculate complete payroll for one employee.
 *
 * This function intentionally contains NO Prisma/database logic.
 * It is a pure payroll calculation engine.
 */
export const calculatePayrollAmounts = ({
  basicSalary,
  components = [],
  unpaidDays = 0,
  attendanceDeduction = 0,
  periodStart,
  periodEnd,
}) => {
  const basic = money(basicSalary);

  let grossSalary = basic;

  const earnings = [];
  const deductions = [];

  /*
   * Earnings are calculated first because deductions such as
   * percentage-of-gross need the calculated gross amount.
   */
  for (const component of components) {
    if (!component.isActive) {
      continue;
    }

    if (component.type !== "EARNING") {
      continue;
    }

    const amount = calculateComponentAmount({
      component,
      basicSalary: basic,
      grossSalary,
      attendanceDeduction,
    });

    earnings.push({
      name: component.name,
      code: component.code,
      type: "EARNING",
      amount,
      taxable: Boolean(component.isTaxable),
      pensionable: Boolean(component.isPensionable),
    });

    grossSalary = money(grossSalary.add(amount));
  }

  /*
   * Calculate normal payroll deductions.
   */
  let totalDeductions = new Decimal(0);

  for (const component of components) {
    if (!component.isActive) {
      continue;
    }

    if (component.type !== "DEDUCTION") {
      continue;
    }

    const amount = calculateComponentAmount({
      component,
      basicSalary: basic,
      grossSalary,
      attendanceDeduction,
    });

    deductions.push({
      name: component.name,
      code: component.code,
      type: "DEDUCTION",
      amount,
      taxable: Boolean(component.isTaxable),
      pensionable: Boolean(component.isPensionable),
    });

    totalDeductions = totalDeductions.add(amount);
  }

  /*
   * Add unpaid-day deduction separately.
   */
  const unpaidDeduction = calculateUnpaidDeduction({
    grossSalary,
    unpaidDays,
    periodStart,
    periodEnd,
  });

  if (unpaidDeduction.greaterThan(0)) {
    deductions.push({
      name: "Unpaid Days Deduction",
      code: "UNPAID_DAYS",
      type: "DEDUCTION",
      amount: unpaidDeduction,
      taxable: false,
      pensionable: false,
    });

    totalDeductions = totalDeductions.add(unpaidDeduction);
  }

  /*
   * Attendance deduction can be supplied by the attendance
   * calculation layer when required.
   */
  const attendanceAmount = money(attendanceDeduction);

  if (attendanceAmount.greaterThan(0)) {
    const alreadyExists = deductions.some(
      (item) => item.code === "ATTENDANCE_DEDUCTION"
    );

    if (!alreadyExists) {
      deductions.push({
        name: "Attendance Deduction",
        code: "ATTENDANCE_DEDUCTION",
        type: "DEDUCTION",
        amount: attendanceAmount,
        taxable: false,
        pensionable: false,
      });

      totalDeductions = totalDeductions.add(attendanceAmount);
    }
  }

  const netSalary = money(grossSalary.sub(totalDeductions));

  return {
    basicSalary: basic,
    totalEarnings: money(
      earnings.reduce((total, item) => total.add(item.amount), new Decimal(0))
    ),
    totalDeductions: money(totalDeductions),
    unpaidDays: toDecimal(unpaidDays),
    unpaidDeduction,
    grossSalary: money(grossSalary),
    netSalary,
    earnings,
    deductions,
    lines: [...earnings, ...deductions],
  };
};

/**
 * Calculate totals for multiple payroll items.
 */
export const calculatePayrollTotals = (items = []) => {
  return items.reduce(
    (totals, item) => {
      totals.basicSalary = totals.basicSalary.add(toDecimal(item.basicSalary));

      totals.totalEarnings = totals.totalEarnings.add(
        toDecimal(item.totalEarnings)
      );

      totals.totalDeductions = totals.totalDeductions.add(
        toDecimal(item.totalDeductions)
      );

      totals.grossSalary = totals.grossSalary.add(toDecimal(item.grossSalary));

      totals.netSalary = totals.netSalary.add(toDecimal(item.netSalary));

      totals.unpaidDeduction = totals.unpaidDeduction.add(
        toDecimal(item.unpaidDeduction)
      );

      totals.unpaidDays = totals.unpaidDays.add(toDecimal(item.unpaidDays));

      return totals;
    },
    {
      basicSalary: new Decimal(0),
      totalEarnings: new Decimal(0),
      totalDeductions: new Decimal(0),
      grossSalary: new Decimal(0),
      netSalary: new Decimal(0),
      unpaidDeduction: new Decimal(0),
      unpaidDays: new Decimal(0),
    }
  );
};
