# Crypto Price Alert Bot — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A personal Telegram bot that tracks crypto prices, sends customizable alerts for price thresholds/percent changes, and supports manual price checks. Integrates with a Telegram thread for emergency alerts while maintaining user privacy and alert cooldowns.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- individual crypto traders
- crypto hobbyists

## Success criteria

- users receive accurate price alerts without spam
- manual price checks return current data
- morning summaries respect quiet hours

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Begin onboarding and show main menu
- **Add Alert** (button, actor: user, callback: alert:create) — Create new price alert rule with natural language input
- **Check Prices** (button, actor: user, callback: price:check) — Show current prices for watchlist or specific ticker
- **Manage Watchlist** (button, actor: user) — Add/remove coins and configure alert rules

## Flows

### alert_creation
_Trigger:_ button:alert:create

1. parse natural language rule
2. validate ticker
3. confirm rule parameters
4. store rule with cooldown

_Data touched:_ watchlist_item, alert_rule

### price_check
_Trigger:_ /price or button:price:check

1. fetch current prices
2. calculate changes
3. format response with price history

_Data touched:_ user_profile, watchlist_item

### morning_summary
_Trigger:_ scheduled local time

1. check quiet hours
2. compile watchlist prices
3. send formatted summary

_Data touched:_ user_profile, watchlist_item

### thread_alert_processing
_Trigger:_ Telegram thread message

1. match alert pattern
2. filter by active watchlists
3. send direct alert message

_Data touched:_ user_profile, watchlist_item

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **user_profile** _(retention: persistent)_ — User-specific settings and preferences
  - fields: telegram_id, timezone, quiet_hours, summary_time, cooldown_settings
- **watchlist_item** _(retention: persistent)_ — Tracked cryptocurrency and alert rules
  - fields: ticker, display_name, alert_rules, last_alert_ts, last_known_price
- **alert_rule** _(retention: persistent)_ — Price alert configuration
  - fields: threshold_type, threshold_value, percent_window, cooldown_end_ts

## Integrations

- **Telegram** (required) — Bot API messaging and thread monitoring
- **Crypto Price API** (required) — Public price data source
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Telegram thread ID for emergency alerts
- default price API selection
- alert cooldown duration defaults

## Notifications

- Direct message price alerts
- Scheduled morning summaries
- Error notifications for persistent API failures

## Permissions & privacy

- All user data is stored privately per user
- No third-party data sharing
- Telegram thread monitoring limited to pattern-matched alerts

## Edge cases

- Unknown/invalid ticker symbols
- API rate limiting or failures
- Alert rule conflicts
- Timezone daylight saving transitions

## Required tests

- End-to-end alert triggering with cooldown enforcement
- Morning summary delivery during/after quiet hours
- Thread alert pattern matching accuracy

## Assumptions

- Default price API is reliable for percent calculations
- Users understand basic crypto ticker symbols
- Telegram thread messages follow alert pattern conventions
