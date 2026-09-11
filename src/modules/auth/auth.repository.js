import prisma from "../../config/database.js";

export const findUserByEmail = async (email, tx = prisma) =>
  tx.user.findFirst({
    where: {
      email: email.toLowerCase(),
    },
    include: {
      company: true,
      roles: {
        include: {
          role: true,
        },
      },
    },
  });

export const findUserById = async (userId, tx = prisma) =>
  tx.user.findUnique({
    where: {
      id: userId,
    },
    include: {
      company: true,
      roles: {
        include: {
          role: true,
        },
      },
    },
  });

export const findRoleByName = async (name, tx = prisma) =>
  tx.role.findFirst({
    where: {
      name,
      isActive: true,
    },
  });

export const findSessionById = async (sessionId, tx = prisma) =>
  tx.userSession.findUnique({
    where: {
      id: sessionId,
    },
    include: {
      user: {
        include: {
          company: true,
          roles: {
            include: {
              role: true,
            },
          },
        },
      },
      company: true,
    },
  });
