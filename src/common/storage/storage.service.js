export const storageProvider = {
    async upload() {
        throw new Error(
            "Storage provider has not been configured"
        );
    },

    async delete() {
        throw new Error(
            "Storage provider has not been configured"
        );
    }
};
