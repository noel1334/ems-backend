import {
  calculatePayrollTotals,
  money,
  toDecimal,
} from "./payroll.calculation.js";

/**
 * Convert Decimal/date values into API-safe values.
 */
const decimalToString = (value) => {
  return toDecimal(value).toFixed(2);
};

const dateToISO = (value) => {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
};

/**
 * Map a payroll structure component.
 */
export const mapPayrollComponent = (component) => {
  if (!component) {
    return null;
  }

  return {
    id: component.id,
    structureId: component.structureId,
    name: component.name,
    code: component.code,
    type: component.type,
    calculation: component.calculation,
    amount: decimalToString(component.amount),
    percentage: component.percentage
      ? decimalToString(component.percentage)
      : null,
    isTaxable: component.isTaxable,
    isPensionable: component.isPensionable,
    isActive: component.isActive,
    createdAt: dateToISO(component.createdAt),
    updatedAt: dateToISO(component.updatedAt),
  };
};

/**
 * Map payroll structure.
 */
export const mapPayrollStructure = (structure) => {
  if (!structure) {
    return null;
  }

  return {
    id: structure.id,
    companyId: structure.companyId,
    name: structure.name,
    code: structure.code,
    description: structure.description,
    isActive: structure.isActive,

    components: Array.isArray(structure.components)
      ? structure.components.map(mapPayrollComponent)
      : [],

    createdAt: dateToISO(structure.createdAt),
    updatedAt: dateToISO(structure.updatedAt),
  };
};

/**
 * Map employee salary assignment.
 */
export const mapEmployeeSalary = (salary) => {
  if (!salary) {
    return null;
  }

  return {
    id: salary.id,
    companyId: salary.companyId,
    employeeId: salary.employeeId,
    structureId: salary.structureId,

    basicSalary: decimalToString(salary.basicSalary),

    effectiveFrom: dateToISO(salary.effectiveFrom),
    effectiveTo: dateToISO(salary.effectiveTo),

    status: salary.status,

    structure: salary.structure ? mapPayrollStructure(salary.structure) : null,

    employee: salary.employee
      ? {
          id: salary.employee.id,
          employeeNumber: salary.employee.employeeNumber,
          firstName: salary.employee.firstName,
          middleName: salary.employee.middleName,
          lastName: salary.employee.lastName,
          email: salary.employee.email,
          departmentId: salary.employee.departmentId,
          designationId: salary.employee.designationId,
        }
      : null,

    createdAt: dateToISO(salary.createdAt),
    updatedAt: dateToISO(salary.updatedAt),
  };
};

/**
 * Map a payroll item line.
 */
export const mapPayrollItemLine = (line) => {
  if (!line) {
    return null;
  }

  return {
    id: line.id,
    payrollItemId: line.payrollItemId,
    name: line.name,
    code: line.code,
    type: line.type,
    amount: decimalToString(line.amount),
    taxable: Boolean(line.taxable),
    pensionable: Boolean(line.pensionable),
    createdAt: dateToISO(line.createdAt),
  };
};

/**
 * Map employee information attached to a payroll item.
 */
const mapPayrollEmployee = (employee) => {
  if (!employee) {
    return null;
  }

  return {
    id: employee.id,
    employeeNumber: employee.employeeNumber,
    firstName: employee.firstName,
    middleName: employee.middleName,
    lastName: employee.lastName,
    email: employee.email,
    phone: employee.phone,
    departmentId: employee.departmentId,
    designationId: employee.designationId,
    employmentStatus: employee.employmentStatus,
    employeeType: employee.employeeType,
  };
};

/**
 * Map one payroll item.
 */
export const mapPayrollItem = (item) => {
  if (!item) {
    return null;
  }

  return {
    id: item.id,

    companyId: item.companyId,
    periodId: item.periodId,
    employeeId: item.employeeId,
    salaryId: item.salaryId,

    basicSalary: decimalToString(item.basicSalary),

    totalEarnings: decimalToString(item.totalEarnings),

    totalDeductions: decimalToString(item.totalDeductions),

    unpaidDays: decimalToString(item.unpaidDays),

    unpaidDeduction: decimalToString(item.unpaidDeduction),

    grossSalary: decimalToString(item.grossSalary),

    netSalary: decimalToString(item.netSalary),

    status: item.status,

    calculatedAt: dateToISO(item.calculatedAt),
    approvedAt: dateToISO(item.approvedAt),

    employee: mapPayrollEmployee(item.employee),

    lines: Array.isArray(item.lines) ? item.lines.map(mapPayrollItemLine) : [],

    salary: item.salary
      ? {
          id: item.salary.id,
          structureId: item.salary.structureId,
          basicSalary: decimalToString(item.salary.basicSalary),
          effectiveFrom: dateToISO(item.salary.effectiveFrom),
          effectiveTo: dateToISO(item.salary.effectiveTo),
          status: item.salary.status,
        }
      : null,

    createdAt: dateToISO(item.createdAt),
    updatedAt: dateToISO(item.updatedAt),
  };
};

