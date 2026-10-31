# Look DNA — YouCam API Hackathon project

## What we're building
Look DNA turns a fashion/beauty inspiration image into a complete, purchasable look,
adapted to the user's skin tone and budget, shown on the user's selfie before they buy.
Hackathon: YouCam API Skin AI & eCommerce VTO (Devpost). Track: eCommerce VTO.
Deadline: 2 Nov 2026, 10:15pm IST. Team target: submit by 6pm IST. Feature freeze: 1 Nov, 10pm IST.

Full spec: `docs/PRD.md` (read it before large changes).

## Stack
- Next.js (App Router) + React + TypeScript + Tailwind, one app, deployed on Vercel
- Backend = Next.js API routes (serverless). No database, no accounts.
- Flow state lives in React context on the client.

## Ownership
- Backend (Utpal): everything under `app/api/` and `lib/`, plus `data/mocks/`
- Frontend (Ruchi): all screens under `app/` (except `app/api/`), `app/components/`, `data/catalog.json`
- Shared: `lib/types.ts` (data contract). Change it only with both owners agreeing.

## Folder structure
```
app/
  page.tsx                 screen 1: upload inspiration
  selfie/                  screen 2: selfie + budget, retake banner
  dna/                     screen 3: Look DNA card
  adapt/                   screen 4: skin tone + adapted shades
  tryon/                   screen 5: try-on result + compare toggle
  cart/                    screen 6: cart, budget bar, swap
  components/
  api/
    quality/route.ts       selfie -> pass | retake message (local brightness/blur check)
    skin-tone/route.ts     selfie -> userTone (YouCam Skin Tone Analysis)
    extract/route.ts       inspiration image -> items (vision LLM, strict JSON)
    match/route.ts         items + userTone + budget -> matches + total (catalog.json only)
    tryon/route.ts         selfie + matches -> image (YouCam Clothes VTO, then Makeup VTO)
lib/
  types.ts  youcam.ts  llm.ts  matching.ts  cache.ts
data/
  catalog.json
  mocks/
```

## Data contract (lib/types.ts must match this)
```json
{
  "items": [
    {"category": "top", "color": "#C8A2C8", "style": ["oversized", "knit"]},
    {"category": "lipstick", "color": "#B5485D", "finish": "matte"}
  ],
  "userTone": {"hex": "#C68E6B", "undertone": "warm"},
  "budget": 3000,
  "matches": [
    {"category": "lipstick", "productId": "lip-014", "adaptedColor": "#A8473F",
     "reason": "A warmer red suits your warm undertone", "score": 0.86, "price": 499}
  ],
  "total": 2850
}
```
Catalog item: `{id, name, brand, category, price, image, color, style[], link}`. Prices in INR.

## Rules
- YouCam and LLM API keys are server-side only (`.env.local`), never sent to the browser.
- YouCam endpoints and the async task flow: follow https://docs.perfectcorp.com exactly.
  Never guess endpoint names or parameters; if unsure, stop and ask.
- Cache every YouCam result by image hash. We have limited API units.
- `MOCK_YOUCAM=1` makes every YouCam route return saved responses from `data/mocks/`.
  Frontend work always runs in mock mode.
- Matching and budget logic is plain deterministic code, not the LLM.
- Label every matched product "similar, not identical" with its match score.
- Cosmetic language only. No medical or skin-condition claims.
- Mobile-first UI with loading and error states on every API call.
- After the feature freeze: bug fixes only.

## Fallbacks (use instead of adding scope)
- Makeup VTO too hard -> ship clothes try-on + lipstick only.
- Chaining clothes -> makeup fails -> show both results side by side.
- Poor matches -> narrow catalog to top, dress, lipstick.

## Commands
- `npm run dev` — local dev
- `npm run build` — must pass before every push
