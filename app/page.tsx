import type { CSSProperties } from "react";
import Link from "next/link";

import "./landing.css";

const STEPS = [
  { title: "Drop a screenshot", body: "Any outfit or makeup look from Instagram, Pinterest or a magazine." },
  { title: "Add a selfie and budget", body: "A quick check makes sure the photo is bright, sharp and shows one face." },
  { title: "Read the Look DNA", body: "Each garment and shade in the look, with its colour and style." },
  { title: "Adapt it to you", body: "Your skin tone is read, and each makeup shade is tuned to your undertone, with a reason." },
  { title: "See it on you", body: "Virtual try-on puts the matched outfit and your adapted lip shade on your selfie." },
  { title: "Shop within budget", body: "Real products, prices and links, each marked similar, not identical. Swap any piece." },
];

/** Real outputs of the app's shade adaptation (lib/matching.ts adaptShade). */
const SHADES = [
  { from: "#B5485D", to: "#B24D46", reason: "A warmer pink suits your warm undertone", label: "Lip, warm undertone" },
  { from: "#E2725B", to: "#E86B71", reason: "A cooler pink suits your cool undertone", label: "Lip, cool undertone" },
  { from: "#F0A6B4", to: "#D38D8A", reason: "A warmer blush, in a richer depth for deeper skin", label: "Cheek, warm undertone" },
];

const POWERED_BY = [
  { name: "YouCam Skin Tone Analysis", use: "Reads your skin tone from the selfie" },
  { name: "YouCam Clothes Virtual Try-On", use: "Puts the matched garment on you" },
  { name: "YouCam Makeup Virtual Try-On", use: "Applies your adapted lip shade" },
  { name: "Google Gemini", use: "Reads the pieces in your inspiration" },
];

function Chip({ color, label }: { color: string; label: string }) {
  return <span className="chip" style={{ "--chip": color } as CSSProperties} role="img" aria-label={label} />;
}

/** The signature: one look, broken down the way the app does it. */
function LookSheet() {
  // A real result of /api/match against data/catalog.json: a red midi look, warm undertone, ₹3,000 budget.
  const pieces = [
    {
      src: "https://cdn.shopify.com/s/files/1/0261/2386/2082/files/KazoSS26_23636.jpg?v=1767161066&width=200",
      name: "Kazo, Athena midi dress with belt",
      price: "₹1,754",
      match: "67% match",
    },
    {
      src: "https://cdn.shopify.com/s/files/1/0906/2558/files/Glide-Peptide-Serum-Lipstick-1-11.jpg?v=1789987713&width=200",
      name: "SUGAR, Glide Peptide Serum Lipstick, Positano Peach",
      price: "₹499",
      match: "92% match",
    },
  ];
  return (
    <aside className="sheet" aria-label="Example Look DNA for one saved look">
      <div className="sheet-head">
        <h2>One look, decoded</h2>
        <span className="label muted">Warm undertone</span>
      </div>
      <ul className="pieces">
        {pieces.map((piece) => (
          <li key={piece.src} className="piece">
            <img src={piece.src} alt="" width={64} height={72} />
            <div>
              <p className="piece-name">{piece.name}</p>
              <p className="label muted">Similar, not identical, {piece.match}</p>
            </div>
            <span className="label">{piece.price}</span>
          </li>
        ))}
      </ul>
      <div className="shade-row">
        <Chip color="#B5485D" label="Original lip shade" />
        <Chip color="#B24D46" label="Lip shade adapted for you" />
        <p className="label">A warmer pink suits your warm undertone</p>
      </div>
      <div className="total">
        <span className="label muted">Total, budget ₹3,000</span>
        <span className="total-figure">₹2,253</span>
      </div>
    </aside>
  );
}

