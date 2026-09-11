import app from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import logger from "./config/logger.js";

const startServer = async () => {
  try {
    await connectDatabase();

    const server = app.listen(env.PORT, () => {
      logger.info(`EMS API running on port ${env.PORT}`);

      logger.info(`Environment: ${env.NODE_ENV}`);
    });

    const shutdown = async (signal) => {
      logger.info(`${signal} received. Shutting down...`);

      server.close(async () => {
        await disconnectDatabase();

        logger.info("Database disconnected");
        logger.info("Server shut down successfully");

        process.exit(0);
      });
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    logger.error(error, "Failed to start EMS server");

    process.exit(1);
  }
};

startServer();
