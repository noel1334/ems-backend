import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { successResponse } from "../../common/utils/response.js";
import {
  getAuthenticatedSession,
  getAuthenticatedUser,
} from "./auth.service.js";
import { mapAuthResponse, mapAuthUser } from "./auth.mapper.js";

export const authHealth = asyncHandler(async (req, res) => {
  return successResponse(res, {
    message: "Authentication module is available",
    data: {
      module: "authentication",
      status: "ready",
    },
  });
});

export const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await getAuthenticatedUser(req.user.id);

  const session = req.user.sessionId
    ? await getAuthenticatedSession(req.user.sessionId)
    : null;

  return successResponse(res, {
    message: "Authenticated user retrieved successfully",
    data: {
      user: mapAuthUser(user),
      session: session
        ? mapAuthResponse({
            user,
            company: user.company,
            session,
          }).session
        : null,
    },
  });
});
