"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { championOptions as fallbackChampionOptions } from "@/lib/lol";
import type { EnemyRole, RecommendResponse, RoleFilter } from "@/lib/types";

type ChampionCatalogResponse = {
  champions: string[];
};

type AssetCatalogResponse = {
  version: string;
  itemIcons: Record<string, string>;
  runeIcons: Record<string, string>;
};

type RoleOption = { value: RoleFilter; label: string };
type EnemyRoleOption = { value: EnemyRole; label: string };

type ChampionSelectProps = {
  label: string;
  value: string;
  options: string[];
  onChange: (next: string) => void;
  panelId: string;
};

const CHAMPIONS_CACHE_KEY = "riftbuild:champions:v1";
const ASSETS_CACHE_KEY = "riftbuild:assets:v1";

const roleOptions: RoleOption[] = [
  { value: "ANY", label: "Any" },
  { value: "TOP", label: "Top" },
  { value: "JUNGLE", label: "Jungle" },
  { value: "MIDDLE", label: "Middle" },
  { value: "BOTTOM", label: "Bottom" },
  { value: "UTILITY", label: "Support" }
];

const enemyRoleOptions: EnemyRoleOption[] = [
  { value: "TOP", label: "Top" },
  { value: "JUNGLE", label: "Jungle" },
  { value: "MIDDLE", label: "Middle" },
  { value: "BOTTOM", label: "Bottom" },
  { value: "UTILITY", label: "Support" }
];
const defaultEnemyRoles: EnemyRole[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

function displayRole(role: string): string {
  return role === "UTILITY" ? "SUPPORT" : role;
}

function getMatchTag(notes: string[]): { label: string; tone: "exact" | "bucket" | "near" | "fallback" } {
  const text = notes.join("\n");
  if (text.includes("Exact enemy composition match found")) return { label: "Exact Comp Match", tone: "exact" };
  if (text.includes("Feature bucket matched")) return { label: "Exact Bucket Match", tone: "bucket" };
  if (text.includes("nearest bucket")) return { label: "Nearest Bucket", tone: "near" };
  return { label: "Fallback", tone: "fallback" };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

function ChampionSelect({ label, value, options, onChange, panelId }: ChampionSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((name) => name.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    function onOutsideClick(event: MouseEvent) {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onOutsideClick);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onOutsideClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  return (
    <div className="combo" ref={rootRef}>
      <span>{label}</span>
      <button
        type="button"
        className="combo-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span>{value}</span>
        <span className={`combo-caret ${open ? "open" : ""}`}>▾</span>
      </button>

      {open ? (
        <div className="combo-panel" id={panelId}>
          <input
            className="combo-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search champion..."
          />
          <div className="combo-options">
            {filtered.length === 0 ? <p className="combo-empty">No champion found.</p> : null}
            {filtered.map((name) => (
              <button
                type="button"
                className={`combo-option ${name === value ? "active" : ""}`}
                key={`${panelId}-${name}`}
                onClick={() => {
                  onChange(name);
                  setOpen(false);
                  setQuery("");
                }}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function HomePage() {
  const [availableChampions, setAvailableChampions] = useState<string[]>(fallbackChampionOptions);
  const [assets, setAssets] = useState<AssetCatalogResponse>({ version: "", itemIcons: {}, runeIcons: {} });

  const [playerChampion, setPlayerChampion] = useState(fallbackChampionOptions[0] || "");
  const [enemyChampions, setEnemyChampions] = useState<string[]>(Array(5).fill(fallbackChampionOptions[0] || ""));
  const [enemyRoles, setEnemyRoles] = useState<EnemyRole[]>(defaultEnemyRoles);

  const [patch, setPatch] = useState("latest");
  const [role, setRole] = useState<RoleFilter>("ANY");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RecommendResponse | null>(null);

  useEffect(() => {
    let active = true;

    const cachedChampions = sessionStorage.getItem(CHAMPIONS_CACHE_KEY);
    const cachedAssets = sessionStorage.getItem(ASSETS_CACHE_KEY);

    if (cachedChampions) {
      try {
        const parsed = JSON.parse(cachedChampions) as ChampionCatalogResponse;
        if (Array.isArray(parsed.champions) && parsed.champions.length > 0) {
          const next = parsed.champions;
          setAvailableChampions(next);
          setPlayerChampion((current) => (next.includes(current) ? current : next[0]));
          setEnemyChampions((current) => {
            if (current.length !== 5) return Array(5).fill(next[0]);
            return current.map((champ) => (next.includes(champ) ? champ : next[0]));
          });
        }
      } catch {
        // ignore bad cache
      }
    }

    if (cachedAssets) {
      try {
        const parsed = JSON.parse(cachedAssets) as AssetCatalogResponse;
        if (parsed && typeof parsed === "object") setAssets(parsed);
      } catch {
        // ignore bad cache
      }
    }

    if (!cachedChampions) {
      fetchJson<ChampionCatalogResponse>("/api/champions")
        .then((payload) => {
          if (!active || !Array.isArray(payload.champions) || payload.champions.length === 0) return;
          const next = payload.champions;
          setAvailableChampions(next);
          setPlayerChampion((current) => (next.includes(current) ? current : next[0]));
          setEnemyChampions((current) => {
            if (current.length !== 5) return Array(5).fill(next[0]);
            return current.map((champ) => (next.includes(champ) ? champ : next[0]));
          });
          sessionStorage.setItem(CHAMPIONS_CACHE_KEY, JSON.stringify(payload));
        })
        .catch(() => {
          // Keep local fallback list.
        });
    }

    if (!cachedAssets) {
      fetchJson<AssetCatalogResponse>("/api/assets")
        .then((payload) => {
          if (!active) return;
          setAssets(payload);
          sessionStorage.setItem(ASSETS_CACHE_KEY, JSON.stringify(payload));
        })
        .catch(() => {
          // Icons stay hidden if fetch fails.
        });
    }

    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const payload = await fetchJson<RecommendResponse>("/api/recommend", {
        method: "POST",
        body: JSON.stringify({ playerChampion, enemyChampions, enemyRoles, patch, role, rankTier: "ANY" })
      });
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recommendations");
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  function updateEnemyChampion(index: number, value: string) {
    const next = [...enemyChampions];
    next[index] = value;
    setEnemyChampions(next);
  }

  function updateEnemyRole(index: number, value: EnemyRole) {
    const next = [...enemyRoles];
    next[index] = value;
    setEnemyRoles(next);
  }

  const matchTag = useMemo(() => (result ? getMatchTag(result.notes) : null), [result]);

  return (
    <main className="home-page">
      <section className="hero-block">
        <h1>
          Know the best build
          <br />
          <span>in seconds.</span>
        </h1>
        <p>
          Draft your enemy team, select roles, and get the strongest statistical builds with sample size and confidence.
        </p>
      </section>

      <form className="analysis-panel" onSubmit={submit}>
        <div className="form-top">
          <ChampionSelect
            label="Your Champion"
            value={playerChampion}
            options={availableChampions}
            onChange={setPlayerChampion}
            panelId="your-champions"
          />
          <label>
            Your Role
            <select value={role} onChange={(e) => setRole(e.target.value as RoleFilter)}>
              {roleOptions.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </label>
          <label>
            Patch
            <input value={patch} onChange={(e) => setPatch(e.target.value)} placeholder="latest or 16.3" />
          </label>
        </div>

        <div className="enemy-grid">
          {enemyChampions.map((value, idx) => (
            <div key={`enemy-${idx}`} className="enemy-card">
              <ChampionSelect
                label={`Enemy ${idx + 1}`}
                value={value}
                options={availableChampions}
                onChange={(next) => updateEnemyChampion(idx, next)}
                panelId={`enemy-champion-${idx + 1}`}
              />
              <label>
                Role
                <select value={enemyRoles[idx]} onChange={(e) => updateEnemyRole(idx, e.target.value as EnemyRole)}>
                  {enemyRoleOptions.map((r) => (
                    <option key={`${idx}-role-${r.value}`} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </label>
            </div>
          ))}
        </div>

        <button type="submit" disabled={busy}>{busy ? "Analyzing..." : "Find Best Builds"}</button>
        {error ? <p className="error">{error}</p> : null}
      </form>

      <section className="feature-strip">
        <article>
          <h3>Auto-pulls data</h3>
          <p>Uses Riot match history and Data Dragon metadata for build context.</p>
        </article>
        <article>
          <h3>Exact comp first</h3>
          <p>Attempts exact 5-champion role-aware composition matches before fallback.</p>
        </article>
        <article>
          <h3>Transparent confidence</h3>
          <p>Shows confidence score and sample size for every recommendation.</p>
        </article>
      </section>

      {result ? (
        <section className="results">
          <div className="result-top">
            <p>Patch {result.patch} | Role {displayRole(result.role)}</p>
            {matchTag ? <span className={`tag ${matchTag.tone}`}>{matchTag.label}</span> : null}
          </div>
          <p className="subtle">Enemy roles: {result.enemyRoles.map(displayRole).join(", ")}</p>

          {result.recommendations.map((rec, recIdx) => (
            <article key={`${rec.title}-${recIdx}-${rec.sampleSize}`} className="result-card">
              <h3>{rec.title}</h3>
              <p className="subtle">Confidence {(rec.confidence * 100).toFixed(0)}% | Sample {rec.sampleSize.toLocaleString()}</p>
              <p>{rec.reasoning}</p>

              {rec.why && rec.why.length > 0 ? (
                <div className="why-block">
                  <strong>Why this build</strong>
                  <ul>
                    {rec.why.map((reason, whyIdx) => (
                      <li key={`${rec.title}-why-${whyIdx}`}>{reason}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <strong>Items</strong>
              <ul className="icon-list">
                {rec.items.map((item, itemIdx) => (
                  <li key={`${rec.title}-item-${item}-${itemIdx}`}>
                    {assets.itemIcons[item] ? <img src={assets.itemIcons[item]} alt={item} width={26} height={26} /> : null}
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <strong>Runes</strong>
              <ul className="icon-list">
                {rec.runes.map((rune, runeIdx) => (
                  <li key={`${rec.title}-rune-${rune}-${runeIdx}`}>
                    {assets.runeIcons[rune] ? <img src={assets.runeIcons[rune]} alt={rune} width={26} height={26} /> : null}
                    <span>{rune}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}

          <div className="notes">
            {result.notes.map((note, idx) => <p key={`${idx}-${note}`}>{note}</p>)}
            {assets.version ? <p>Data Dragon version: {assets.version}</p> : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
