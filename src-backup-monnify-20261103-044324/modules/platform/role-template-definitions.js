const rule = (module, resource, ...actions) => ({ module, resource, actions });
const read = (module, resource) => rule(module, resource, "READ");
const coreStaff = [read("dashboard", "dashboard"), read("employees", "employee-profile"), read("employees", "employees"), read("attendance", "attendance"), rule("leave", "requests", "CREATE", "READ"), read("payroll", "payslips")];
const hrManager = [
  rule("dashboard", "dashboard", "READ"), rule("users", "users", "READ", "CREATE", "UPDATE"),
  rule("departments", "departments", "READ", "CREATE", "UPDATE"), rule("designations", "designations", "READ", "CREATE", "UPDATE"),
  rule("employees", "employees", "READ", "CREATE", "UPDATE", "MANAGE"), rule("employees", "employee-profile", "READ", "UPDATE"),
  rule("attendance", "attendance", "READ", "CREATE", "UPDATE", "MANAGE"), rule("leave", "requests", "READ", "UPDATE", "APPROVE"),
  rule("leave", "types", "READ", "CREATE", "UPDATE"), rule("leave", "entitlements", "READ", "MANAGE"),
  rule("scheduling", "policies", "READ", "CREATE", "UPDATE"), rule("scheduling", "generations", "READ", "CREATE", "APPROVE"),
  rule("schedules", "schedule", "READ", "CREATE", "UPDATE"), rule("shifts", "shift", "READ", "CREATE", "UPDATE"),
  rule("holidays", "holiday", "READ", "CREATE", "UPDATE"), rule("reports", "reports", "READ", "EXPORT"), read("audit", "audit"),
];
const payrollOfficer = [read("dashboard", "dashboard"), read("employees", "employee-profile"), rule("payroll", "runs", "READ", "CREATE", "UPDATE", "DELETE", "APPROVE"), rule("payroll", "salaries", "READ", "CREATE", "UPDATE"), rule("payroll", "structures", "READ", "CREATE", "UPDATE"), read("payroll", "payslips"), rule("wallet", "wallet", "READ"), rule("payments", "payments", "READ", "MANAGE"), rule("reports", "reports", "READ", "EXPORT"), read("audit", "audit")];
const storekeeper = [read("dashboard", "dashboard"), read("employees", "employee-profile"), ...["inventory", "transactions", "ledger", "locations", "suppliers"].map((resource) => rule("inventory", resource, ...(resource === "ledger" ? ["READ"] : ["READ", "CREATE", "UPDATE", "MANAGE", ...(resource === "transactions" ? ["APPROVE"] : [])])))];
const shiftSupervisor = [read("dashboard", "dashboard"), read("employees", "employees"), read("attendance", "attendance"), rule("scheduling", "generations", "READ", "CREATE"), rule("scheduling", "policies", "READ"), rule("schedules", "schedule", "READ", "CREATE", "UPDATE"), rule("shifts", "shift", "READ", "CREATE", "UPDATE"), read("leave", "requests"), read("reports", "reports")];
const operationalManager = [read("dashboard", "dashboard"), rule("employees", "employees", "READ", "CREATE", "UPDATE"), read("employees", "employee-profile"), rule("attendance", "attendance", "READ", "CREATE", "UPDATE"), rule("scheduling", "generations", "READ", "CREATE", "APPROVE"), rule("scheduling", "policies", "READ", "CREATE", "UPDATE"), rule("schedules", "schedule", "READ", "CREATE", "UPDATE"), rule("shifts", "shift", "READ", "CREATE", "UPDATE"), ...["inventory", "transactions", "ledger", "locations", "suppliers"].map((resource) => rule("inventory", resource, ...(resource === "ledger" ? ["READ"] : ["READ", "CREATE", "UPDATE", ...(resource === "transactions" ? ["APPROVE"] : [])]))), rule("reports", "reports", "READ", "EXPORT")];
const medicalDirector = [read("dashboard", "dashboard"), read("employees", "employees"), read("attendance", "attendance"), read("schedules", "schedule"), read("scheduling", "generations"), read("leave", "requests"), read("reports", "reports")];
const principal = [read("dashboard", "dashboard"), read("employees", "employees"), read("attendance", "attendance"), read("schedules", "schedule"), read("leave", "requests"), read("reports", "reports")];

