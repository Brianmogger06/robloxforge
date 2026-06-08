import {
  generateCurrencySystem, generateUpgradeSystem, generateQuestSystem,
  generateRoundSystem, generateObjectiveSystem, generateProgressionSystem,
} from "../src/build/gameplay/index.js";

let pass = 0, fail = 0;
function assert(label: string, cond: boolean) {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else       { console.error(`  ✗ ${label}`); fail++; }
}

console.log("=== Phase 8: Gameplay Systems ===");

// All modules export the standard API shape { init, set, get }
function hasApi(src: string) {
  return src.includes("M.init") && src.includes("M.set") && src.includes("M.get");
}

// Currency
const coins = generateCurrencySystem({ currencyName: "Gems", startAmount: 50 });
assert("currency has name",           coins.name === "GemsSystem");
assert("currency has standard API",   hasApi(coins.source));
assert("currency embeds startAmount", coins.source.includes("50"));
assert("currency embeds currencyName",coins.source.includes("Gems"));
assert("currency uses DataStore",     coins.source.includes("DataStoreService"));
assert("currency is --!strict",       coins.source.startsWith("--!strict"));

// Upgrade
const upgrades = generateUpgradeSystem({ upgrades: [{ id: "speed", name: "Speed", cost: 200, maxLevel: 3 }] });
assert("upgrade has name",            upgrades.name === "UpgradeSystem");
assert("upgrade has standard API",    hasApi(upgrades.source));
assert("upgrade embeds tier data",    upgrades.source.includes("speed"));

// Quest
const quests = generateQuestSystem({ quests: [{ id: "q1", name: "Test Quest", description: "Do stuff", goal: 5 }] });
assert("quest has name",              quests.name === "QuestSystem");
assert("quest has standard API",      hasApi(quests.source));
assert("quest embeds quest id",       quests.source.includes("q1"));

// Round
const round = generateRoundSystem({ intermissionDuration: 10, roundDuration: 120, minPlayers: 1 });
assert("round has name",              round.name === "RoundSystem");
assert("round has standard API",      hasApi(round.source));
assert("round embeds durations",      round.source.includes("10") && round.source.includes("120"));
assert("round has InRound broadcast", round.source.includes("InRound"));

// Objective
const objectives = generateObjectiveSystem({ objectives: [{ id: "obj1", description: "Do thing" }] });
assert("objective has name",          objectives.name === "ObjectiveSystem");
assert("objective has standard API",  hasApi(objectives.source));

// Progression
const prog = generateProgressionSystem({ xpPerLevel: 200, maxLevel: 30 });
assert("progression has name",        prog.name === "ProgressionSystem");
assert("progression has standard API",hasApi(prog.source));
assert("progression embeds xpPerLevel", prog.source.includes("200"));
assert("progression uses DataStore",  prog.source.includes("DataStoreService"));

console.log(`\nResult: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
