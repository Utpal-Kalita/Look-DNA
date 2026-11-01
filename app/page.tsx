import Link from "next/link";

const STEPS = [
  {
    title: "Drop a screenshot",
    body: "Any outfit or makeup look from Instagram, Pinterest or a magazine.",
    icon: "🖼️",
  },
  {
    title: "Add a selfie and budget",
    body: "A quick check makes sure the photo is bright, sharp and shows one face.",
    icon: "🤳",
  },
  {
    title: "Read the Look DNA",
    body: "AI breaks the look into pieces: each garment and shade, with its colour and style.",
    icon: "🧬",
  },
  {
    title: "Adapt it to you",
    body: "Your skin tone is analysed and every makeup shade is tuned to your undertone, with a reason.",
    icon: "🎨",
  },
  {
    title: "See it on you",
    body: "Virtual try-on dresses your selfie in the matched outfit and your adapted lip shade.",
    icon: "✨",
  },
  {
    title: "Shop within budget",
    body: "Real products with prices and links. The total stays under budget, and any piece can be swapped.",
    icon: "🛍️",
  },
];

const FEATURES = [
  {
    title: "Shades that suit you",
    body: "The look you saved was worn by someone else. Look DNA shifts lip and cheek shades warmer or cooler to suit your undertone, and tells you why.",
  },
  {
    title: "Your budget, not theirs",
    body: "Set a budget in rupees. If the look goes over, the priciest piece is swapped for the next best match until it fits.",
  },
  {
    title: "Try before you buy",
    body: "See the outfit and lip shade on your own photo, side by side with the original inspiration.",
  },
  {
    title: "Honest matches",
    body: "Every product is labelled similar, not identical, with a match score, so you know exactly how close it is.",
  },
];

const AUDIENCES = [
  {
    title: "For shoppers",
    body: "Recreate the looks you save, in shades made for your skin tone, at a price you can afford, and see them on you first.",
  },
  {
    title: "For retailers",
    body: "Turn social inspiration into a complete basket of outfit plus makeup, with fewer returns because shoppers have already seen it on themselves.",
  },
];

const POWERED_BY = [
  { name: "YouCam Skin Tone Analysis", use: "Reads your skin tone from the selfie" },
  { name: "YouCam Clothes Virtual Try-On", use: "Puts the matched garment on you" },
  { name: "YouCam Makeup Virtual Try-On", use: "Applies your adapted lip shade" },
  { name: "Google Gemini", use: "Reads the pieces in your inspiration" },
];

function Cta({ children = "Try it with a screenshot" }: { children?: string }) {
  return (
    <Link
      href="/start"
      className="inline-flex items-center justify-center rounded-xl bg-accent px-6 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-accent-dark"
    >
      {children} →
    </Link>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex flex-col items-center gap-1">
      <span
        className="h-10 w-10 rounded-full border border-black/10 shadow-inner"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="text-[11px] text-muted">{label}</span>
    </span>
  );
}

