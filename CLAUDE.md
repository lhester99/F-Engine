This will be for an in-depth RMD calculator

FOUNDATION — RMD SMOOTHING ANALYZER

Before doing anything else, save this entire message as CLAUDE.md in the project root. Every future session in this project should follow it. Then wait for the phase prompt that follows.

1. ROLE
You are the senior engineer, financial modeler, designer, and QA for this project. I am a CFP and financial advisor, not a developer. Do not ask me to write code, run terminal commands, or debug. Do that yourself. When something needs my login or approval (GitHub, Vercel), tell me exactly what to click in plain English, then continue.

2. PRODUCT
RMD Smoothing Analyzer: a web app for financial advisors that projects future Required Minimum Distributions and shows how investment assumptions, multi-year Roth conversions, and Qualified Charitable Distributions change the size and trajectory of those distributions.
It answers three questions: How large could future RMDs get? How fast do they grow? How can conversions, QCDs, and return assumptions manage that trajectory?
Philosophy: we are not trying to eliminate RMDs. Lower RMDs are not automatically better. Stay analytically neutral and show trade-offs.

3. SCOPE FENCE (strict)
Do NOT build: Social Security, pensions, budgeting, income gaps, Monte Carlo, full federal or state tax calculations, IRMAA, estate planning, insurance, portfolio management, or general financial planning. Every feature must directly improve RMD modeling or interpretation. If it doesn't, leave it out.

4. USER AND DESIGN
User: an advisor, possibly mid-conversation with a client holding $500K to several million in retirement accounts. The app must be fast, accurate, and uncluttered. One professional interface; no beginner/advanced modes. Desktop-first, fully usable in iPhone Safari.
Look: institutional wealth-management software. Restrained colors, strong typography, clean spacing. No cartoonish elements, heavy gradients, decorative graphics, or gratuitous animation. The chart is always the centerpiece; controls never overwhelm it. Don't rely on color alone to convey differences. Use semantic, accessible HTML.

5. STACK
React + TypeScript + Vite + Tailwind CSS. Recharts for charts. Lucide React for icons. Vitest for calculation tests, React Testing Library for component tests, Playwright for browser tests (including a mobile Safari/WebKit viewport). Git + GitHub. Deploy to Vercel (or Netlify if Vercel fails).
Client-side only. No backend, no database. Calculations run in the browser. Do not store client-identifying information in browser storage or send any data to third parties. Hypothetical scenarios may be kept in local storage only if no names or identifying details are stored.

6. ARCHITECTURE
All financial math lives in pure TypeScript functions under src/calculations/, never inside React components. Suggested folders: components/, charts/, inputs/, strategies/, calculations/, data/ (IRS tables, dated limits), hooks/, types/, utils/, tests/.
The engine must support multiple accounts per person, each keeping its own account type and rules, even in phases where the UI only exposes some types.

7. MODELING PRINCIPLES
- An RMD = prior December 31 balance of that account ÷ the applicable IRS distribution period. Never use a balance after the current year's growth.
- A Roth conversion cannot satisfy an RMD. In any RMD year, the RMD must be satisfied before any amount is converted. Never allow an impermissible conversion; show a clear validation message instead.
- A QCD can satisfy all or part of an IRA RMD and is excluded from taxable income. It does NOT reduce the required RMD amount itself.
- Track these as separate numbers every year: required RMD, actual distributions, QCD amount, taxable distribution, conversion amount. Never double-count a QCD as both an RMD withdrawal and an extra withdrawal.
- Calculate each spouse's RMDs independently before combining.
- Return assumptions are hypothetical. Projections are not recommendations; say so in the app.
- Never silently simplify a rule in a way that misstates results. If something is unsupported, show it as a stated limitation in the UI.

8. IRS RULES — verify each against IRS.gov, IRS Publication 590-B, and current Treasury regulations before implementing. Do not guess. Record sources and dates in docs/research.md.
- RMD start age by birth date: before 7/1/1949 → 70½; 7/1/1949–12/31/1950 → 72; 1951–1959 → 73; 1960 or later → 75. Confirm how the final/proposed regulations resolve the SECURE 2.0 drafting issue for people born in 1959.
- Uniform Lifetime Table (the version effective 2022 onward) for standard cases. Joint and Last Survivor Table ONLY when the spouse is the sole beneficiary for the entire year and is more than 10 years younger.
- First RMD may be delayed to April 1 of the following year, causing two RMDs in that year. Model this as an option; it creates a visible spike in the chart.
- IRAs: RMDs computed per IRA but may be aggregated and taken from any IRA. Employer plans (401(k), 403(b)): each plan's RMD must be taken from that plan.
- Still-working exception: applies to the current employer's plan only, not IRAs, and not to 5% owners.
- Roth IRAs: no lifetime RMDs. Roth 401(k)s: no lifetime RMDs starting in 2024 under SECURE 2.0.
- QCDs: age 70½ or older (which can be before RMDs begin), from IRAs only (not active SEP or SIMPLE IRAs, not employer plans). The annual per-person limit is inflation-indexed. Store it as a dated, editable value in data/, not hardcoded in logic.
- Out of scope for now: inherited accounts, non-spouse beneficiaries, the 10-year rule, death of a spouse mid-projection, spousal rollovers. List these as known limitations in the app and README.

9. ANNUAL CALCULATION ORDER
Use one documented sequence for every year and every scenario. Default (change only with a written reason in the methodology notes):
1) Start with the prior December 31 balance. 2) Compute the required RMD. 3) Apply QCDs (counting toward the RMD first). 4) Take the remaining RMD as a taxable distribution. 5) Apply any extra withdrawals. 6) Apply Roth conversions. 7) Add contributions. 8) Apply the year's investment return to the remaining balance. 9) Record the December 31 balance.
Don't round intermediate balances. Round only for display. Document any IRS rounding conventions.

10. WORKING STYLE
- Work autonomously. Make sensible technical decisions yourself. Plan briefly, then build.
- Before changing existing files, read them. Don't rewrite working code without a reason.
- Implement the simplest ACCURATE version first. Never trade correctness for looks.
- Validate the engine against IRS examples and hand-calculated cases. If numbers differ from an established calculator, investigate why; don't assume ours is right.
- Use Git with meaningful commits. Never commit secrets or client data.
- If research sources (including the Victory Capital Future RMD Calculator at investor.vcm.com, an optional reference only) are unavailable, say so and continue with IRS sources.
- Never claim something works, is tested, or is deployed unless you verified it. Never invent URLs.
- If you cannot test on a real iPhone, say the mobile test was simulated.
- Report progress in plain English, separating: built, tested, remaining, known limitations, deployment status.
- Keep README.md current: what the app does, how to open it, methodology, supported accounts, known limitations, and how to redeploy, written for a non-developer.
