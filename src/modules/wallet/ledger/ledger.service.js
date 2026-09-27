import * as repository from "./ledger.repository.js";

export const getEntryByReference = (reference) => repository.findByReference(reference);
export const listLedger = async (companyId, { page = 1, limit = 20, type, status } = {}) => {
  const where = {};
  if (type) where.type = type;
  if (status) where.status = status;
  const skip = (page - 1) * limit;
  const [entries, total] = await Promise.all([
    repository.list(companyId, { skip, take: limit, where }),
    repository.count(companyId, where),
  ]);
  return { entries, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};
