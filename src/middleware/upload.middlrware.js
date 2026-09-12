import multer from "multer";

const allowedMimeTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

const fileFilter = (
    req,
    file,
    callback
) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
        return callback(
            new Error(
                "Unsupported file type"
            ),
            false
        );
    }

    callback(null, true);
};

export const uploadSingle = (
    fieldName
) =>
    multer({
        storage: multer.memoryStorage(),

        limits: {
            fileSize:
                5 * 1024 * 1024
        },

        fileFilter
    }).single(fieldName);