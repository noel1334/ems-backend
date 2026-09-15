import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const uploadDirectory = path.resolve(
    process.cwd(),
    "uploads"
);

export const localStorage = {
    async upload(file) {
        await fs.mkdir(
            uploadDirectory,
            {
                recursive: true
            }
        );

        const extension =
            path.extname(file.originalname);

        const fileName =
            `${crypto.randomUUID()}${extension}`;

        const destination =
            path.join(
                uploadDirectory,
                fileName
            );

        await fs.writeFile(
            destination,
            file.buffer
        );

        return {
            fileName: file.originalname,
            storageKey: fileName,
            fileUrl: `/uploads/${fileName}`,
            mimeType: file.mimetype,
            fileSize: file.size
        };
    },

    async delete(storageKey) {
        if (!storageKey) {
            return;
        }

        const filePath =
            path.join(
                uploadDirectory,
                storageKey
            );

        try {
            await fs.unlink(filePath);
        } catch (error) {
            if (error.code !== "ENOENT") {
                throw error;
            }
        }
    }
}; 