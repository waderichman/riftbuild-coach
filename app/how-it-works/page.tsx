export default function HowItWorksPage() {
  return (
    <main className="legal-page">
      <h1>How It Works</h1>
      <p>
        RiftBuild Coach uses historical League match data to recommend item and rune setups for your champion against the enemy team.
      </p>
      <section>
        <h2>1. Data Collection</h2>
        <p>
          We ingest Riot API match data from sampled players, then normalize match patch, roles, builds, and enemy composition features.
        </p>
      </section>
      <section>
        <h2>2. Aggregation</h2>
        <p>
          We group builds by champion, role, rank tier, patch, and enemy composition key, then rank by win rate and sample size confidence.
        </p>
      </section>
      <section>
        <h2>3. Recommendation Flow</h2>
        <p>
          The app tries an exact enemy composition match first, then exact feature bucket, then nearest bucket, then fallback logic if needed.
        </p>
      </section>
      <section>
        <h2>4. Confidence</h2>
        <p>
          Confidence increases with stronger win rates and larger sample sizes. Small samples can still appear, but are naturally scored lower.
        </p>
      </section>
    </main>
  );
}