function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-sm" aria-label="Example: a saved look adapted to a warm undertone and matched within budget" role="img">
      <div className="rounded-3xl bg-white p-5 shadow-lg">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">Look DNA</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { src: "/catalog/top-001.png", label: "Knit top" },
            { src: "/catalog/btm-001.png", label: "Wide-leg denim" },
            { src: "/catalog/lip-004.png", label: "Rosy lip" },
          ].map((item) => (
            <figure key={item.src} className="rounded-xl bg-cream p-2 text-center">
              <img src={item.src} alt="" className="mx-auto h-20 w-full object-contain" />
              <figcaption className="mt-1 text-[11px] text-muted">{item.label}</figcaption>
            </figure>
          ))}
        </div>

        <div className="mt-4 rounded-2xl bg-cream p-3">
          <p className="text-xs font-medium">Adapted to a warm undertone</p>
          <div className="mt-2 flex items-center gap-3">
            <Swatch color="#B5485D" label="Original" />
            <span className="text-muted" aria-hidden>→</span>
            <Swatch color="#A8473F" label="For you" />
          </div>
          <p className="mt-2 text-xs text-muted">A warmer red suits your warm undertone</p>
        </div>

        <div className="mt-4">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted">Total</span>
            <span className="font-semibold">₹2,996 of ₹3,000</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-blush">
            <div className="h-full w-[99%] rounded-full bg-accent" />
          </div>
        </div>
      </div>
      <span className="absolute -right-2 -top-3 rotate-3 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white shadow">
        Similar, not identical · 97%
      </span>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <span className="text-lg font-bold tracking-tight text-accent">Look DNA</span>
        <Link href="/start" className="rounded-full border border-accent px-4 py-1.5 text-sm font-semibold text-accent">
          Try it
        </Link>
      </header>

      <main>
        <section className="mx-auto grid max-w-5xl items-center gap-10 px-4 pb-16 pt-6 md:grid-cols-2 md:pt-12">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-accent">Screenshot to shopping cart</p>
            <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              Screenshot any look. Wear it your way.
            </h1>
            <p className="mt-4 text-lg text-muted">
              We find the pieces, adapt the shades to your skin tone, fit it to your budget, and show it on you
              before you buy.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Cta />
              <a href="#how-it-works" className="text-center text-sm font-medium text-ink underline underline-offset-4">
                See how it works
              </a>
            </div>
            <p className="mt-4 text-xs text-muted">Free · no account · works on your phone</p>
          </div>
          <HeroVisual />
        </section>

        <section className="bg-white py-14">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold md:text-3xl">The problem with saved looks</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                "The pieces are hard to find, and the originals are often way over budget.",
                "The look was worn by someone with a different skin tone, so the same shades read differently on you.",
                "Try-on and shopping live in separate apps, so you buy first and find out later.",
              ].map((text) => (
                <p key={text} className="rounded-2xl bg-cream p-5 text-sm">
                  {text}
                </p>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-6 py-16">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold md:text-3xl">How it works</h2>
            <p className="mt-2 text-muted">Six quick steps, about a minute from screenshot to cart.</p>
            <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="rounded-2xl bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
                      {index + 1}
                    </span>
                    <span className="text-2xl" aria-hidden>
                      {step.icon}
                    </span>
                  </div>
                  <h3 className="mt-3 font-semibold">{step.title}</h3>
                  <p className="mt-1 text-sm text-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bg-white py-16">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold md:text-3xl">Why it's different</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="rounded-2xl border border-blush p-5">
                  <h3 className="font-semibold">{feature.title}</h3>
                  <p className="mt-1 text-sm text-muted">{feature.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold md:text-3xl">Who it's for</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {AUDIENCES.map((audience) => (
                <div key={audience.title} className="rounded-2xl bg-blush p-6">
                  <h3 className="text-lg font-semibold">{audience.title}</h3>
                  <p className="mt-2 text-sm">{audience.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white py-16">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold md:text-3xl">Powered by</h2>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {POWERED_BY.map((item) => (
                <li key={item.name} className="flex items-start gap-3 rounded-2xl bg-cream p-4">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />
                  <div>
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-sm text-muted">{item.use}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-muted">
              Your photos are only used to build and preview your look. No account, no saved profile. Matching and
              budget decisions are plain, predictable rules, not guesswork.
            </p>
          </div>
        </section>

        <section className="py-20 text-center">
          <div className="mx-auto max-w-2xl px-4">
            <h2 className="text-3xl font-bold">Got a look saved? Try it on.</h2>
            <p className="mt-3 text-muted">Takes about a minute. All you need is a screenshot and a selfie.</p>
            <div className="mt-8">
              <Cta>Start with a screenshot</Cta>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-blush py-8 text-center text-xs text-muted">
        Look DNA · Built for the YouCam API Skin AI &amp; eCommerce VTO Hackathon · Products are similar, not identical,
        to the inspiration.
      </footer>
    </div>
  );
}
