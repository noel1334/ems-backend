import fs from "node:fs";
import path from "node:path";
const routePath = path.join(process.cwd(), "src/route/index.js");
let source = fs.readFileSync(routePath, "utf8");
if (!source.includes("bankDirectoryRoutes")) {
  const importAnchor = 'import employeeProfileRoutes from "../modules/employees/employee-profile.routes.js";';
  const routeAnchor = 'router.use("/employees", employeeRoutes);';
  if (!source.includes(importAnchor) || !source.includes(routeAnchor)) throw new Error("Could not find route registration anchors; no route changes applied.");
  source = source.replace(importAnchor, `${importAnchor}\nimport bankDirectoryRoutes from "../modules/employees/bank-directory.routes.js";`);
  source = source.replace(routeAnchor, 'router.use("/bank-directory", bankDirectoryRoutes);\n' + routeAnchor);
  fs.writeFileSync(routePath, source);
}
console.log("Bank-directory route registration is present.");
