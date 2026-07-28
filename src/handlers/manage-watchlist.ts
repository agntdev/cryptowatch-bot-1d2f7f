import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { PriceError, loadProfile, lookupTicker, now, saveProfile } from "../crypto.js";

registerMainMenuItem({ label: "Manage watchlist", data: "menu:manage-watchlist", order: 30 });
const composer = new Composer<Ctx>();

composer.callbackQuery("menu:manage-watchlist", async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = ctx.from && await loadProfile(ctx.from.id);
  if (!profile) { await ctx.reply("Private watchlist storage isn't set up yet. Try again after it is configured."); return; }
  const lines = profile.watchlist.length ? profile.watchlist.map((w) => `• ${w.ticker} — ${w.alertRules.length} alert${w.alertRules.length === 1 ? "" : "s"}`).join("\n") : "No coins yet — tap Add coin to start your watchlist.";
  const rows = profile.watchlist.slice(0, 5).map((w) => [inlineButton(`Remove ${w.ticker}`, `watch:remove:${w.ticker}`)]);
  await ctx.reply(lines, { reply_markup: inlineKeyboard([[inlineButton("Add coin", "watch:add")], ...rows, [inlineButton("Settings", "watch:settings")], [inlineButton("Back to menu", "menu:main")]]) });
});

composer.callbackQuery("watch:add", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.step = "watch-add"; ctx.session.expiresAt = now() + 5 * 60_000; await ctx.reply("Send the ticker you want to track, such as BTC.", { reply_markup: { force_reply: true, input_field_placeholder: "BTC" } }); });
composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step === "settings-timezone") {
    const zone = ctx.message.text.trim();
    try { Intl.DateTimeFormat(undefined, { timeZone: zone }); } catch { await ctx.reply("That timezone isn't recognised. Try a name like Europe/London."); return; }
    const profile = ctx.from && await loadProfile(ctx.from.id); if (!profile) { await ctx.reply("Private settings storage isn't set up yet."); return; }
    profile.timezone = zone; await saveProfile(profile); ctx.session.step = undefined; await ctx.reply(`Your timezone is now ${zone}.`); return;
  }
  if (ctx.session.step === "settings-summary") {
    const time = ctx.message.text.trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) { await ctx.reply("Use 24-hour time, such as 08:00."); return; }
    const profile = ctx.from && await loadProfile(ctx.from.id); if (!profile) { await ctx.reply("Private settings storage isn't set up yet."); return; }
    profile.summaryTime = time; await saveProfile(profile); ctx.session.step = undefined; await ctx.reply(`Your morning summary is set for ${time}.`); return;
  }
  if (ctx.session.step !== "watch-add") return next();
  if ((ctx.session.expiresAt ?? 0) < now()) { ctx.session.step = undefined; await ctx.reply("That watchlist setup timed out. Tap Add coin to try again."); return; }
  try {
    const coin = await lookupTicker(ctx.message.text);
    const profile = ctx.from && await loadProfile(ctx.from.id);
    if (!profile) { await ctx.reply("Private watchlist storage isn't set up yet. Try again after it is configured."); return; }
    if (profile.watchlist.some((w) => w.ticker === coin.ticker)) { await ctx.reply(`${coin.ticker} is already on your watchlist.`); return; }
    profile.watchlist.push({ ticker: coin.ticker, displayName: coin.name, alertRules: [], lastKnownPrice: coin.price });
    if (!await saveProfile(profile)) { await ctx.reply("Couldn't save that coin right now. Try again in a moment."); return; }
    ctx.session.step = undefined; await ctx.reply(`${coin.ticker} is now on your watchlist.`);
  } catch (error) { await ctx.reply(error instanceof PriceError && error.kind === "invalid" ? "I couldn't find that ticker. Check it and try again." : "Couldn't reach the price service. Try again in a moment."); }
});
composer.callbackQuery(/^watch:remove:([A-Z0-9]{2,12})$/, async (ctx) => { await ctx.answerCallbackQuery(); const profile = ctx.from && await loadProfile(ctx.from.id); if (!profile) { await ctx.reply("Private watchlist storage isn't set up yet."); return; } const ticker = ctx.match[1]; profile.watchlist = profile.watchlist.filter((w) => w.ticker !== ticker); await saveProfile(profile); await ctx.editMessageText(`${ticker} was removed from your watchlist.`); });
composer.callbackQuery("watch:settings", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.editMessageText("Choose a setting.", { reply_markup: inlineKeyboard([[inlineButton("Set timezone", "watch:timezone")], [inlineButton("Set summary time", "watch:summary")], [inlineButton("Quiet hours 22–07", "watch:quiet:night")], [inlineButton("Quiet hours off", "watch:quiet:off")], [inlineButton("Cooldown 4 hours", "watch:cooldown:4")], [inlineButton("Back", "menu:manage-watchlist")]]) }); });
composer.callbackQuery("watch:timezone", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.step = "settings-timezone"; await ctx.reply("Send your IANA timezone, such as Europe/London.", { reply_markup: { force_reply: true, input_field_placeholder: "Europe/London" } }); });
composer.callbackQuery("watch:summary", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.step = "settings-summary"; await ctx.reply("Send your summary time in 24-hour format.", { reply_markup: { force_reply: true, input_field_placeholder: "08:00" } }); });
composer.callbackQuery(/^watch:quiet:(night|off)$/, async (ctx) => { await ctx.answerCallbackQuery(); const profile = ctx.from && await loadProfile(ctx.from.id); if (!profile) { await ctx.reply("Private settings storage isn't set up yet."); return; } const night = ctx.match[1] === "night"; profile.quietHours = night ? { start: 22, end: 7 } : { start: 0, end: 0 }; await saveProfile(profile); await ctx.editMessageText(night ? "Quiet hours are set from 22:00 to 07:00." : "Quiet hours are turned off."); });
composer.callbackQuery(/^watch:cooldown:(\d+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const profile = ctx.from && await loadProfile(ctx.from.id); if (!profile) { await ctx.reply("Private settings storage isn't set up yet."); return; } profile.cooldownHours = Number(ctx.match[1]); await saveProfile(profile); await ctx.editMessageText(`Alerts will wait ${profile.cooldownHours} hours before sending another match.`); });

export default composer;
