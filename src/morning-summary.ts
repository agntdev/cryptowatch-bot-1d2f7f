import type { Api } from "grammy";
import { activeProfiles, formatChange, formatPrice, isQuiet, lookupTicker, now, saveProfile } from "./crypto.js";

/** Called by the deployment scheduler at the owner's configured cadence. */
export async function deliverMorningSummaries(api: Api): Promise<void> {
  const profiles = await activeProfiles();
  await Promise.all(profiles.map(async (profile) => {
    if (isQuiet(profile, now()) || !profile.watchlist.length) return;
    const localTime = new Intl.DateTimeFormat("en-GB", { timeZone: profile.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now());
    if (localTime !== profile.summaryTime) return;
    try {
      const prices = await Promise.all(profile.watchlist.map((item) => lookupTicker(item.ticker)));
      prices.forEach((coin) => { const item = profile.watchlist.find((w) => w.ticker === coin.ticker); if (item) item.lastKnownPrice = coin.price; });
      await saveProfile(profile);
      await api.sendMessage(profile.telegramId, `Morning prices\n${prices.map((coin) => `${coin.ticker} ${formatPrice(coin.price)} (${formatChange(coin.change24h)} today)`).join("\n")}`);
    } catch {
      // A transient price or Telegram failure is retried by the next scheduled run.
    }
  }));
}
