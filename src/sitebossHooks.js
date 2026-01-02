"use strict";

/**
 * SiteBoss hooks layer (branding) powered by MonsterCore (engine).
 * Input: raw message text. Output: action + response text.
 */

function pickServiceFromText(text) {
  const t = (text || "").toLowerCase();

  if (t.includes("pressure") || t.includes("wash")) return "pressure_washing";
  if (t.includes("retaining") || t.includes("sleeper")) return "retaining_walls";
  if (t.includes("excav") || t.includes("digger") || t.includes("bobcat")) return "excavation";
  if (t.includes("landscap") || t.includes("turf") || t.includes("garden")) return "landscaping";
  if (t.includes("colorbond") || t.includes("colourbond")) return "colorbond_fencing";
  if (t.includes("aluminium") || t.includes("aluminum") || t.includes("pool fence")) return "aluminium_fencing";
  if (t.includes("timber") || t.includes("paling") || t.includes("pailing")) return "timber_fencing";
  if (t.includes("fence") || t.includes("fencing")) return "colorbond_fencing";

  return ""; // unknown
}

function extractNumberNear(text, keywords) {
  const t = (text || "").toLowerCase();
  for (const k of keywords) {
    const idx = t.indexOf(k);
    if (idx >= 0) {
      const slice = t.slice(Math.max(0, idx - 20), idx + 40);
      const m = slice.match(/(\d+(?:\.\d+)?)/);
      if (m) return Number(m[1]);
    }
  }
  return null;
}

function extractMetres(text) {
  const t = (text || "").toLowerCase();
  // patterns: "20m", "20 m", "20 metres"
  const m = t.match(/(\d+(?:\.\d+)?)\s*(m|metre|metres)\b/);
  if (m) return Number(m[1]);
  return null;
}

function extractHeight(text) {
  const t = (text || "").toLowerCase();
  // patterns: 1.2m 1.5m 1.8m 2.1m
  const m = t.match(/\b(1\.2|1\.5|1\.8|2\.1)\s*m\b/);
  if (m) return m[1] + "m";
  return "1.8m";
}

function extractAccess(text) {
  const t = (text || "").toLowerCase();
  if (t.includes("tight access") || t.includes("no access") || t.includes("behind shed") || t.includes("narrow")) return "tight";
  if (t.includes("restricted") || t.includes("limited") || t.includes("stairs") || t.includes("steep")) return "restricted";
  return "easy";
}

function buildLeadFromText(text) {
  const service = pickServiceFromText(text);

  const raw = (text || "");
  const t = raw.toLowerCase();

  // Budget rules:
  // - Only parse $ amounts if a $ is present OR the word "budget" appears.
  // - If no budget mentioned, set budget to minimum to avoid auto-decline.
  let budget = 0;

  const hasBudgetWord = t.includes("budget");
  const hasDollar = raw.includes("$");

  if (hasDollar) {
    const m = raw.match(/\$\s*(\d+(?:,\d{3})*)(?:\.\d{2})?/);
    if (m && m[1]) budget = Number(m[1].replace(/,/g, ""));
  }

  // budget 5k / 2k / 3 grand
  if (budget <= 0 && (hasBudgetWord || t.includes("k") || t.includes("grand"))) {
    const mk = t.match(/\bbudget\b[^0-9]{0,10}(\d+(?:\.\d+)?)\s*(k|grand)\b/);
    if (mk && mk[1]) {
      const n = Number(mk[1]);
      const mult = (mk[2] === "k") ? 1000 : 1000;
      if (Number.isFinite(n)) budget = Math.round(n * mult);
    }
  }

  const qty = extractMetres(raw) || 0;

  // IMPORTANT: If no budget provided, don't decline. Set to minimum.
  if (!hasDollar && !hasBudgetWord && budget <= 0) {
    const min = (global.MONSTER_CORE && global.MONSTER_CORE.business_rules && global.MONSTER_CORE.business_rules.minimum_job_value)
      ? Number(global.MONSTER_CORE.business_rules.minimum_job_value)
      : 1500;
    budget = min;
  }

  return {
    service,
    budget,
    qty,
    height: extractHeight(raw),
    access: extractAccess(raw),
    ground: "unknown",
    wet_season: false
  };
}
/**
 * Returns:
 *  - { action: "decline", message }
 *  - { action: "range", message }
 *  - { action: "pass" }  (do nothing special)
 */
function decideReplyFromText(text) {
  const MonsterCore = global.MonsterCore;
  const MONSTER_CORE = global.MONSTER_CORE;

  if (!MonsterCore || !MONSTER_CORE) {
    return { action: "pass" };
  }

  const lead = buildLeadFromText(text);

  // If we can't detect service or qty, don't force it. Let normal flow handle.
  if (!lead.service || !lead.qty) {
    return { action: "pass" };
  }

  const evalRes = MonsterCore.evaluateLead(MONSTER_CORE, lead);
  if (!evalRes.allowed) {
    return { action: "decline", message: evalRes.message };
  }

  const range = MonsterCore.priceRange(MONSTER_CORE, lead);
  if (range.ok) {
    return {
      action: "range",
      message: `Typical price range: $${range.low}–$${range.high}. Final price confirmed once we see photos/site conditions.`
    };
  }

  return { action: "pass" };
}

module.exports = {
  decideReplyFromText
};
