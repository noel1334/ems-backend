import { APP } from "../constants/app.constants.js";

export function getPagination(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || APP.DEFAULT_PAGE);
  const limit = Math.min(APP.MAX_PAGE_SIZE, Math.max(1, Number.parseInt(query.limit, 10) || APP.DEFAULT_PAGE_SIZE));
  return { page, limit, skip: (page - 1) * limit };
}

export function getPaginationMeta({ page, limit, total }) {
  const totalPages = Math.ceil(total / limit);
  return { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 };
}
