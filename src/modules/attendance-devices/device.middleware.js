import * as service from "./device.service.js";
export default async (req,res,next)=>{try{const key=req.get("x-device-api-key") || (req.get("authorization")||"").replace(/^Bearer\s+/i,""); req.device=await service.authenticateDevice(key); next()}catch(e){next(e)}};
