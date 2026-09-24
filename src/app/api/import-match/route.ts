import { NextResponse } from "next/server";
import { getServerCatalog } from "@/lib/server-catalog";
import { matchAll, type ImportRow } from "@/lib/import/watchlist";

export const runtime = "nodejs";

function cleanRows(value: unknown): ImportRow[] {
  if (!Array.isArray(value)) return [];
  const out: ImportRow[] = [];
  for (const raw of value.slice(0, 10_000)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.slice(0, 500) : "";
    const year = Number.isFinite(Number(row.year)) ? Number(row.year) : undefined;
    const rating = Number.isFinite(Number(row.rating)) ? Number(row.rating) : undefined;
    const tmdbId = Number.isFinite(Number(row.tmdbId)) ? Number(row.tmdbId) : undefined;
    const imdbId = typeof row.imdbId === "string" ? row.imdbId.slice(0, 32) : undefined;
    if (!name && tmdbId === undefined && !imdbId) continue;
    out.push({ name, year, rating, tmdbId, imdbId });
  }
  return out;
}

export async function POST(req: Request) {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > 5_000_000) {
    return NextResponse.json({ error: "request_too_large" }, { status: 413 });
  }

  let body: { rows?: unknown };
  try {
    body = (await req.json()) as { rows?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const rows = cleanRows(body.rows);
  if (rows.length === 0) {
    return NextResponse.json({ matched: [], unmatchedCount: 0 });
  }

  const catalog = (await getServerCatalog()).map((item) => item.title);
  const result = matchAll(rows, catalog);
  return NextResponse.json({
    matched: result.matched.map(({ title, action }) => ({ title, action })),
    unmatchedCount: result.unmatched.length,
  });
}
