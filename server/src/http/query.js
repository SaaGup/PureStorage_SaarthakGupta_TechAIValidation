// Validates list query parameters. Unknown sort fields are rejected (400)
// rather than ignored, so typos surface immediately.
import { badRequest } from "./errors.js";

export function parseListQuery(query, { sortable, defaultSort, defaultOrder = "desc" }) {
  const page = Number(query.page ?? 1);
  const pageSize = Number(query.pageSize ?? 25);
  const sort = String(query.sort ?? defaultSort);
  const order = String(query.order ?? defaultOrder).toLowerCase();
  const search = String(query.search ?? "").trim().toLowerCase();

  if (!Number.isInteger(page) || page < 1) throw badRequest("page must be a positive integer");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw badRequest("pageSize must be 1-100");
  if (!sortable.includes(sort)) throw badRequest(`sort must be one of: ${sortable.join(", ")}`);
  if (!["asc", "desc"].includes(order)) throw badRequest("order must be asc or desc");
  if (search.length > 100) throw badRequest("search is too long");

  return { page, pageSize, sort, order, search };
}

// Sorts (nulls last), then slices one page.
export function sortAndPage(items, { sort, order, page, pageSize }) {
  const dir = order === "asc" ? 1 : -1;
  const sorted = [...items].sort((a, b) => {
    const x = a[sort];
    const y = b[sort];
    if (x === y) return a.report_id.localeCompare(b.report_id);
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    return (typeof x === "string" ? x.localeCompare(y) : x - y) * dir;
  });
  const start = (page - 1) * pageSize;
  return {
    items: sorted.slice(start, start + pageSize),
    page, pageSize, total: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
  };
}