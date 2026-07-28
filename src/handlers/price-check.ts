import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { PriceError, formatChange, formatPrice, loadProfile, lookupTicker, saveProfile } from "../crypto.js";

registerMainMenuItem({ label: "Check prices", data: "price:check", order: 20 });
const composer = new Composer<Ctx>();

composer.callbackQuery("price:check", async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = ctx.from && await loadProfile(ctx.from.id);
  if (!profile) { await ctx.reply("Private watchlist storage isn't set up yet. Try again after it is configured."); return; }
  if (!profile.watchlist.length) { await ctx.reply("No coins in your watchlist yet — tap Manage watchlist to add one.", { reply_markup: inlineKeyboard([[inlineButton("Manage watchlist", "menu:manage-watchlist")]]) }); return; }
  await showPrices(ctx, profile);
});

async function showPrices(ctx: Ctx, profile: NonNullable<Awaited<ReturnType<typeof loadProfile>>>) {
  try {
    await ctx.replyWithChatAction("typing");
    const coins = await Promise.all(profile.watchlist.map((item) => lookupTicker(item.ticker)));
    coins.forEach((coin) => { const item = profile.watchlist.find((w) => w.ticker === coin.ticker); if (item) item.lastKnownPrice = coin.price; });
    await saveProfile(profile);
    await ctx.reply(coins.map((coin) => `${coin.ticker} ${formatPrice(coin.price)} (${formatChange(coin.change24h)} today)`).join("\n"), { reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]) });
  } catch (error) { await ctx.reply(error instanceof PriceError && error.kind === "rate" ? "Price checks are busy right now. Try again in a moment." : "Couldn't reach the price service. Try again in a moment."); }
}

export default composer;
