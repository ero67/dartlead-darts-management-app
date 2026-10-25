// PostgREST answers every request with at most max_rows rows (1000, see
// supabase/config.toml) and reports success, so `.limit(10000)` silently
// truncates. This pages with `.range()` until a short page. `buildQuery` must
// return a fresh, deterministically ordered query builder on every call.
// shortcut: assumes the server cap is >= PAGE_SIZE; if prod "Max rows" is ever
// lowered below 1000, lower PAGE_SIZE to match or this stops after one page.
export const PAGE_SIZE = 1000;

export async function fetchAllRows(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}
