import { env } from "../../config/env.js";
import { supabaseStorage } from "./supabase.storage.js";
import { localStorage } from "./local.storage.js";

export const storageProvider = env.STORAGE_PROVIDER === "local" ? localStorage : supabaseStorage;
