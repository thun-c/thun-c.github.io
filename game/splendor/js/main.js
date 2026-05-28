import { chooseCpuAction } from "./ai.js";
import { applyAction, createNewGame, getCurrentPlayer, normalizeGameData, restoreGame } from "./game.js";
import { initUI, render, resetTransientState } from "./ui.js";

const SAVE_KEY = "splendorLocalGame.current";

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
  const [cardsResponse, noblesResponse] = await Promise.all([
    fetch(new URL("../data/cards.json", import.meta.url)),
    fetch(new URL("../data/nobles.json", import.meta.url)),
  ]);

  if (!cardsResponse.ok || !noblesResponse.ok) {
    throw new Error("データファイルを読み込めませんでした。");
  }

  const [cardData, nobleData] = await Promise.all([cardsResponse.json(), noblesResponse.json()]);
  return normalizeGameData(cardData, nobleData);
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
    const action = chooseCpuAction(game, currentPlayer.id, currentPlayer.difficulty);
    if (!action) {
      busy = false;
      renderNow();
      return;
    }
    game = applyAction(game, action);
    saveGame();
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
