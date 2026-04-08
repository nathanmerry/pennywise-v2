/**
 * Phase 1: Lightweight deterministic merchant normalization.
 *
 * Produces a `merchantKey` suitable for grouping and rule matching.
 * Does NOT mutate raw transaction fields — this is a derived value.
 *
 * Pipeline:
 *   1. Pick best raw input (prefer merchantName, fallback to description)
 *   2. Lowercase + trim
 *   3. Collapse whitespace
 *   4. Strip POS terminal prefixes (SQ *, SUMUP *, ZETTLE_*, TST-, etc.)
 *   5. Strip transaction reference suffixes (*<alphanumeric>, MB:<uuid>, BY *<digits>)
 *   6. Strip trailing store/branch numbers for known merchants
 *   7. Strip trailing punctuation noise
 *   8. Apply known-merchant normalization (location stripping, abbreviation expansion)
 */

// ---------------------------------------------------------------------------
// POS / payment processor prefixes to strip
// ---------------------------------------------------------------------------
const POS_PREFIXES = [
  /^sq \*/,
  /^sumup \*/,
  /^zettle_\*/,
  /^tst-/,
  /^mnk\*/,
  /^jg \*/,
  /^nya\*/,
  /^nyx\*/,
  /^clip mx\*/,
  /^paddle\.net\* /,
  /^dnhgodaddy \*/,
];

// ---------------------------------------------------------------------------
// Reference / ID patterns to strip (applied after POS prefix removal)
// ---------------------------------------------------------------------------
const REF_PATTERNS = [
  // Amazon-style transaction refs: *<alphanumeric 8+>
  /\*[a-z0-9]{8,}$/,
  // Amazon.co.uk style with ref
  /\.co\.uk\*[a-z0-9]+$/,
  // MB:<uuid> (currency exchange refs)
  / mb:[a-f0-9-]{20,}$/,
  // Apple Pay / card refs: by *<digits>
  / by \*\d+$/,
  // Cabify ride IDs: ar <alphanumeric 10+>
  /( ar) [a-z0-9]{10,}$/,
  // Grab ride IDs: a-<alphanumeric 10+>
  / a-[a-z0-9]{10,}$/,
  // Bolt.eu order IDs: o<digits 10+>  (bolt.euo2506181753)
  /o\d{10,}$/,
  // Bolt.eu/o/<digits> path style
  /\/o\/\d+$/,
  // Viator booking refs: *it-<digits>
  / \*it-\d+$/,
  // Upwork contract IDs: -<digits 9+>conne...
  / -\d{9,}[a-z]+$/,
  // Nexo / Xoom user refs: *<name>
  // (handled more carefully below in known merchants)
  // GoDaddy style: *#<digits>
  / \*#\d+$/,
  // PayU*AR* refs with trailing spaces+digits
  /\s+\d{4}$/,
  // Banilla/Zara trailing store numbers with spaces: "    2041", "    0970"
  /\s{2,}\d{3,}$/,
];

// ---------------------------------------------------------------------------
// Known merchants where trailing location/branch/store number should be stripped
// The key is a prefix to match, and if the normalized string starts with it
// we strip what follows.
// ---------------------------------------------------------------------------
interface KnownMerchant {
  match: RegExp;
  replace: string;
}

