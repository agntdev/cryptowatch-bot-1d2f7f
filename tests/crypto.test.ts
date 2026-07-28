import { describe, expect, it, afterEach } from "vitest";
import { isQuiet, now, parseRule, setClockForTests, type UserProfile } from "../src/crypto.js";

const profile: UserProfile = {
  telegramId: 1, timezone: "UTC", quietHours: { start: 22, end: 7 },
  summaryTime: "08:00", cooldownHours: 4, watchlist: [],
};

afterEach(() => setClockForTests());

describe("crypto alert domain", () => {
  it("parses threshold and daily percent rules without accepting malformed input", () => {
    expect(parseRule("BTC above 100000")).toMatchObject({ ticker: "BTC", thresholdType: "above", thresholdValue: 100000 });
    expect(parseRule("eth moves 5%")).toMatchObject({ ticker: "ETH", thresholdType: "percent", thresholdValue: 5, percentWindow: 24 });
    expect(parseRule("buy BTC now")).toBeNull();
  });

  it("uses the injectable clock for quiet-hour decisions across midnight", () => {
    setClockForTests(() => Date.UTC(2026, 0, 1, 23, 0));
    expect(now()).toBe(Date.UTC(2026, 0, 1, 23, 0));
    expect(isQuiet(profile)).toBe(true);
    setClockForTests(() => Date.UTC(2026, 0, 1, 8, 0));
    expect(isQuiet(profile)).toBe(false);
  });
});
