import fs from "node:fs";
const required=["src/modules/dashboard/dashboard.service.js","src/modules/dashboard/dashboard.controller.js","src/modules/dashboard/dashboard.routes.js","STAGE26_DASHBOARD.md"];
for(const p of required)if(!fs.existsSync(p))throw new Error(`Missing ${p}`);
if(!fs.readFileSync("src/route/index.js","utf8").includes('router.use("/dashboard", dashboardRoutes)'))throw new Error("Dashboard route not mounted");
console.log("Stage 26 dashboard checks passed");
