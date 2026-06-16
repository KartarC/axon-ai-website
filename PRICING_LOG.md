# Billet — Pricing Research & Strategy Log

---

## Entry — June 2, 2026

### Research: Competitor Pricing (2026)

Sourced from Capterra, G2, GetApp, TrustRadius, and vendor pricing pages.

---

#### LEGACY ERP — Per-User, High Implementation Cost

| Competitor | Model | Price | Notes |
|---|---|---|---|
| **JobBOSS²** (ECi) | Per user/month | $45–$200/user/mo | 10-user shop = $450–$2,000/mo. Implementation from $5,000. |
| **E2 Shop System** | Per user/month | $45–$99/user/mo | Rebranded into JobBOSS² after ECi acquisition. |
| **ProShop ERP** | Quote-based, named users | $500–$715/mo starting | 12-month min contract, annual billing. 3 license tiers: Shop, Office, Admin. |
| **Fulcrum Pro** | Flat monthly | $800+/mo | Cloud-native, all-in-one ERP/MRP/MES. Larger shops. |
| **SYSPRO** | Per user/month | $1,000–$2,500/mo | Mid-enterprise, not really a job shop product. |

#### MID-MARKET — Still Per-User

| Competitor | Model | Price | Notes |
|---|---|---|---|
| **MRPeasy** | Per user/month | $49–$149/user/mo | Starter $49, Professional $69, Unlimited $149. Popular for small mfg. A 5-person shop = $245–$745/mo. |
| **Fishbowl Manufacturing** | Cloud or perpetual | $329–$399/mo cloud | $4,395 perpetual license + $329/mo cloud. Additional users $1,795–$2,395 each. |

#### ADJACENT — Flat-Rate (Non-Manufacturing, but Model Comparable)

| Competitor | Model | Price | Notes |
|---|---|---|---|
| **Shopmonkey** (auto repair) | Flat monthly tiers | $179–$475/mo | Basic $179, Clever $324, Genius $475. Not manufacturing but flat-rate model is the same play. |
| **DigiFabster** (CNC quoting) | Annual subscription | $2,000–$50,000/yr | AI quoting tool for CNC shops. Not direct competition but shows shops will pay. |

---

### Analysis

**The flat-rate, unlimited-user model is a genuine market gap.** Every major competitor charges per user. A 10-person shop using JobBOSS² at $50/user is already at $500/month — with nothing but the ERP and a 6-month implementation ahead of them.

**Our current pricing:**
- Starter (1 module): **$99/mo**
- Shop Suite (all modules): **$299/mo**
- Website Design: **from $1,500** (one-time)

**Verdict on current pricing:**
- $99/mo for 1 module is well-positioned. Even MRPeasy's cheapest plan ($49/user) means a 2-person shop pays the same. At 5 people, they pay $245. We win every time.
- $299/mo for all modules is likely **underpriced** vs the market. ProShop starts at $500–$715 just to open the door. We're giving away 9 purpose-built modules for $299.
- There's a missing middle tier. Shops that want 3–4 modules but don't need all 9 have no option between $99 and $299 — a $199 tier could capture that.

---

### Recommended Pricing (Effective Q3 2026)

| Plan | Modules | Price | Rationale |
|---|---|---|---|
| **Starter** | Any 1 module, unlimited users | **$99/mo** | Keep. Strong vs per-user market. Easy first commitment. |
| **Growth** | Any 3 modules, unlimited users | **$199/mo** | New mid-tier. Captures shops that outgrow Starter but aren't ready for full suite. |
| **Shop Suite** | All 9 modules, unlimited users | **$349/mo** | Raise from $299. Still 30–50% below ProShop/Fulcrum entry price. Adds $50/mo = $600/yr in revenue per customer. |
| **Website Design** | Custom build | **from $1,500** | Keep. One-time project fee. +$99/mo maintenance optional. |

**Why raise Shop Suite to $349 instead of $299?**
- ProShop starts at $500–$715/month before implementation.
- Fulcrum Pro starts at $800+/month.
- $349 is still a 50–55% discount to market for equivalent scope.
- The value story doesn't change — it's still "less than one hour of shop rate per day."
- A $50 increase is below the threshold that causes churn in B2B SaaS.

**Why add a Growth tier at $199?**
- The jump from $99 to $299 ($200 increase) is the biggest friction point in the funnel.
- Shops often start with 1 module and after 30–60 days want to add scheduling + costing together.
- $199 for 3 modules gives them a structured upgrade path without the jump to full suite.
- Also anchors the Suite at $349 as clearly "best value."

---

### Action Items

- [ ] Update website pricing section to reflect new tiers (if approved)
- [ ] Update `index.html` pricing cards (add Growth tier, update Suite to $349)
- [ ] Update `tools.html` bottom CTA copy
- [ ] Update Supabase form to capture which plan a lead is interested in
- [ ] Revisit at Q4 2026 — check JobBOSS² and MRPeasy for price changes

---

*Sources:*
- [JobBOSS² Pricing — Capterra](https://www.capterra.com/p/219273/JobBOSS/pricing/)
- [JobBOSS² Pricing — ECi Official](https://www.ecisolutions.com/products/jobboss2/job-shop-software-pricing/)
- [ProShop ERP Pricing — Official](https://proshoperp.com/pricing/)
- [ProShop ERP — Capterra](https://www.capterra.com/p/155436/ProShop/)
- [E2 Shop System Pricing — ITQlick](https://www.itqlick.com/e2-shop-system/pricing)
- [Fishbowl Manufacturing Pricing — Capterra](https://www.capterra.com/p/123794/Fishbowl/)
- [MRPeasy Pricing — Capterra](https://www.capterra.com/p/134177/MRPEasy/)
- [Shopmonkey Pricing — Official](https://www.shopmonkey.io/pricing)
- [Fulcrum Pro — SelectHub](https://www.selecthub.com/p/manufacturing-software/fulcrum-pro/)
- [Best Job Shop Software 2026 — Capterra](https://www.capterra.com/job-shop-software/)
