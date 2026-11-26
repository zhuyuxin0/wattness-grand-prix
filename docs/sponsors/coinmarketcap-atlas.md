# CoinMarketCap × Atlas: signed prices set what checking the plans costs

<!-- MEDIA: video-coinmarketcap-atlas -->

CoinMarketCap's Pro API and Atlas's signed reports and on-chain feeds decide how many paid checks of Wattness Grand Prix's sealed plans a budget pays for, and stop the count when the prices are stale or disagree. The Grand Prix seals the next day's plan for every ERCOT battery with complete public data (316 on Nov 26) on BNB Chain before the market's 10:00 CT gate. Repository: [github.com/zhuyuxin0/wattness-grand-prix](https://github.com/zhuyuxin0/wattness-grand-prix), MIT; setup in [Run it](../../README.md#run-it). Code: [`packages/adapters/atlas-cmc`](../../packages/adapters/atlas-cmc), server-side, with offline tests and setup in [its README](../../packages/adapters/atlas-cmc/README.md). Interface: the [Prices tab](https://gp.wattness.tech/markets/prices) and the Seal tab.

## 1. The problem and the audience

Anyone can check a sealed plan for free with the verifier. An independent, paid check is an ERC-8183 job: the evaluator agent (2922), hosted through BNB Agent Studio, checks a sealed record against GateRecord for 0.1 test U a job. Whoever funds those checks (an evaluation sponsor, a battery owner, a lender reviewing an optimizer's record) holds a budget in BNB and needs to know, from prices they can verify, how many checks it buys today, and to stop when the prices cannot be trusted. The plans themselves are valued only at ERCOT's prices; these prices decide what checking them costs.

## 2. The endpoints and feeds, and why

| Source | Call or feed | Why |
|---|---|---|
| Atlas, `api.atlasoracle.io` | `POST /report/v1/price/latest`, feeds 633 (BNB/USD) and 649 (USDT/USD), `signed: true` | A price anyone can check: the signer is recovered and must be Atlas's published `0x59eD4701224fD9e2a85Ef2946c2ab828C1dDC600`; older than 180 s or 60 s ahead is refused |
| CoinMarketCap Pro, `pro-api.coinmarketcap.com` | `GET /v3/cryptocurrency/quotes/latest?id=1839,825&convert=USD` | A second BNB price (the budget takes the lower), the 24-hour move that sizes the reserve, USDT's price; older than 300 s is refused |
| CoinMarketCap Pro | `GET /v1/dex/security/detail`, BSC-USDT | The vendor's flag and verification fields; unknown is never treated as safe |
| Atlas, BSC testnet | `0x3957d289ee9c38272377786787ea34f9dd29788d` (BNB/USD), `0x9dfd7992952bb9e8fb4bc6065fdc3518addc4e8b` (USDT/USD), `0xb3d1614bf894e68add1ea50ca250c152bad5256f` | Read with view calls: live beside the decision on the Prices tab; the last must name BNB/USD and be at most 180 s old before it may price anything |
| Atlas, BSC mainnet | `0x9c0517f5b4c8657c7f18d68d2d79e2b3b1cd6438` (BNB/USD), MultiFeed `0xeace519ebb14fb8404fa6ddd23c3b34abade44aa` | The latest seal's gas in dollars (Seal tab); tokenized shares of Vistra, Fluence, GE Vernova and IREN, four companies in Texas's power market (Prices tab) |

**The rule.** A declared BNB budget is valued at the lower of the two BNB prices. The reserve is 10% plus twice the 24-hour BNB move, at most 50%; the rest, at $2 a check, rounded down, is the count. Prices more than 5% apart, USDT more than 1% from a dollar, or vendor fields unknown or flagged turn the decision to review, with no checks; a stale or future-dated price stops it. On the Nov 25 run (09:54 CT), 0.25 BNB was worth $134.13, the 1.78% move set a 13.56% reserve, and the budget paid for 57 checks, against 60 at a fixed 10%.

## 3. BNB Chain contracts and data

- GateRecord `0x2922c68cE15EB3e83B7f43b136e981dDc4262876`, BSC mainnet and testnet: the sealed records being checked ([Nov 27 seal](https://bscscan.com/tx/0xd6ce6ebdd4f70dfe3aafae5fb76f014152f10a9f3a6c83d52362954cf853dbef)).
- ERC-8183 on BSC testnet: commerce `0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE`, router `0xD7d36D66d2F1B608A0F943f722D27e3744f66F25`, policy `0xd6a4217588F6B1F5657a92A3e94E6422aD771cEA`, payment token `0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565`. Paid checks so far: jobs 1871, 1873, 1902 and 1908.
- ERC-8004 registry `0x8004A818BFB912233c491871b3d84c89A494BD9e`, BSC testnet: the evaluator (2922) and the planning agents (2923 to 2928).
- Atlas's feeds, as in the table.

**Usage anyone can verify.** The Atlas feed reads are view calls anyone can repeat. The run's signed Atlas report, payload and signature, and its CoinMarketCap quotes with their times are published in [`site/public/data/prices.json`](../../site/public/data/prices.json); keys stay on the server.

## 4. What we would build next

1. **Fund the checks from the decision:** the count becomes the number of ERC-8183 jobs a funder opens with the evaluator, and the reserve stays in the budget.
2. **Enforce it on chain:** a consumer of Atlas's signed Pull reports on BSC testnet, so a contract checks the signature and the reserve before it funds a job.
3. **Prices with the market's hours:** each tokenized share beside its session, with the last regular-session price and its age while US markets are closed.

## Team and contact

Team: Wattness.

<!-- CONTACT: the contact line, typed by Jo (J9) -->