export default function LandingPage() {
  return (
    <div className="ed">
      <div className="container">
        <header className="nav">
          <Link href="/" className="wordmark">
            Look DNA
          </Link>
          <Link href="/start" className="btn btn--primary">
            Try it
          </Link>
        </header>

        <main>
          <section className="hero" aria-labelledby="hero-title">
            <div>
              <h1 id="hero-title">Screenshot any look. Wear it your way.</h1>
              <p className="lead">Your skin tone, your budget, on you before you buy.</p>
              <div className="actions">
                <Link href="/start" className="btn btn--primary">
                  Try it with a screenshot
                </Link>
                <a href="#how-it-works" className="btn btn--secondary">
                  See how it works
                </a>
              </div>
              <p className="label muted" style={{ marginTop: "var(--space-md)" }}>
                Free, no account, works on your phone.
              </p>
            </div>
            <LookSheet />
          </section>

          <section className="statement opens" aria-label="The problem with saved looks">
            <p className="label muted">The problem with saved looks</p>
            <p className="standfirst">
              The pieces cost too much, the shades were chosen for someone else’s skin, and you only see it on you
              after you buy.
            </p>
          </section>

          <section id="how-it-works" className="opens" aria-labelledby="how-title" style={{ scrollMarginTop: 24 }}>
            <div className="section-head">
              <h2 id="how-title">How it works</h2>
              <p>Six steps, about a minute from screenshot to cart.</p>
            </div>
            <ol className="rows">
              {STEPS.map((step, index) => (
                <li key={step.title} className="row">
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                  <span className="row-num" aria-hidden>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </main>
      </div>

      <section className="band" aria-labelledby="shades-title" style={{ marginTop: "var(--section-gap)" }}>
        <div className="container">
          <h2 id="shades-title">Shades that suit you</h2>
          <p className="muted" style={{ marginTop: "var(--space-md)", maxWidth: "52ch" }}>
            The look you saved was worn by someone else. Each shade shifts to your undertone, and says why.
          </p>
          <div className="shades">
            {SHADES.map((shade) => (
              <div key={shade.label} className="shade">
                <div className="pair">
                  <Chip color={shade.from} label={`Original ${shade.from}`} />
                  <Chip color={shade.to} label={`Adapted ${shade.to}`} />
                </div>
                <p>{shade.reason}</p>
                <p className="label muted">{shade.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="container">
        <section className="opens" aria-labelledby="who-title" style={{ marginTop: "var(--section-gap)" }}>
          <div className="section-head">
            <h2 id="who-title">Who it’s for</h2>
          </div>
          <div className="pair-cols">
            <div>
              <h3>Shoppers</h3>
              <p>
                Recreate the looks you save, in shades made for your skin tone, at a price you can afford, and see them
                on you first.
              </p>
            </div>
            <div>
              <h3>Retailers</h3>
              <p>
                Turn social inspiration into a complete basket of outfit plus makeup, with fewer returns because
                shoppers have already seen it on themselves.
              </p>
            </div>
          </div>
        </section>

        <section className="opens" aria-labelledby="powered-title">
          <div className="section-head">
            <h2 id="powered-title">Powered by</h2>
          </div>
          <table>
            <thead>
              <tr>
                <th className="label" scope="col">Service</th>
                <th className="label" scope="col">What it does</th>
              </tr>
            </thead>
            <tbody>
              {POWERED_BY.map((item) => (
                <tr key={item.name}>
                  <td>{item.name}</td>
                  <td>{item.use}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">
            Your photos are only used to build and preview your look. No account, no saved profile. Matching and
            budget decisions are plain, predictable rules, not guesswork.
          </p>
        </section>

        <section className="close opens" aria-labelledby="close-title">
          <div>
            <h2 id="close-title">Got a look saved? Try it on.</h2>
            <p style={{ marginTop: "var(--space-md)" }}>All you need is a screenshot and a selfie.</p>
          </div>
          <div className="actions">
            <Link href="/start" className="btn btn--primary">
              Start with a screenshot
            </Link>
          </div>
        </section>

        <footer className="footer">
          <span className="label">Look DNA</span>
          <span className="label muted">
            Built for the YouCam API Skin AI and eCommerce VTO Hackathon. Products are similar, not identical, to the
            inspiration.
          </span>
        </footer>
      </div>
    </div>
  );
}
