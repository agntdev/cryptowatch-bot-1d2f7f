/** Shared crypto domain helpers. Durable records are one Redis JSON document per user;
 * collections live inside that document, so no keyspace enumeration is needed. */
export type AlertRule = {
  ticker: string;
  thresholdType: "above" | "below" | "percent";
  thresholdValue: number;
  percentWindow?: number;
  cooldownEndTs: number;
  lastAlertTs?: number;
};

export type WatchlistItem = {
  ticker: string;
  displayName: string;
  alertRules: AlertRule[];
  lastKnownPrice?: number;
};

export type UserProfile = {
  telegramId: number;
  timezone: string;
  quietHours: { start: number; end: number };
  summaryTime: string;
  cooldownHours: number;
  watchlist: WatchlistItem[];
};

type RedisClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  sadd(key: string, ...members: string[]): Promise<unknown>;
  smembers(key: string): Promise<string[]>;
};

let clock: () => number = () => Date.now();
/** Test seam for every alert/cooldown time decision. */
export function now(): number { return clock(); }
export function setClockForTests(value?: () => number): void { clock = value ?? (() => Date.now()); }

let redis: Promise<RedisClient | null> | undefined;
async function client(): Promise<RedisClient | null> {
  if (redis) return redis;
  redis = (async () => {
    const url = typeof process === "undefined" ? undefined : process.env.REDIS_URL;
    if (!url) return null;
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    // Loaded only on the Node deployment path. The Worker path has no REDIS_URL.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = require("ioredis");
    const Redis = mod.default ?? mod.Redis ?? mod;
    return new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: false }) as RedisClient;
  })().catch(() => null);
  return redis;
}

function recordKey(userId: number): string { return `crypto-alert:user:${userId}`; }
export async function loadProfile(userId: number): Promise<UserProfile | null> {
  const c = await client();
  if (!c) return null;
  const raw = await c.get(recordKey(userId));
  if (!raw) return {
    telegramId: userId, timezone: "UTC", quietHours: { start: 22, end: 7 },
    summaryTime: "08:00", cooldownHours: 4, watchlist: [],
  };
  try { return JSON.parse(raw) as UserProfile; } catch { return null; }
}
export async function saveProfile(profile: UserProfile): Promise<boolean> {
  const c = await client();
  if (!c) return false;
  await c.set(recordKey(profile.telegramId), JSON.stringify(profile));
  await c.sadd("crypto-alert:users", String(profile.telegramId));
  return true;
}
/** Explicit user index for notification fan-out; never scans Redis keys. */
export async function activeProfiles(): Promise<UserProfile[]> {
  const c = await client();
  if (!c) return [];
  const ids = await c.smembers("crypto-alert:users");
  const profiles = await Promise.all(ids.slice(0, 500).map((id) => loadProfile(Number(id))));
  return profiles.filter((profile): profile is UserProfile => profile !== null);
}

export type MarketCoin = { ticker: string; name: string; price: number; change24h: number };
export class PriceError extends Error { constructor(public readonly kind: "rate" | "unavailable" | "invalid") { super(kind); } }

export async function lookupTicker(input: string): Promise<MarketCoin> {
  const symbol = input.trim().toLowerCase();
  if (!/^[a-z0-9]{2,12}$/.test(symbol)) throw new PriceError("invalid");
  let response: Response;
  try {
    response = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&symbols=${encodeURIComponent(symbol)}&order=market_cap_desc&per_page=1&page=1&sparkline=false&price_change_percentage=24h`,
      { headers: { accept: "application/json" } },
    );
  } catch { throw new PriceError("unavailable"); }
  if (response.status === 429) throw new PriceError("rate");
  if (!response.ok) throw new PriceError("unavailable");
  const rows = await response.json() as Array<{ symbol?: string; name?: string; current_price?: number; price_change_percentage_24h?: number }>;
  const row = rows[0];
  if (!row || typeof row.current_price !== "number") throw new PriceError("invalid");
  return { ticker: (row.symbol ?? symbol).toUpperCase(), name: row.name ?? symbol.toUpperCase(), price: row.current_price, change24h: row.price_change_percentage_24h ?? 0 };
}

export type ParsedRule = Omit<AlertRule, "cooldownEndTs">;
export function parseRule(text: string): ParsedRule | null {
  const m = /^\s*([a-z0-9]{2,12})\s+(above|below)\s+\$?([0-9]+(?:\.[0-9]+)?)\s*$/i.exec(text);
  if (m) return { ticker: m[1].toUpperCase(), thresholdType: m[2].toLowerCase() as "above" | "below", thresholdValue: Number(m[3]) };
  const p = /^\s*([a-z0-9]{2,12})\s+(?:moves?|changes?)\s+([0-9]+(?:\.[0-9]+)?)%\s*$/i.exec(text);
  if (p) return { ticker: p[1].toUpperCase(), thresholdType: "percent", thresholdValue: Number(p[2]), percentWindow: 24 };
  return null;
}

export function formatPrice(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value >= 1 ? 2 : 6 }).format(value);
}
export function formatChange(value: number): string { return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`; }
export function isQuiet(profile: UserProfile, at = now()): boolean {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: profile.timezone, hour: "2-digit", hourCycle: "h23" }).format(at));
  const { start, end } = profile.quietHours;
  return start === end ? false : start > end ? hour >= start || hour < end : hour >= start && hour < end;
}