export const INDUSTRY_ROLE_TEMPLATES = [
  { key: "healthcare-admin", industry: "HEALTHCARE", name: "Hospital Operations Manager", description: "Coordinate workforce records, attendance, leave, shifts and permitted inventory operations.", rules: operationalManager },
  { key: "healthcare-hr", industry: "HEALTHCARE", name: "Healthcare HR Manager", description: "Manage staff lifecycle, attendance, leave workflows and workforce reporting.", rules: hrManager },
  { key: "healthcare-director", industry: "HEALTHCARE", name: "Medical Director", description: "View workforce and shift coverage summaries. This template does not grant access to patient clinical records.", rules: medicalDirector },
  { key: "healthcare-clinical-staff", industry: "HEALTHCARE", name: "Clinical Staff", description: "A least-privilege starting point for staff profile, attendance, leave and payslip access.", rules: coreStaff },
  { key: "healthcare-pharmacy-store", industry: "HEALTHCARE", name: "Pharmacy Storekeeper", description: "Manage permitted stock, receipts, locations and inventory issue or return confirmations.", rules: storekeeper },
  { key: "healthcare-payroll", industry: "HEALTHCARE", name: "Payroll Officer", description: "Work on permitted payroll, salary, payment and payroll reporting features.", rules: payrollOfficer },
  { key: "manufacturing-plant", industry: "MANUFACTURING", name: "Plant Operations Manager", description: "Coordinate shift scheduling, attendance, employees, inventory and operations reports.", rules: operationalManager },
  { key: "manufacturing-production", industry: "MANUFACTURING", name: "Production Supervisor", description: "View workers, attendance and schedules and maintain shift plans within granted permissions.", rules: shiftSupervisor },
  { key: "manufacturing-store", industry: "MANUFACTURING", name: "Storekeeper", description: "Manage stock, locations, suppliers and employee issue or return workflows.", rules: storekeeper },
  { key: "manufacturing-hr", industry: "MANUFACTURING", name: "HR Manager", description: "Manage employee records, HR workflows and workforce reporting.", rules: hrManager },
  { key: "manufacturing-payroll", industry: "MANUFACTURING", name: "Payroll Officer", description: "Manage permitted payroll, salary and payment operations.", rules: payrollOfficer },
  { key: "education-school-admin", industry: "EDUCATION", name: "School Operations Manager", description: "Manage workforce administration, schedules, leave and operational reports.", rules: hrManager },
  { key: "education-principal", industry: "EDUCATION", name: "Principal", description: "View staff, attendance, schedule, leave and workforce reporting information.", rules: principal },
  { key: "education-teacher", industry: "EDUCATION", name: "Teacher / Faculty", description: "Access personal workforce, attendance, leave and payslip features.", rules: coreStaff },
  { key: "education-store", industry: "EDUCATION", name: "School Supplies Storekeeper", description: "Manage school supplies and permitted issue, return and stock records.", rules: storekeeper },
  { key: "education-bursar", industry: "EDUCATION", name: "Bursar / Payroll Officer", description: "Work with permitted payroll and payment features; this does not grant banking permissions outside EMS.", rules: payrollOfficer },
  { key: "construction-site", industry: "CONSTRUCTION", name: "Site Manager", description: "Coordinate teams, attendance, shifts, schedules, inventory and site workforce reporting.", rules: operationalManager },
  { key: "construction-supervisor", industry: "CONSTRUCTION", name: "Site Supervisor", description: "Monitor workers and attendance and maintain permitted shift schedules.", rules: shiftSupervisor },
  { key: "construction-store", industry: "CONSTRUCTION", name: "Materials Storekeeper", description: "Manage material inventory, suppliers, locations and issue or return workflows.", rules: storekeeper },
  { key: "hospitality-ops", industry: "HOSPITALITY", name: "Hotel Operations Manager", description: "Coordinate staffing, shifts, attendance, leave and inventory operations.", rules: operationalManager },
  { key: "hospitality-supervisor", industry: "HOSPITALITY", name: "Department Supervisor", description: "View assigned workforce and maintain permitted attendance and shift workflows.", rules: shiftSupervisor },
  { key: "hospitality-hr", industry: "HOSPITALITY", name: "Hospitality HR Manager", description: "Manage employee administration, leave and workforce reports.", rules: hrManager },
  { key: "retail-manager", industry: "RETAIL", name: "Retail Store Manager", description: "Coordinate employees, attendance, schedules and day-to-day inventory.", rules: operationalManager },
  { key: "retail-stock", industry: "RETAIL", name: "Inventory Controller", description: "Maintain permitted stock, locations, suppliers and transaction records.", rules: storekeeper },
  { key: "logistics-ops", industry: "LOGISTICS", name: "Logistics Operations Supervisor", description: "Coordinate workforce attendance, rotating schedules and inventory records. Fleet-specific permissions are not included unless the backend catalogue provides them.", rules: operationalManager },
  { key: "logistics-hr", industry: "LOGISTICS", name: "Workforce Coordinator", description: "View staff and attendance and coordinate permitted shifts and leave workflows.", rules: shiftSupervisor },
  { key: "agriculture-farm-manager", industry: "AGRICULTURE", name: "Farm Operations Manager", description: "Coordinate workforce, attendance, seasonal schedules, leave and permitted stock records.", rules: operationalManager },
  { key: "agriculture-store", industry: "AGRICULTURE", name: "Farm Supplies Storekeeper", description: "Manage permitted agricultural supplies, inventory locations, suppliers and issue or return workflows.", rules: storekeeper },
  { key: "agriculture-workforce", industry: "AGRICULTURE", name: "Farm Workforce Supervisor", description: "Monitor worker attendance and coordinate permitted shifts and workforce reports.", rules: shiftSupervisor },
  { key: "technology-operations", industry: "TECHNOLOGY", name: "Technology Operations Manager", description: "Manage permitted workforce operations, schedules, leave and operational reports.", rules: operationalManager },
  { key: "technology-hr", industry: "TECHNOLOGY", name: "Technology HR Manager", description: "Manage employee administration, leave, attendance, scheduling and workforce reports.", rules: hrManager },
  { key: "technology-team-lead", industry: "TECHNOLOGY", name: "Engineering Team Lead", description: "Coordinate workforce attendance and schedules without granting access to source-code repositories or production infrastructure.", rules: shiftSupervisor },
  { key: "professional-services-ops", industry: "PROFESSIONAL_SERVICES", name: "Professional Services Operations Manager", description: "Coordinate teams, attendance, work schedules, leave and organization reporting.", rules: operationalManager },
  { key: "professional-services-hr", industry: "PROFESSIONAL_SERVICES", name: "People / HR Manager", description: "Manage employee lifecycle, attendance, leave and workforce reporting.", rules: hrManager },
  { key: "professional-services-finance", industry: "PROFESSIONAL_SERVICES", name: "Finance and Payroll Officer", description: "Manage permitted payroll and payment workflows and financial reporting.", rules: payrollOfficer },
  { key: "energy-operations", industry: "ENERGY", name: "Energy Operations Supervisor", description: "Coordinate staff, shift attendance, leave, schedules and operational reporting.", rules: operationalManager },
  { key: "real-estate-operations", industry: "REAL_ESTATE", name: "Property Operations Manager", description: "Manage workforce administration, attendance, schedules, leave and operations reporting.", rules: operationalManager },
  { key: "telecom-workforce", industry: "TELECOMMUNICATIONS", name: "Telecommunications Workforce Manager", description: "Coordinate employee administration, attendance and schedules. This template does not grant network-management permissions.", rules: operationalManager },
  { key: "media-team-lead", industry: "MEDIA", name: "Media Team Supervisor", description: "Coordinate employee attendance, schedules, leave and workforce reports.", rules: shiftSupervisor },
  { key: "security-operations", industry: "SECURITY", name: "Security Operations Manager", description: "Coordinate guard teams, rotating schedules, attendance and permitted inventory workflows.", rules: operationalManager },
  { key: "mining-operations", industry: "MINING", name: "Mining Operations Supervisor", description: "Coordinate workforce, shift attendance, leave, inventory and operations reports.", rules: operationalManager },
  { key: "utilities-workforce", industry: "UTILITIES", name: "Utilities Workforce Manager", description: "Manage workforce administration, attendance, schedules, leave and operational reports.", rules: operationalManager },
  { key: "finance-manager", industry: "FINANCE", name: "Finance Manager", description: "Manage allowed payroll runs, salaries, payments, wallet reporting and financial reports.", rules: payrollOfficer },
  { key: "finance-hr", industry: "FINANCE", name: "HR Manager", description: "Manage employee records, attendance, leave and workforce reporting.", rules: hrManager },
  { key: "ngo-operations", industry: "NGO", name: "Programme Operations Manager", description: "Coordinate staff, attendance, schedules, leave and organizational reports.", rules: hrManager },
  { key: "ngo-staff", industry: "NGO", name: "Staff Member", description: "Access own workforce, attendance, leave and payslip features.", rules: coreStaff },
  { key: "corporate-hr", industry: "CORPORATE", name: "HR Manager", description: "Manage employee administration, leave, attendance, scheduling and workforce reporting.", rules: hrManager },
  { key: "corporate-finance", industry: "CORPORATE", name: "Payroll Officer", description: "Manage permitted payroll, salary, payment and financial report workflows.", rules: payrollOfficer },
  { key: "corporate-store", industry: "CORPORATE", name: "Storekeeper", description: "Manage permitted inventory stock, suppliers, locations and transactions.", rules: storekeeper },
  { key: "corporate-supervisor", industry: "CORPORATE", name: "Team Supervisor", description: "Monitor workforce attendance and maintain permitted team schedules.", rules: shiftSupervisor },
];

export function permissionMatchesRules(permission, rules = []) {
  return rules.some((candidate) => candidate.module === permission.module && (!candidate.resource || candidate.resource === permission.resource) && candidate.actions.includes(permission.action));
}
