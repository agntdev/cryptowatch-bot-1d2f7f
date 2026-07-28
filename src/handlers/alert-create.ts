import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { PriceError, loadProfile, lookupTicker, now, parseRule, saveProfile } from "../crypto.js";

registerMainMenuItem({ label: "Add alert", data: "alert:create", order: 10 });
const composer = new Composer<Ctx>();

composer.callbackQuery("alert:create", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "alert-rule";
  ctx.session.expiresAt = now() + 5 * 60_000;
  await ctx.reply("Send a rule such as BTC above 100000 or ETH moves 5%.", { reply_markup: { force_reply: true, input_field_placeholder: "BTC above 100000" } });
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "alert-rule") return next();
  if ((ctx.session.expiresAt ?? 0) < now()) { ctx.session.step = undefined; await ctx.reply("That alert setup timed out. Tap Add alert to try again."); return; }
  const rule = parseRule(ctx.message.text);
  if (!rule) { await ctx.reply("I couldn't read that rule. Try BTC above 100000 or ETH moves 5%."); return; }
  try {
    const coin = await lookupTicker(rule.ticker);
    ctx.session.pendingRule = { ...rule, ticker: coin.ticker, displayName: coin.name };
    ctx.session.step = "alert-confirm";
    const condition = rule.thresholdType === "percent" ? `${rule.thresholdValue}% in 24 hours` : `${rule.thresholdType} $${rule.thresholdValue}`;
    await ctx.reply(`${coin.ticker} alert: ${condition}. Confirm to save it.`, { reply_markup: inlineKeyboard([[inlineButton("Confirm alert", "alert:confirm"), inlineButton("Cancel", "alert:cancel")]]) });
  } catch (error) {
    const message = error instanceof PriceError && error.kind === "invalid" ? "I couldn't find that ticker. Check it and try again." : error instanceof PriceError && error.kind === "rate" ? "Price checks are busy right now. Try again in a moment." : "Couldn't reach the price service. Try again in a moment.";
    await ctx.reply(message);
  }
});

composer.callbackQuery("alert:cancel", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.step = undefined; ctx.session.pendingRule = undefined; await ctx.editMessageText("Alert setup cancelled."); });
composer.callbackQuery("alert:confirm", async (ctx) => {
  await ctx.answerCallbackQuery();
  const pending = ctx.session.pendingRule;
  const userId = ctx.from?.id;
  if (!pending || !userId) { await ctx.editMessageText("That alert setup has expired. Tap Add alert to start again."); return; }
  const profile = await loadProfile(userId);
  if (!profile) { await ctx.editMessageText("Private alert storage isn't set up yet. Try again after it is configured."); return; }
  const item = profile.watchlist.find((w) => w.ticker === pending.ticker) ?? { ticker: pending.ticker, displayName: pending.displayName ?? pending.ticker, alertRules: [] };
  if (!profile.watchlist.includes(item)) profile.watchlist.push(item);
  if (item.alertRules.some((r) => r.thresholdType === pending.thresholdType && r.thresholdValue === pending.thresholdValue)) { await ctx.editMessageText("You already have that alert. Choose a different threshold."); return; }
  item.alertRules.push({ ...pending, cooldownEndTs: 0 });
  if (!await saveProfile(profile)) { await ctx.editMessageText("Couldn't save that alert right now. Try again in a moment."); return; }
  ctx.session.step = undefined; ctx.session.pendingRule = undefined;
  await ctx.editMessageText(`Your ${pending.ticker} alert is active. I'll wait ${profile.cooldownHours} hours between alerts.`, { reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]) });
});

export default composer;
