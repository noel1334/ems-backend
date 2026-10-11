import * as service from "./device.service.js";
export const register = async (req,res,next)=>{try{res.status(201).json({success:true,data:await service.registerDevice(req.user.companyId,req.user.userId,req.body)})}catch(e){next(e)}};
export const heartbeat = async (req,res,next)=>{try{res.json({success:true,data:await service.heartbeat(req.device)})}catch(e){next(e)}};
export const event = async (req,res,next)=>{try{res.json({success:true,data:await service.processRecognitionEvent({device:req.device,input:req.body,ipAddress:req.ip,userAgent:req.get("user-agent")})})}catch(e){next(e)}};

export const rotateCredential = async (req,res,next)=>{try{res.json({success:true,data:await service.rotateCredential(req.user.companyId,req.user.userId,req.params.id,req.params.credentialId)})}catch(e){next(e)}};
