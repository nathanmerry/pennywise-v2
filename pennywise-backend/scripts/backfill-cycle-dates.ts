/**
 * Backfill script: populate `cycleStartDate` and `cycleEndDate` on BudgetMonth
 * rows from the legacy `paydayDate` column.
 *
 * Old semantics: `paydayDate` was the LAST day of the cycle (inclusive).
 * The cycle ran (prevPayday, paydayDate] = prevPayday+1 → paydayDate inclusive.
 *
 * New semantics: explicit `cycleStartDate` (inclusive) and `cycleEndDate` (inclusive).
 *
 * Per-row mapping:
 *   - cycleEndDate   = paydayDate
 *   - cycleStartDate = (previous BudgetMonth's paydayDate + 1 day) if a previous row exists
 *                      otherwise (paydayDate - 1 month + 1 day) — same heuristic the old
 *                      cycle service used when no prior row was available.
 *
 * Idempotent: rows that already have both new fields set are skipped.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function addDaysLocal(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, 0, 0, 0, 0);
}

function subtractMonthsPreservingDay(d: Date, months: number): Date {
  return startOfLocalDay(
    new Date(d.getFullYear(), d.getMonth() - months, d.getDate())
  );
}

async function main() {
  const months = await prisma.budgetMonth.findMany({
    orderBy: { month: "asc" },
    select: {
      id: true,
      month: true,
      paydayDate: true,
      cycleStartDate: true,
      cycleEndDate: true,
    },
  });

  console.log(`Found ${months.length} BudgetMonth row(s).`);

  // Index by month for previous-cycle lookup.
  const byMonth = new Map<string, (typeof months)[number]>();
  for (const m of months) byMonth.set(m.month, m);

  let updated = 0;
  let skipped = 0;
  let missingPayday = 0;

  for (const m of months) {
    if (m.cycleStartDate && m.cycleEndDate) {
      skipped += 1;
      continue;
    }
    if (!m.paydayDate) {
      console.warn(`  ${m.month}: no paydayDate, cannot backfill — skipping.`);
      missingPayday += 1;
      continue;
    }

    const payday = startOfLocalDay(new Date(m.paydayDate));
    const cycleEndDate = payday;

    // Previous cycle's payday = previous BudgetMonth's paydayDate (if present in DB);
    // otherwise fall back to the (paydayDate - 1 month) heuristic.
    const [year, monthNum] = m.month.split("-").map(Number);
    const prevYear = monthNum === 1 ? year - 1 : year;
    const prevMonthNum = monthNum === 1 ? 12 : monthNum - 1;
    const prevKey = `${prevYear}-${String(prevMonthNum).padStart(2, "0")}`;
    const prev = byMonth.get(prevKey);

    let prevPayday: Date;
    if (prev?.paydayDate) {
      prevPayday = startOfLocalDay(new Date(prev.paydayDate));
    } else {
      prevPayday = subtractMonthsPreservingDay(payday, 1);
    }
    const cycleStartDate = addDaysLocal(prevPayday, 1);

    await prisma.budgetMonth.update({
      where: { id: m.id },
      data: { cycleStartDate, cycleEndDate },
    });

    console.log(
      `  ${m.month}: start=${cycleStartDate.toISOString().slice(0, 10)} end=${cycleEndDate.toISOString().slice(0, 10)}`
    );
    updated += 1;
  }

  console.log(
    `\nDone. updated=${updated} skipped=${skipped} missingPayday=${missingPayday}`
  );

  // Verify nothing is left without the new fields populated.
  const stillNull = await prisma.budgetMonth.count({
    where: {
      OR: [{ cycleStartDate: null }, { cycleEndDate: null }],
    },
  });
  if (stillNull > 0) {
    console.warn(
      `\nWARNING: ${stillNull} row(s) still have a null cycleStartDate or cycleEndDate.`
    );
    console.warn(
      "These rows must be fixed before making the columns NOT NULL in the schema."
    );
  } else {
    console.log("\nAll rows have cycleStartDate and cycleEndDate populated.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
