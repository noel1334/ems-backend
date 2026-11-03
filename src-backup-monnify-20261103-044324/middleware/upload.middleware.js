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

export const validateUploadedFileContent = (file) => {
    if (!file?.buffer) return false;
    const b = file.buffer;
    if (file.mimetype === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    if (file.mimetype === "image/png") return b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    if (file.mimetype === "application/pdf") return b.subarray(0,5).toString() === "%PDF-";
    if (file.mimetype === "image/webp") return b.subarray(0,4).toString() === "RIFF" && b.subarray(8,12).toString() === "WEBP";
    return true;
};