const KNOWN_MERCHANTS: KnownMerchant[] = [
  // Supermarkets — strip location + store numbers
  { match: /^sainsburys.*$/, replace: "sainsburys" },
  { match: /^tesco (?:stores|pfs) ?\d*.*$/, replace: "tesco" },
  { match: /^aldi ?\d.*$/, replace: "aldi" },
  { match: /^aldi stores$/, replace: "aldi" },
  { match: /^asda .*$/, replace: "asda" },
  { match: /^lidl .*$/, replace: "lidl" },
  { match: /^waitrose ?\d+$/, replace: "waitrose" },
  { match: /^waitrose stores$/, replace: "waitrose" },
  { match: /^welcome b\/waitrose$/, replace: "waitrose" },
  { match: /^co-op group food$/, replace: "co-op" },
  { match: /^co op membership$/, replace: "co-op" },
  { match: /^carrefour \d+$/, replace: "carrefour" },
  { match: /^carrefour express.*$/, replace: "carrefour" },
  { match: /^crf exp .*$/, replace: "carrefour" },

  // Transport
  { match: /^tfl .*$/, replace: "tfl" },
  { match: /^ubr\* pending\.uber\.com$/, replace: "uber" },
  { match: /^uber .*$/, replace: "uber" },
  { match: /^payu\*ar\*uber.*$/, replace: "uber" },
  { match: /^bolt\.eu.*$/, replace: "bolt" },
  { match: /^cabify.*$/, replace: "cabify" },
  { match: /^grab\*.*$/, replace: "grab" },
  { match: /^grab registration$/, replace: "grab" },
  { match: /^lime\*.*$/, replace: "lime" },
  { match: /^trainline\.com$/, replace: "trainline" },
  { match: /^trainline$/, replace: "trainline" },
  { match: /^zipcar .*$/, replace: "zipcar" },

  // Amazon family
  { match: /^amazon prime.*$/, replace: "amazon prime" },
  { match: /^amazon uk.*$/, replace: "amazon" },
  { match: /^amazon\.co\.uk.*$/, replace: "amazon" },
  { match: /^amazon eu.*$/, replace: "amazon" },
  { match: /^amazon\*.*$/, replace: "amazon" },
  { match: /^amznmktplace.*$/, replace: "amazon marketplace" },

  // Coffee / food chains — strip location
  { match: /^costa coffee \d+$/, replace: "costa coffee" },
  { match: /^caffe nero .*$/, replace: "caffe nero" },
  { match: /^gails .*$/, replace: "gails" },
  { match: /^greggs$/, replace: "greggs" },
  { match: /^leon .*$/, replace: "leon" },
  { match: /^london bridge leon$/, replace: "leon" },
  { match: /^brixton leon$/, replace: "leon" },
  { match: /^itsu \d+$/, replace: "itsu" },
  { match: /^subway \d+$/, replace: "subway" },
  { match: /^mcdonalds$/, replace: "mcdonalds" },
  { match: /^mc donalds .*$/, replace: "mcdonalds" },

  // Boots — strip location + store number
  { match: /^boots \d+$/, replace: "boots" },
  { match: /^boots .*$/, replace: "boots" },

  // M&S
  { match: /^marks&spencer .*$/, replace: "marks & spencer" },
  { match: /^m&s simply food.*$/, replace: "marks & spencer" },

  // Odeon
  { match: /^odeon .*$/, replace: "odeon" },
  { match: /^odeon cinemas$/, replace: "odeon" },

  // Uniqlo
  { match: /^uniqlo .*$/, replace: "uniqlo" },

  // Brewdog
  { match: /^brewdog .*$/, replace: "brewdog" },

  // Google services
  { match: /^google \*chrome temp$/, replace: "google" },
  { match: /^google \*google one$/, replace: "google one" },
  { match: /^google \*temporary hold$/, replace: "google" },

  // Apple
  { match: /^apple\.com\/bill$/, replace: "apple" },
  { match: /^apple pay top-?up.*$/, replace: "apple pay top-up" },
  { match: /^apple pay payment.*$/, replace: "apple pay payment" },

  // Currency exchange — strip refs
  { match: /^to gbp.*$/, replace: "to gbp" },
  { match: /^exchanged to eur.*$/, replace: "exchanged to eur" },
  { match: /^exchanged to gbp.*$/, replace: "exchanged to gbp" },

  // Known pubs with truncated/varying location names
  { match: /^coach and horses gree.*$/, replace: "coach and horses greenwich" },
  { match: /^godfrey's of hornchur.*$/, replace: "godfreys of hornchurch" },
  { match: /^drings butchers \d+$/, replace: "drings butchers" },
  { match: /^drings butchers$/, replace: "drings butchers" },

  // Betting — case normalization already handles most
  { match: /^hollywoodbets\.co\.uk$/, replace: "hollywoodbets" },
  { match: /^matchbook\.com$/, replace: "matchbook" },
  { match: /^kwiff\.com$/, replace: "kwiff" },
  { match: /^betmgm\.co\.uk$/, replace: "betmgm" },
  { match: /^livescorebet\.com$/, replace: "livescorebet" },

  // Klarna
  { match: /^klarna\*(.+)$/, replace: "klarna" },

  // Merpago — keep the merchant part after *
  // (leave these alone for now; they are distinct merchants via MercadoPago)

  // Monzo P2P
  { match: /^monzo\* me .*$/, replace: "monzo transfer" },

  // PureGym
  { match: /^pure gym$/, replace: "puregym" },
  { match: /^puregym limited$/, replace: "puregym" },
  { match: /^nya\*pure gym$/, replace: "puregym" },

  // Nexo
  { match: /^nexo\*.*$/, replace: "nexo" },

  // Xoom
  { match: /^xoom\*.*$/, replace: "xoom" },

  // Upwork
  { match: /^upwork.*$/, replace: "upwork" },

  // Western Union
  { match: /^western union.*$/, replace: "western union" },

  // Worldremit
  { match: /^worldremit$/, replace: "worldremit" },

  // Booking.com
  { match: /^booking\.com.*$/, replace: "booking.com" },

  // Disney Plus
  { match: /^disney plus$/, replace: "disney plus" },

  // Nandos
  { match: /^nandos\.co\.uk$/, replace: "nandos" },

  // Ikea — strip store number + location
  { match: /^ikea .*$/, replace: "ikea" },

  // Wickes
  { match: /^wickes .*$/, replace: "wickes" },

  // WH Smith
  { match: /^wh smith .*$/, replace: "wh smith" },

  // Cambridge Belfry (hotel + reception are same place)
  { match: /^cambridge belfry .*$/, replace: "cambridge belfry" },

  // Novotel
  { match: /^novotel .*$/, replace: "novotel greenwich" },

  // Hilton
  { match: /^hilton .*$/, replace: "hilton" },

  // Oliver Bonas
  { match: /^oliver bonas .*$/, replace: "oliver bonas" },

  // Pets At Home
  { match: /^pets at home.*$/, replace: "pets at home" },

  // Trip.com
  { match: /^000\*trip\.com$/, replace: "trip.com" },

  // Priced Up / PricedUp
  { match: /^pricedup$/, replace: "priced up" },
  { match: /^priced up$/, replace: "priced up" },

  // Loqbox
  { match: /^loqbox grow$/, replace: "loqbox" },
  { match: /^loqbox$/, replace: "loqbox" },

  // SQ * merchant — already stripped prefix; the merchant name remains

  // SUMUP * merchant — already stripped prefix; the merchant name remains

  // Flat Iron Square (TST- prefix already stripped)

  // Refunds — keep "refund from" prefix, normalize the merchant part
  // These are handled in the main pipeline by recursing on the suffix
];

// ---------------------------------------------------------------------------
// Main normalization function
// ---------------------------------------------------------------------------

export function normalizeMerchant(
  merchantName: string | null,
  description: string | null
): string {
  // Step 1: pick best raw input
  let raw = merchantName || description || "";
  if (!raw.trim()) return "";

  let normalized = raw;

  // Step 2: lowercase + trim
  normalized = normalized.toLowerCase().trim();

  // Step 3: collapse multiple spaces
  normalized = normalized.replace(/\s{2,}/g, " ");

  // Step 4: strip POS terminal prefixes
  for (const prefix of POS_PREFIXES) {
    normalized = normalized.replace(prefix, "");
  }
  normalized = normalized.trim();

  // Step 5: strip reference / ID suffixes
  for (const pattern of REF_PATTERNS) {
    normalized = normalized.replace(pattern, "$1");
  }
  normalized = normalized.trim();

  // Step 6: strip trailing punctuation noise (-, ,, .)
  normalized = normalized.replace(/[-,.\s]+$/, "").trim();

  // Step 7: handle "refund from ..." — normalize the merchant part recursively
  const refundMatch = normalized.match(/^refund from (.+)$/);
  if (refundMatch) {
    const inner = normalizeMerchant(refundMatch[1], null);
    return `refund from ${inner}`;
  }

  // Step 8: apply known merchant patterns
  for (const { match, replace } of KNOWN_MERCHANTS) {
    if (match.test(normalized)) {
      return replace;
    }
  }

  return normalized;
}

/**
 * Generate a normalized description (lighter cleanup, no merchant collapsing).
 * Useful for search and display.
 */
export function normalizeDescription(description: string | null): string {
  if (!description?.trim()) return "";

  let normalized = description.toLowerCase().trim();

  // Collapse whitespace
  normalized = normalized.replace(/\s{2,}/g, " ");

  // Strip trailing punctuation noise
  normalized = normalized.replace(/[-,.\s]+$/, "").trim();

  return normalized;
}
