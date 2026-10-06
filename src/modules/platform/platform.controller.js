import { asyncHandler } from "../../common/utils/asyncHandler.js";import * as s from "./platform.service.js";import {createTenantSchema,updateTenantSchema} from "./platform.validation.js";
export const tenants=asyncHandler(async(req,res)=>res.json({success:true,data:{items:await s.listTenants(req.query)}}));
export const tenant=asyncHandler(async(req,res)=>res.json({success:true,data:await s.getTenant(req.params.id)}));
export const create=asyncHandler(async(req,res)=>res.status(201).json({success:true,data:await s.createTenant(req.user.userId,createTenantSchema.parse(req.body),{ipAddress:req.ip,userAgent:req.get("user-agent")})}));
export const update=asyncHandler(async(req,res)=>res.json({success:true,data:await s.updateTenant(req.user.userId,req.params.id,updateTenantSchema.parse(req.body),{ipAddress:req.ip,userAgent:req.get("user-agent")})}));
export const audit=asyncHandler(async(req,res)=>res.json({success:true,data:{items:await s.listPlatformAudit(req.query)}}));
