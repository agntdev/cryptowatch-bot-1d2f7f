import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { activeProfiles, formatPrice, isQuiet, now, saveProfile, type UserProfile } from "../crypto.js";

const composer = new Composer<Ctx>();

/**
 * Emergency-thread intake. Only topic messages following the explicit
 * `ALERT <ticker> <price>` convention are considered; regular group traffic
 * continues to the normal fallback untouched.
 */
composer.on("message:text", async (ctx, next) => {
  const threadId = ctx.message.message_thread_id;
  const match = /^ALERT\s+([A-Z0-9]{2,12})\s+\$?([0-9]+(?:\.[0-9]+)?)\s*$/i.exec(ctx.message.text);
  if (!threadId || !match) return next();
  const ticker = match[1].toUpperCase();
  const price = Number(match[2]);
  const profiles = await activeProfiles();
  await Promise.all(profiles.map((profile) => sendThreadAlerts(ctx, profile, ticker, price)));
});

async function sendThreadAlerts(ctx: Ctx, profile: UserProfile, ticker: string, price: number): Promise<void> {
  if (isQuiet(profile)) return;
  const item = profile.watchlist.find((entry) => entry.ticker === ticker);
  if (!item) return;
  const eligible = item.alertRules.filter((rule) => {
    if (rule.cooldownEndTs > now()) return false;
    return rule.thresholdType === "above" ? price >= rule.thresholdValue : rule.thresholdType === "below" ? price <= rule.thresholdValue : false;
  });
  if (!eligible.length) return;
  const cooldownEnd = now() + profile.cooldownHours * 60 * 60_000;
  eligible.forEach((rule) => { rule.lastAlertTs = now(); rule.cooldownEndTs = cooldownEnd; });
  item.lastKnownPrice = price;
  await saveProfile(profile);
  try {
    await ctx.api.sendMessage(profile.telegramId, `${ticker} is ${formatPrice(price)} and reached your alert.`, { disable_notification: false });
  } catch {
    // A user can block the bot after opting in. One failed DM must not stop fan-out.
  }
}

export default composer;