/**
 * Map payroll period.
 */
export const mapPayrollPeriod = (period) => {
  if (!period) {
    return null;
  }

  const items = Array.isArray(period.items) ? period.items : [];

  const mappedItems = items.map(mapPayrollItem);

  const totals = calculatePayrollTotals(items);

  return {
    id: period.id,
    companyId: period.companyId,

    name: period.name,

    startDate: dateToISO(period.startDate),
    endDate: dateToISO(period.endDate),
    payDate: dateToISO(period.payDate),

    status: period.status,

    itemCount: mappedItems.length,

    totals: {
      basicSalary: money(totals.basicSalary).toFixed(2),
      totalEarnings: money(totals.totalEarnings).toFixed(2),
      totalDeductions: money(totals.totalDeductions).toFixed(2),
      grossSalary: money(totals.grossSalary).toFixed(2),
      netSalary: money(totals.netSalary).toFixed(2),
      unpaidDays: money(totals.unpaidDays).toFixed(2),
      unpaidDeduction: money(totals.unpaidDeduction).toFixed(2),
    },

    items: mappedItems,

    createdAt: dateToISO(period.createdAt),
    updatedAt: dateToISO(period.updatedAt),
  };
};

/**
 * Lightweight period mapper for list endpoints.
 *
 * Avoids returning every payroll item when the user is
 * simply viewing the list of payroll periods.
 */
export const mapPayrollPeriodSummary = (period) => {
  if (!period) {
    return null;
  }

  const items = Array.isArray(period.items) ? period.items : [];

  const totals = calculatePayrollTotals(items);

  return {
    id: period.id,
    companyId: period.companyId,
    name: period.name,

    startDate: dateToISO(period.startDate),
    endDate: dateToISO(period.endDate),
    payDate: dateToISO(period.payDate),

    status: period.status,

    itemCount: items.length,

    totals: {
      grossSalary: money(totals.grossSalary).toFixed(2),

      totalDeductions: money(totals.totalDeductions).toFixed(2),

      netSalary: money(totals.netSalary).toFixed(2),
    },

    createdAt: dateToISO(period.createdAt),
    updatedAt: dateToISO(period.updatedAt),
  };
};

/**
 * Map payroll list.
 */
export const mapPayrollPeriods = (periods) => {
  return periods.map(mapPayrollPeriodSummary);
};

/**
 * Payslip mapper.
 *
 * A payslip is essentially a presentation-safe payroll item
 * together with the payroll period information.
 */
export const mapPayslip = (item) => {
  if (!item) {
    return null;
  }

  const payrollItem = mapPayrollItem(item);

  return {
    payroll: {
      id: payrollItem.id,
      status: payrollItem.status,
      calculatedAt: payrollItem.calculatedAt,
      approvedAt: payrollItem.approvedAt,
    },

    period: item.period
      ? {
          id: item.period.id,
          name: item.period.name,
          startDate: dateToISO(item.period.startDate),
          endDate: dateToISO(item.period.endDate),
          payDate: dateToISO(item.period.payDate),
          status: item.period.status,
        }
      : null,

    employee: payrollItem.employee,

    salary: {
      basicSalary: payrollItem.basicSalary,
    },

    earnings: payrollItem.lines.filter((line) => line.type === "EARNING"),

    deductions: payrollItem.lines.filter((line) => line.type === "DEDUCTION"),

    totals: {
      totalEarnings: payrollItem.totalEarnings,
      totalDeductions: payrollItem.totalDeductions,
      grossSalary: payrollItem.grossSalary,
      unpaidDays: payrollItem.unpaidDays,
      unpaidDeduction: payrollItem.unpaidDeduction,
      netSalary: payrollItem.netSalary,
    },
  };
};

/**
 * Map payroll report.
 */
export const mapPayrollReport = ({ period, items = [] }) => {
  const totals = calculatePayrollTotals(items);

  return {
    period: period
      ? {
          id: period.id,
          name: period.name,
          startDate: dateToISO(period.startDate),
          endDate: dateToISO(period.endDate),
          payDate: dateToISO(period.payDate),
          status: period.status,
        }
      : null,

    employeeCount: items.length,

    totals: {
      basicSalary: money(totals.basicSalary).toFixed(2),

      totalEarnings: money(totals.totalEarnings).toFixed(2),

      totalDeductions: money(totals.totalDeductions).toFixed(2),

      grossSalary: money(totals.grossSalary).toFixed(2),

      netSalary: money(totals.netSalary).toFixed(2),

      unpaidDays: money(totals.unpaidDays).toFixed(2),

      unpaidDeduction: money(totals.unpaidDeduction).toFixed(2),
    },

    items: items.map(mapPayrollItem),
  };
};
