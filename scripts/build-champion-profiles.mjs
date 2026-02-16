import fs from "node:fs/promises";
import path from "node:path";

const rolePriority = ["Marksman", "Support", "Mage", "Assassin", "Tank", "Fighter"];
const roleClassMap = {
  Marksman: "marksman",
  Mage: "mage",
  Fighter: "fighter",
  Tank: "tank",
  Assassin: "assassin",
  Support: "support"
};

const healingChamps = new Set([
  "Aatrox", "Briar", "Darius", "DrMundo", "Fiddlesticks", "Fiora", "Garen", "Gwen", "Illaoi", "Irelia",
  "Kayn", "Maokai", "Mordekaiser", "Nasus", "Nidalee", "Nunu", "Olaf", "Renekton", "Rhaast", "Rengar",
  "Samira", "Senna", "Soraka", "Swain", "Sylas", "Trundle", "Vladimir", "Volibear", "Warwick", "XinZhao",
  "Yorick", "Yuumi"
]);

const ccOverrides = new Set([
  "Ahri", "Alistar", "Amumu", "Anivia", "Annie", "Ashe", "AurelionSol", "Bard", "Blitzcrank", "Braum",
  "Cassiopeia", "ChoGath", "Elise", "Fiddlesticks", "Galio", "Gnar", "Gragas", "Hwei", "Ivern", "Janna",
  "JarvanIV", "Jhin", "Jinx", "Kennen", "Leona", "Lissandra", "Lulu", "Lux", "Malphite", "Maokai",
  "Milio", "Morgana", "Nami", "Nautilus", "Neeko", "Nunu", "Orianna", "Poppy", "Rakan", "Rammus",
  "Renata", "Rell", "Sejuani", "Seraphine", "Sion", "Skarner", "Syndra", "TahmKench", "Taliyah", "Taric",
  "Thresh", "TwistedFate", "Veigar", "Velkoz", "Vi", "Vex", "Wukong", "Xerath", "Yasuo", "Yone", "Zac",
  "Zilean", "Zoe", "Zyra"
]);

const apOverrides = new Set([
  "Akali", "Amumu", "Anivia", "Annie", "AurelionSol", "Brand", "Cassiopeia", "Diana", "Ekko", "Elise",
  "Evelynn", "Fiddlesticks", "Fizz", "Galio", "Gragas", "Gwen", "Heimerdinger", "Karthus", "Kassadin",
  "Katarina", "Kayle", "Kennen", "LeBlanc", "Lillia", "Lissandra", "Lux", "Malphite", "Maokai", "Mordekaiser",
  "Morgana", "Neeko", "Nidalee", "Nunu", "Rammus", "Ryze", "Sejuani", "Seraphine", "Shyvana", "Syndra",
  "Teemo", "TwistedFate", "Veigar", "Velkoz", "Vex", "Vladimir", "Xerath", "Zac", "Ziggs", "Zilean", "Zoe", "Zyra"
]);

const adOverrides = new Set([
  "Aatrox", "Aphelios", "Ashe", "Belveth", "Briar", "Caitlyn", "Darius", "Draven", "Ezreal", "Fiora",
  "Gangplank", "Garen", "Graves", "Hecarim", "Irelia", "Jax", "Jayce", "Jhin", "Jinx", "Kaisa", "Kalista",
  "Kayn", "KhaZix", "Kindred", "Kled", "LeeSin", "Lucian", "MasterYi", "MissFortune", "Naafiri", "Nilah",
  "Nocturne", "Olaf", "Pantheon", "Pyke", "Qiyana", "Quinn", "Rengar", "Riven", "Samira", "Senna",
  "Sett", "Shaco", "Sivir", "Talon", "Tristana", "Tryndamere", "Twitch", "Urgot", "Varus", "Vayne",
  "Vi", "Viego", "Wukong", "XinZhao", "Yasuo", "Yone", "Zed", "Zeri"
]);

async function main() {
  const versions = await fetch("https://ddragon.leagueoflegends.com/api/versions.json").then((r) => r.json());
  const version = versions[0];
  const payload = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`).then((r) => r.json());
  const champs = payload?.data || {};

  const result = {};

  for (const champ of Object.values(champs)) {
    const name = String(champ.name || "").trim();
    const id = String(champ.id || "").trim();
    const tags = Array.isArray(champ.tags) ? champ.tags.map((t) => String(t)) : [];

    const primaryTag = rolePriority.find((tag) => tags.includes(tag)) || "Fighter";
    const roleClass = roleClassMap[primaryTag] || "fighter";

    const hasMageTag = tags.includes("Mage") || tags.includes("Support");
    const hasAdTag = tags.includes("Marksman") || tags.includes("Fighter") || tags.includes("Assassin");

    let apThreat = hasMageTag;
    let adThreat = hasAdTag;

    if (apOverrides.has(id)) apThreat = true;
    if (adOverrides.has(id)) adThreat = true;

    const heavyCc = ccOverrides.has(id) || tags.includes("Tank") || tags.includes("Support");
    const heavyHealing = healingChamps.has(id);
    const tanky = tags.includes("Tank") || tags.includes("Fighter");

    result[name] = {
      roleClass,
      apThreat,
      adThreat,
      heavyCc,
      heavyHealing,
      tanky
    };
  }

  const outPath = path.resolve(process.cwd(), "data/championProfiles.json");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify({ version, generatedAt: new Date().toISOString(), profiles: result }, null, 2)}\n`, "utf8");

  console.log(`Generated profiles for ${Object.keys(result).length} champions at ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});