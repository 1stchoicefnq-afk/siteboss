"use strict";

const fs = require("fs");
const path = require("path");

function loadJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function clampNumber(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.min(Math.max(x, min), max);
}

function normalizeAccess(access) {
  const a = (access || "").toLowerCase().trim();
  if (["tight"].includes(a)) return "tight";
  if (["restricted", "limited"].includes(a)) return "restricted";
  return "easy";
}

function normalizeGround(ground) {
  const g = (ground || "").toLowerCase().trim();
  if (["rocky", "rock", "stone"].includes(g)) return "rocky";
  if (["soft", "sand", "sandy"].includes(g)) return "soft";
  return "unknown";
}

function normalizeHeight(height) {
  const h = (height || "").toLowerCase().trim();
  // Allow numeric like 1.8, "1800", etc.
  if (h.endsWith("m")) return h;
  const num = Number(h);
  if (Number.isFinite(num)) {
    if (num > 100) return (num / 1000).toFixed(1) + "m";
    return num.toFixed(1) + "m";
  }
  return "1.8m";
}

function isServiceSupported(core, service) {
  return core.business_rules.supported_services.includes(service);
}

function evaluateLead(core, lead) {
  const budget = clampNumber(lead?.budget, 0, 1e9);
  const service = (lead?.service || "").trim();
  const access = normalizeAccess(lead?.access);

  if (!isServiceSupported(core, service)) {
    return { allowed: false, ruleId: "unsupported_service", action: "auto_decline", message: getRuleMessage(core, "unsupported_service") };
  }

  if (budget < core.business_rules.minimum_job_value) {
    return { allowed: false, ruleId: "min_job_value", action: "auto_decline", message: getRuleMessage(core, "min_job_value") };
  }

  if (access === "tight" && budget < core.business_rules.tight_access_minimum) {
    return { allowed: false, ruleId: "tight_access_min", action: "auto_decline", message: getRuleMessage(core, "tight_access_min") };
  }

  return { allowed: true };
}

function getRuleMessage(core, ruleId) {
  const rule = core.lead_filtering.rules.find(r => r.id === ruleId);
  return rule?.message || "Thanks for reaching out.";
}

function priceRange(core, input) {
  const service = (input?.service || "").trim();
  const metresOrUnits = clampNumber(input?.qty, 0, 1e6);
  const heightKey = normalizeHeight(input?.height);
  const accessKey = normalizeAccess(input?.access);
  const groundKey = normalizeGround(input?.ground);
  const wetSeason = Boolean(input?.wet_season);

  if (!isServiceSupported(core, service)) {
    return { ok: false, reason: "unsupported_service" };
  }

  const baseRate = core.pricing_engine.base_rates[service];
  if (!Number.isFinite(baseRate)) {
    return { ok: false, reason: "missing_base_rate" };
  }

  const heightFactor = core.pricing_engine.multipliers.height[heightKey] ?? 1.0;
  const accessFactor = core.pricing_engine.multipliers.access[accessKey] ?? 1.0;
  const groundFactor = core.pricing_engine.multipliers.ground[groundKey] ?? 1.0;
  const seasonFactor = wetSeason ? core.business_rules.wet_season_multiplier : 1.0;

  const raw = (metresOrUnits * baseRate) * heightFactor * accessFactor * groundFactor * seasonFactor;

  const low = raw * core.pricing_engine.range.low_factor;
  const high = raw * core.pricing_engine.range.high_factor;

  // Round to nearest $10 for nicer ranges
  const round10 = (n) => Math.round(n / 10) * 10;

  return {
    ok: true,
    service,
    qty: metresOrUnits,
    factors: { heightKey, heightFactor, accessKey, accessFactor, groundKey, groundFactor, seasonFactor },
    raw: round10(raw),
    low: round10(low),
    high: round10(high)
  };
}

function depositAmount(core, total) {
  const t = clampNumber(total, 0, 1e12);
  const pct = clampNumber(core.business_rules.deposit_percentage_default, 0, 1);
  return Math.round(t * pct);
}

function paymentChaseSchedule(core, invoiceDateIso) {
  // Returns days after invoice date, based on config
  return core.payment_chasing.schedule.map(x => ({ day: x.day, type: x.type }));
}

function shouldBlockNewWork(core, account) {
  if (!core.business_rules.block_new_work_if_overdue) return false;
  return Boolean(account?.is_overdue);
}

function canScheduleJob(core, job) {
  // Enforce: no deposit paid = no scheduling
  return Boolean(job?.deposit_paid);
}

function canDoVariationWork(core, variation) {
  // Enforce: no approval = no work
  return Boolean(variation?.approved);
}

function loadMonsterCore(projectRoot) {
  const root = projectRoot || process.cwd();
  const configPath = path.join(root, "config", "monster-core-v1.json");
  const core = loadJson(configPath);

  // Basic sanity checks to avoid silent bad config
  if (!core?.business_rules?.supported_services?.length) throw new Error("Monster Core config invalid: supported_services missing");
  if (!core?.pricing_engine?.base_rates) throw new Error("Monster Core config invalid: base_rates missing");

  return core;
}

module.exports = {
  loadMonsterCore,
  evaluateLead,
  priceRange,
  depositAmount,
  paymentChaseSchedule,
  shouldBlockNewWork,
  canScheduleJob,
  canDoVariationWork
};
