# Devpost submission kit

Fill the `[brackets]` before submitting. Track: **eCommerce VTO**.

## Name and tagline

**Look DNA**: Screenshot any look. We find the pieces, adapt the shades to your skin tone, fit it to your budget, and show it on you before you buy.

## Description (paste into Devpost)

### Inspiration
Shoppers save looks from Instagram and Pinterest every day, then struggle to recreate them. The pieces are hard to find, often over budget, and the look was usually worn by someone with a different skin tone, so the same lipstick or blush won't read the same way on you.

### What it does
Upload a screenshot of any outfit or makeup look, take a selfie, and set a budget. Look DNA:

1. **Reads the look.** Google Gemini breaks the image into its "Look DNA": each garment and makeup element with its colour and style.
2. **Adapts it to you.** YouCam Skin Tone Analysis reads your skin tone. Each makeup shade is shifted warmer or cooler to suit your undertone, with a one-line reason, for example "A warmer red suits your warm undertone".
3. **Fits your budget.** Every element is matched to a real product by colour and style. If the look goes over budget, the most expensive piece is swapped for the next best cheaper match until the total fits.
4. **Shows it on you.** YouCam Clothes Virtual Try-On puts the matched garment on your selfie, then YouCam Makeup Virtual Try-On applies your adapted lip shade on top. A toggle compares it with the original inspiration.
5. **Lets you shop.** A cart with prices, buy links, a budget bar, and a match score on every item labelled "similar, not identical". Don't like a piece? Swap it for the next best match.

### How we built it
- Next.js (App Router) + React + TypeScript + Tailwind, deployed on Vercel. Mobile-first, six screens, no accounts or database.
- **YouCam APIs:** Skin Tone Analysis, Clothes Virtual Try-On and Makeup Virtual Try-On, called server-side with the async task flow and cached by image hash so a photo never spends units twice.
- **Quality gate:** before any paid API call, the selfie is checked locally for brightness, blur and exactly one visible face, with a specific retake message.
- **Google Gemini** (vision) extracts the look as strict, schema-validated JSON.
- **Matching and budget logic are plain deterministic code**, not an LLM: colour distance in Lab space plus style-tag overlap, undertone rules for shade adaptation, and a greedy swap loop for the budget.

### Challenges we ran into
[e.g. chaining clothes try-on into makeup try-on, YouCam task polling and timeouts, getting shade adaptation to look right across skin tones]

### Accomplishments we're proud of
- Makeup shades adapted to the shopper's own undertone, explained in plain language.
- Under budget in [10] of 10 test runs, with [X]% of look items matched.
- Three YouCam APIs working together in one shopping flow.

### What we learned
[fill in]

### What's next
Eye and cheek try-on, live product search across retailers, and saving looks to compare.

### Consumer and retail value
- **Shoppers** recreate a look they love at a price they can afford, in shades that suit them, and see it on themselves before buying.
- **Retailers** turn social inspiration into a full basket (outfit plus makeup) with fewer returns, because the shopper has already seen the shades and fit on their own photo.
- **Inclusion:** inspiration images rarely match the shopper's skin tone. Look DNA adapts the look to the person instead of the other way round.

### Built with
nextjs, react, typescript, tailwindcss, vercel, youcam-api, gemini, sharp, tensorflow.js

## Video script (target 1:45, max 3:00)

No copyrighted music, no third-party brand logos. Record on a phone or a phone-sized browser. Pre-run the demo images so results come from cache.

| Time | On screen | Voice-over |
| --- | --- | --- |
| 0:00–0:12 | Scrolling a saved-looks folder | "We all save looks we love. Recreating them is the hard part: the pieces are expensive, and the shades were picked for someone else's skin." |
| 0:12–0:20 | App home screen | "Look DNA turns any screenshot into a look made for you, on your budget, and shows it on you before you buy." |
| 0:20–0:35 | Upload inspiration, then selfie. Show one retake message with a dark photo first | "Upload any look, then a selfie. A quick quality check catches dark or blurry photos before we spend a single API call." |
| 0:35–0:50 | Set budget ₹3,000, Look DNA card | "Set your budget. Gemini reads the look: lilac oversized knit, wide-leg denim, a rosy matte lip." |
| 0:50–1:10 | Adapted-to-you screen | "YouCam Skin Tone Analysis reads my skin tone: warm undertone. So the lip shifts to a warmer red, and every shade tells you why." |
| 1:10–1:30 | Try-on loading, result, compare toggle | "Then YouCam Clothes Virtual Try-On dresses me in the matched top, and YouCam Makeup Virtual Try-On applies the adapted lip on top. Here it is next to the original." |
| 1:30–1:42 | Cart, budget bar, tap Swap | "Every piece is a real product, similar not identical, with a match score. The total stays under budget, and I can swap anything." |
| 1:42–1:45 | Logo / URL | "Look DNA. Screenshot it, adapt it, try it, buy it." |

## Screenshots (all six screens)

Take at phone width (390 × 844) from the live app:

1. `/` inspiration uploaded
2. `/selfie` with a retake banner, and one with a passing selfie and budget
3. `/dna` Look DNA card
4. `/adapt` tone badge and before/after shades
5. `/tryon` result, and the compare view
6. `/cart` with the budget bar and match scores

## Checklist

- [ ] Real catalog in `data/catalog.csv`, imported with `npm run catalog:import`
- [ ] Deployed on Vercel with `YOUCAM_API_KEY`, `GEMINI_API_KEY` (and ideally Upstash) set, mock flags unset
- [ ] 10-image test run, results pasted into the README
- [ ] Repo public with a license, **or** private and shared with contact_event@PerfectCorp.com
- [ ] README: setup steps, YouCam APIs used, architecture, test results
- [ ] Devpost description (above), with the brackets filled in
- [ ] Screenshots of all six screens
- [ ] Video 1–3 min, public on YouTube, names the YouCam APIs, shows the app running on a device
- [ ] No copyrighted music or third-party trademarks in the video
- [ ] Women in Tech award eligibility reflected in the registration, if it applies
- [ ] Demo video shared online for bonus API units
