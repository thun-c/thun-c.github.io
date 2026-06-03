import { chooseCpuAction } from "./ai.js";
import { applyAction, createNewGame, getCurrentPlayer, normalizeGameData, restoreGame } from "./game.js";
import { initUI, render, resetTransientState } from "./ui.js";

const SAVE_KEY = "regaliaLocalGame.current";

let game = null;
let gameData = null;
let cpuTimer = null;
let busy = false;

window.addEventListener("DOMContentLoaded", boot);

async function boot() {
  initUI({
    onStartGame: startGame,
    onContinueGame: continueGame,
    onApplyAction: handleApplyAction,
    onNewGame: newGame,
  });

  render(null, null, { hasSave: hasSave(), busy: false });

  try {
    gameData = await loadData();
    render(game, gameData, { hasSave: hasSave(), busy });
  } catch (error) {
    showFatalError(error);
  }
}

async function loadData() {
  const [cardsResponse, noblesResponse, cardArtResponse] = await Promise.all([
    fetch(new URL("../data/cards.json", import.meta.url)),
    fetch(new URL("../data/nobles.json", import.meta.url)),
    fetch(new URL("../data/card-art.json", import.meta.url)),
  ]);

  if (!cardsResponse.ok || !noblesResponse.ok || !cardArtResponse.ok) {
    throw new Error("データファイルを読み込めませんでした。");
  }

  const [cardData, nobleData, cardArtData] = await Promise.all([
    cardsResponse.json(),
    noblesResponse.json(),
    cardArtResponse.json(),
  ]);
  await preloadCardArtAssets(cardArtData);
  return {
    ...normalizeGameData(cardData, nobleData),
    cardArt: cardArtData,
  };
}

async function preloadCardArtAssets(cardArtData) {
  const sources = collectCardArtSources(cardArtData);
  if (sources.length === 0) {
    return;
  }

  const results = await Promise.allSettled(
    sources.map((src) => preloadImage(new URL(`../${src}`, import.meta.url).href))
  );
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.warn(`カード画像を先読みできませんでした: ${sources[index]}`, result.reason);
    }
  });
}

function collectCardArtSources(cardArtData) {
  const sources = new Set();
  const addVariant = (variant) => {
    const src = sanitizeCardArtSrc(variant?.src);
    if (src) {
      sources.add(src);
    }
  };

  Object.values(cardArtData?.variantsByColorAndLevel || {}).forEach((byLevel) => {
    Object.values(byLevel || {}).forEach((variants) => {
      (variants || []).forEach(addVariant);
    });
  });
  Object.values(cardArtData?.variantsByColor || {}).forEach((variants) => {
    (variants || []).forEach(addVariant);
  });
  return [...sources];
}

function preloadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(url);
    image.onerror = () => reject(new Error(url));
    image.src = url;
  });
}

function sanitizeCardArtSrc(value) {
  const src = String(value || "");
  return /^assets\/card-art\/[-a-z0-9_/]+\.(png|jpe?g|webp)$/i.test(src) ? src : null;
}

function startGame(playerConfigs) {
  if (!gameData) {
    return;
  }
  clearCpuTimer();
  resetTransientState();
  game = createNewGame(playerConfigs, gameData);
  saveGame();
  renderNow();
  continueCpuTurnIfNeeded();
}

function continueGame() {
  if (!gameData) {
    return;
  }
  const saved = localStorage.getItem(SAVE_KEY);
  if (!saved) {
    return;
  }

  try {
    game = restoreGame(JSON.parse(saved));
    resetTransientState();
    renderNow();
    continueCpuTurnIfNeeded();
  } catch (error) {
    localStorage.removeItem(SAVE_KEY);
    game = null;
    renderNow();
  }
}

function handleApplyAction(action) {
  if (!game) {
    return;
  }
  game = applyAction(game, action);
  saveGame();
  renderNow();
  continueCpuTurnIfNeeded();
}

function newGame() {
  clearCpuTimer();
  busy = false;
  game = null;
  localStorage.removeItem(SAVE_KEY);
  renderNow();
}

function continueCpuTurnIfNeeded() {
  clearCpuTimer();
  if (!game || game.phase === "gameOver") {
    busy = false;
    renderNow();
    return;
  }

  const currentPlayer = getCurrentPlayer(game);
  if (currentPlayer.type !== "cpu") {
    busy = false;
    renderNow();
    return;
  }

  busy = true;
  renderNow();
  cpuTimer = window.setTimeout(() => {
    try {
      const action = chooseCpuAction(game, currentPlayer.id, currentPlayer.difficulty);
      if (!action) {
        busy = false;
        renderNow();
        return;
      }
      game = applyAction(game, action);
      saveGame();
    } catch (error) {
      console.error(error);
      busy = false;
      renderNow();
      return;
    }
    busy = false;
    renderNow();
    continueCpuTurnIfNeeded();
  }, 450);
}

function clearCpuTimer() {
  if (cpuTimer !== null) {
    window.clearTimeout(cpuTimer);
    cpuTimer = null;
  }
}

function renderNow() {
  render(game, gameData, { hasSave: hasSave(), busy });
}

function saveGame() {
  if (game) {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game));
  }
}

function hasSave() {
  return Boolean(localStorage.getItem(SAVE_KEY));
}

function showFatalError(error) {
  const app = document.getElementById("app");
  app.innerHTML = `
    <section class="setup-shell">
      <div class="setup-panel error-panel">
        <p class="eyebrow">Load Error</p>
        <h1>読み込みに失敗しました</h1>
        <p>${escapeHtml(error.message || String(error))}</p>
      </div>
    </section>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
