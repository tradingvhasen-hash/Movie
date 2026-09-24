import { NextResponse } from "next/server";
import { getServerCatalog } from "@/lib/server-catalog";
import { resolveSeeds } from "@/lib/data/taste-seeds";

export const runtime = "nodejs";

export async function GET() {
  const pool = (await getServerCatalog()).map((item) => item.title);
  return NextResponse.json({ titles: resolveSeeds(pool, 48) });
}
