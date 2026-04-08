/**
 * Transform script: converts transactions-with-categories.json to backfill format.
 * 
 * Input format:
 *   { description_group, categories, ignore, confidence?, reason? }
 * 
 * Output format:
 *   { normalized_merchant, categoryPaths, ignore }
 * 
 * Run with: npx tsx src/scripts/transform-categories.ts
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SourceEntry {
  description_group: string;
  categories: string[];
  ignore: boolean;
  confidence?: string;
  reason?: string;
}

interface TransformedEntry {
  normalized_merchant: string;
  categoryPaths: string[][];
  ignore: boolean;
}

interface FlaggedEntry extends SourceEntry {
  flagReason: string;
}

function transformCategories(categories: string[]): { paths: string[][] | null; flagReason: string | null } {
  const len = categories.length;

  if (len === 1) {
    // Single category → one root path
    return { paths: [[categories[0]]], flagReason: null };
  }

  if (len === 2) {
    // Two categories → one path [parent, child]
    return { paths: [[categories[0], categories[1]]], flagReason: null };
  }

  if (len === 4) {
    // Four categories → two paths [parent1, child1], [parent2, child2]
    return {
      paths: [
        [categories[0], categories[1]],
        [categories[2], categories[3]],
      ],
      flagReason: null,
    };
  }

  // Odd or unexpected length → flag for manual review
  return { paths: null, flagReason: `Unexpected category count: ${len}` };
}

function main() {
  const projectRoot = path.resolve(__dirname, "../../..");
  const inputPath = path.join(projectRoot, "transactions-with-categories.json");
  const outputPath = path.join(projectRoot, "transactions-with-category-paths.json");
  const flaggedPath = path.join(projectRoot, "transactions-flagged-for-review.json");

  console.log(`Reading from: ${inputPath}`);
  const raw = fs.readFileSync(inputPath, "utf-8");
  const source: SourceEntry[] = JSON.parse(raw);

  console.log(`Found ${source.length} entries to transform`);

  const transformed: TransformedEntry[] = [];
  const flagged: FlaggedEntry[] = [];

  for (const entry of source) {
    const { paths, flagReason } = transformCategories(entry.categories);

    if (flagReason || !paths) {
      flagged.push({ ...entry, flagReason: flagReason || "Unknown error" });
    } else {
      transformed.push({
        normalized_merchant: entry.description_group,
        categoryPaths: paths,
        ignore: entry.ignore,
      });
    }
  }

  // Write transformed output
  fs.writeFileSync(outputPath, JSON.stringify(transformed, null, 2));
  console.log(`✓ Wrote ${transformed.length} entries to: ${outputPath}`);

  // Write flagged entries if any
  if (flagged.length > 0) {
    fs.writeFileSync(flaggedPath, JSON.stringify(flagged, null, 2));
    console.log(`⚠ Flagged ${flagged.length} entries for manual review: ${flaggedPath}`);
  } else {
    console.log(`✓ No entries flagged for review`);
  }

  // Summary stats
  const singlePath = transformed.filter((e) => e.categoryPaths.length === 1).length;
  const multiPath = transformed.filter((e) => e.categoryPaths.length > 1).length;
  const ignored = transformed.filter((e) => e.ignore).length;

  console.log(`\nSummary:`);
  console.log(`  Single category path: ${singlePath}`);
  console.log(`  Multi category paths: ${multiPath}`);
  console.log(`  Marked as ignore:     ${ignored}`);
}

main();
