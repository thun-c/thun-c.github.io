import {
  ALL_TOKEN_COLORS,
  COLOR_LABELS,
  COLOR_NAMES,
  END_SCORE,
  TOKEN_COLORS,
  calculateAutoPayment,
  canBuyCard,
  canReserveCard,
  canTakeTokens,
  emptyTokens,
  formatTokenSelection,
  getCurrentPlayer,
  getLegalActions,
  getPlayerBonuses,
  levelKey,
  normalizeTokens,
  totalTokens,
} from "./game.js";

let root = null;
let handlers = {};
let currentGame = null;
let currentData = null;
let currentOptions = {};
let modal = null;
let selectedTokens = emptyTokens();
let selectedDiscard = emptyTokens();
let noticeTimer = null;

const setupState = {
  playerCount: 2,
  players: [
    { type: "human", name: "Player 1", difficulty: "easy" },
    { type: "cpu", name: "CPU 1", difficulty: "easy" },
    { type: "cpu", name: "CPU 2", difficulty: "easy" },
    { type: "cpu", name: "CPU 3", difficulty: "easy" },
  ],
};

export function initUI(nextHandlers) {
  root = document.getElementById("app");
  handlers = nextHandlers;
  root.addEventListener("click", handleClick);
  root.addEventListener("change", handleChange);
  root.addEventListener("input", handleInput);
}

export function render(game, data, options = {}) {
  currentGame = game;
  currentData = data;
  currentOptions = options;

  if (!root) {
    return;
  }

  if (!game) {
    root.innerHTML = renderSetup(options);
    return;
  }

  root.innerHTML = renderGame(game, data, options);
}

export function resetTransientState() {
  modal = null;
  selectedTokens = emptyTokens();
  selectedDiscard = emptyTokens();
}

function handleClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) {
    return;
  }
  event.preventDefault();
  const action = target.dataset.action;

  if (target.dataset.disabledReason) {
    event.preventDefault();
    showNotice(target.dataset.disabledReason);
    return;
  }

  if (action === "set-player-count") {
    setupState.playerCount = Number(target.dataset.count);
    render(currentGame, currentData, currentOptions);
    return;
  }

  if (action === "start-game") {
    resetTransientState();
    handlers.onStartGame(getPlayerConfigs());
    return;
  }

  if (action === "continue-game") {
    resetTransientState();
    handlers.onContinueGame();
    return;
  }

  if (action === "new-game") {
    if (currentGame && currentGame.phase !== "gameOver") {
      modal = { type: "confirmNewGame" };
      render(currentGame, currentData, currentOptions);
      return;
    }
    resetTransientState();
    handlers.onNewGame();
    return;
  }

  if (!currentGame || currentOptions.busy) {
    return;
  }

  if (action === "select-token") {
    addSelectedToken(target.dataset.color);
    return;
  }

  if (action === "remove-token") {
    removeSelectedToken(target.dataset.color);
    return;
  }

  if (action === "confirm-tokens") {
    confirmTokens();
    return;
  }

  if (action === "cancel-tokens") {
    selectedTokens = emptyTokens();
    render(currentGame, currentData, currentOptions);
    return;
  }

  if (action === "pass-turn") {
    applyAndReset({
      type: "passTurn",
      playerId: getCurrentPlayer(currentGame).id,
    });
    return;
  }

  if (action === "select-discard") {
    addDiscardToken(target.dataset.color);
    return;
  }

  if (action === "remove-discard") {
    removeDiscardToken(target.dataset.color);
    return;
  }

  if (action === "confirm-discard") {
    confirmDiscard();
    return;
  }

  if (action === "open-card") {
    openCardModal(target);
    return;
  }

  if (action === "close-modal") {
    modal = null;
    render(currentGame, currentData, currentOptions);
    return;
  }

  if (action === "confirm-new-game") {
    resetTransientState();
    handlers.onNewGame();
    return;
  }

  if (action === "buy-card") {
    applyAndReset({
      type: "buyCard",
      playerId: getCurrentPlayer(currentGame).id,
      source: modal.source,
    });
    return;
  }

  if (action === "reserve-card") {
    applyAndReset({
      type: "reserveCard",
      playerId: getCurrentPlayer(currentGame).id,
      source: modal.source,
    });
    return;
  }

  if (action === "claim-noble") {
    applyAndReset({
      type: "claimNoble",
      playerId: getCurrentPlayer(currentGame).id,
      nobleId: target.dataset.nobleId,
    });
  }
}

function handleChange(event) {
  const target = event.target;
  if (!target.dataset.field) {
    return;
  }

  const index = Number(target.dataset.playerIndex);
  const player = setupState.players[index];
  if (!player) {
    return;
  }

  player[target.dataset.field] = target.value;
  if (target.dataset.field === "type") {
    player.name = defaultName(index, target.value);
  }
  render(currentGame, currentData, currentOptions);
}

function handleInput(event) {
  const target = event.target;
  if (target.dataset.field !== "name") {
    return;
  }
  const index = Number(target.dataset.playerIndex);
  setupState.players[index].name = target.value;
}

function renderSetup(options) {
  const rows = setupState.players
    .slice(0, setupState.playerCount)
    .map((player, index) => renderSetupPlayer(player, index))
    .join("");

  return `
    <section class="setup-shell">
      <div class="setup-panel">
        <p class="eyebrow">GitHub Pages / Mouse only</p>
        <h1>宝石の煌めき風</h1>
        <div class="setup-controls">
          <div class="field-group">
            <span class="field-label">人数</span>
            <div class="segmented" role="group" aria-label="人数">
              ${[2, 3, 4]
                .map(
                  (count) => `
                    <button class="segment ${setupState.playerCount === count ? "is-active" : ""}" type="button" data-action="set-player-count" data-count="${count}">
                      ${count}人
                    </button>
                  `
                )
                .join("")}
            </div>
          </div>
          <div class="player-configs">${rows}</div>
          <div class="setup-actions">
            <button class="primary-button" type="button" data-action="start-game">開始</button>
            ${
              options.hasSave
                ? '<button class="ghost-button" type="button" data-action="continue-game">続きから</button>'
                : ""
            }
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderSetupPlayer(player, index) {
  const isCpu = player.type === "cpu";
  return `
    <div class="setup-row">
      <label class="setup-name">
        <span>プレイヤー${index + 1}</span>
        <input type="text" value="${escapeAttr(player.name)}" data-field="name" data-player-index="${index}" maxlength="16">
      </label>
      <label>
        <span>種別</span>
        <select data-field="type" data-player-index="${index}">
          <option value="human" ${player.type === "human" ? "selected" : ""}>人間</option>
          <option value="cpu" ${player.type === "cpu" ? "selected" : ""}>CPU</option>
        </select>
      </label>
      <label class="${isCpu ? "" : "is-muted"}">
        <span>強さ</span>
        <select data-field="difficulty" data-player-index="${index}" ${isCpu ? "" : "disabled"}>
          <option value="easy" ${player.difficulty === "easy" ? "selected" : ""}>easy</option>
        </select>
      </label>
    </div>
  `;
}

function renderGame(game, data, options) {
  const player = getCurrentPlayer(game);
  const winners = game.winnerIds.map((id) => game.players[id]).filter(Boolean);
  const isCpuTurn = player.type === "cpu" && game.phase !== "gameOver";

  return `
    <div class="game-shell ${isCpuTurn ? "is-cpu-turn" : ""}">
      <header class="topbar">
        <div>
          <p class="eyebrow">Round ${game.round}</p>
          <h1>宝石の煌めき風</h1>
        </div>
        <div class="topbar-status">
          <span class="status-pill ${game.phase}">${phaseLabel(game.phase)}</span>
          <span class="current-player">${escapeHtml(player.name)}</span>
          <button class="ghost-button topbar-button" type="button" data-action="new-game">新規ゲーム</button>
        </div>
      </header>
      ${renderGameOver(game, winners)}
      ${renderNobleChoiceBanner(game)}
      <main class="board-grid">
        <section class="panel nobles-panel">
          <div class="panel-title">
            <h2>貴族</h2>
            <span>${game.nobles.length}枚</span>
          </div>
          <div class="noble-grid">
            ${game.nobles.map((noble) => renderNoble(game, noble)).join("")}
          </div>
        </section>
        <section class="panel market-panel">
          <div class="panel-title">
            <h2>市場</h2>
            <span>${data.cards.length} cards</span>
          </div>
          ${[3, 2, 1].map((level) => renderMarketRow(game, level)).join("")}
        </section>
        <section class="panel bank-panel">
          <div class="panel-title">
            <h2>トークン</h2>
            <span>場</span>
          </div>
          ${renderBank(game)}
        </section>
        <section class="panel player-panel">
          ${renderPlayersPanel(game)}
        </section>
        <section class="panel log-panel">
          <div class="panel-title">
            <h2>ログ</h2>
            <span>${game.log.length}</span>
          </div>
          <ol class="log-list">
            ${game.log.map((entry) => `<li><time>${escapeHtml(entry.at)}</time>${escapeHtml(entry.text)}</li>`).join("")}
          </ol>
        </section>
      </main>
      ${renderModal(game)}
      ${options.busy ? '<div class="busy-layer">CPU思考中...</div>' : ""}
    </div>
  `;
}

function renderGameOver(game, winners) {
  if (game.phase !== "gameOver") {
    return "";
  }
  return `
    <section class="game-over-banner">
      <div>
        <p class="eyebrow">Game Over</p>
        <h2>${winners.map((winner) => escapeHtml(winner.name)).join("、")} の勝利</h2>
      </div>
      <button class="primary-button" type="button" data-action="new-game">新規ゲーム</button>
    </section>
  `;
}

function renderNobleChoiceBanner(game) {
  if (game.phase !== "noble") {
    return "";
  }

  const player = getCurrentPlayer(game);
  return `
    <section class="choice-banner">
      <div>
        <p class="eyebrow">Noble Visit</p>
        <h2>${escapeHtml(player.name)} は獲得する貴族を1枚選んでください</h2>
      </div>
      <span>${game.pendingNobles.length}枚から選択</span>
    </section>
  `;
}

function renderNoble(game, noble) {
  const isPending = game.phase === "noble" && game.pendingNobles.includes(noble.id);
  const canClaim = isPending && getCurrentPlayer(game).type === "human" && !currentOptions.busy;
  const tag = canClaim ? "button" : "div";
  const attrs = canClaim
    ? `type="button" data-action="claim-noble" data-noble-id="${escapeAttr(noble.id)}"`
    : "";
  return `
    <${tag} class="noble-tile ${isPending ? "is-pending" : ""} ${canClaim ? "is-claimable" : ""}" ${attrs}>
      <strong>${noble.points}</strong>
      ${isPending ? '<span class="choice-label">選択可</span>' : ""}
      <div class="cost-row">${renderCost(noble.requirement)}</div>
    </${tag}>
  `;
}

function renderMarketRow(game, level) {
  const key = levelKey(level);
  const deckCount = game.decks[key].length;
  return `
    <div class="market-row">
      <button class="deck-button" type="button" data-action="deck-reserve-disabled" aria-disabled="true" data-disabled-reason="この版では山札からの予約は禁止です。公開されているカードだけ予約できます。">
        <span>Lv${level}</span>
        <strong>${deckCount}</strong>
      </button>
      <div class="card-row">
        ${game.market[key].map((card) => renderCardButton(game, card, { type: "market", level, cardId: card.id })).join("")}
      </div>
    </div>
  `;
}

function renderCardButton(game, card, source) {
  const player = getCurrentPlayer(game);
  const buyable = canUseAction(game) && canBuyCard(player, card);
  const sourceAttrs = sourceToAttrs(source);
  return `
    <button class="dev-card card-${card.bonus} level-${card.level} ${buyable ? "is-buyable" : ""}" type="button" data-action="open-card" ${sourceAttrs} ${canUseAction(game) ? "" : "disabled"}>
      ${renderCardFace(card)}
    </button>
  `;
}

function renderCardFace(card) {
  return `
    <span class="card-top">
      <strong>${card.points > 0 ? card.points : ""}</strong>
      <span class="bonus-dot gem-${card.bonus}">${COLOR_LABELS[card.bonus]}</span>
    </span>
    <span class="card-level">Lv${card.level}</span>
    <span class="cost-row">${renderCost(card.cost)}</span>
  `;
}

function renderBank(game) {
  const isAction = canUseAction(game);
  const canConfirm = isAction && canTakeTokens(game, selectedTokens);
  const confirmReason = canConfirm ? null : getConfirmTokensDisabledReason(game, isAction);
  const selectedCount = totalTokens(selectedTokens);
  const passAction = getPassAction(game);

  if (game.phase === "discard" && getCurrentPlayer(game).type === "human") {
    return renderDiscardPanel(game);
  }

  return `
    <div class="bank-grid">
      ${ALL_TOKEN_COLORS.map((color) => {
        const tokenReason = getTokenButtonDisabledReason(game, color, isAction);
        return `
          <button class="token-button gem-${color}" type="button" data-action="select-token" data-color="${color}" ${disabledAttrs(tokenReason)}>
            <span>${COLOR_LABELS[color]}</span>
            <strong>${game.bank[color]}</strong>
          </button>
        `;
      }).join("")}
    </div>
    <div class="selection-box">
      <span>選択中: 異なる3色、または同じ色2枚</span>
      <div class="selected-tokens">
        ${renderSelectedTokens(selectedTokens, "remove-token")}
      </div>
      <div class="action-buttons">
        <button class="primary-button" type="button" data-action="confirm-tokens" ${disabledAttrs(confirmReason)}>取る</button>
        <button class="ghost-button" type="button" data-action="cancel-tokens" ${selectedCount > 0 ? "" : "disabled"}>取消</button>
        ${
          passAction
            ? '<button class="ghost-button" type="button" data-action="pass-turn">パス</button>'
            : ""
        }
      </div>
      ${
        passAction
          ? '<p class="action-note">現在選べる合法手がないため、パスして次のプレイヤーに進めます。</p>'
          : ""
      }
    </div>
  `;
}

function renderDiscardPanel(game) {
  const player = getCurrentPlayer(game);
  const excess = totalTokens(player.tokens) - 10;
  const canConfirm = totalTokens(selectedDiscard) === excess;
  return `
    <div class="discard-box">
      <strong>${excess}枚返却</strong>
      <div class="bank-grid">
        ${ALL_TOKEN_COLORS.map((color) => `
          <button class="token-button gem-${color}" type="button" data-action="select-discard" data-color="${color}" ${player.tokens[color] > selectedDiscard[color] ? "" : "disabled"}>
            <span>${COLOR_LABELS[color]}</span>
            <strong>${player.tokens[color]}</strong>
          </button>
        `).join("")}
      </div>
      <div class="selected-tokens">${renderSelectedTokens(selectedDiscard, "remove-discard")}</div>
      <button class="primary-button full-width" type="button" data-action="confirm-discard" ${canConfirm ? "" : "disabled"}>返却</button>
    </div>
  `;
}

function renderSelectedTokens(tokens, removeAction) {
  const normalized = normalizeTokens(tokens);
  const parts = ALL_TOKEN_COLORS.filter((color) => normalized[color] > 0);
  if (parts.length === 0) {
    return '<span class="empty-selection">なし</span>';
  }
  return parts
    .map(
      (color) => `
        <button class="selected-token gem-${color}" type="button" data-action="${removeAction}" data-color="${color}">
          ${COLOR_LABELS[color]} ${normalized[color]}
        </button>
      `
    )
    .join("");
}

function renderPlayersPanel(game) {
  return `
    <div class="panel-title">
      <h2>プレイヤー</h2>
      <span>${END_SCORE}点</span>
    </div>
    <div class="player-detail-list">
      ${getPlayersInTurnOrder(game).map((player) => renderPlayerDetail(game, player)).join("")}
    </div>
  `;
}

function getPlayersInTurnOrder(game) {
  const order = game.turnOrder || game.players.map((player) => player.id);
  return order.map((id) => game.players[id]).filter(Boolean);
}

function renderPlayerDetail(game, player) {
  const bonuses = getPlayerBonuses(player);
  const isCurrent = player.id === game.currentPlayerIndex;
  return `
    <article class="player-detail-card ${isCurrent ? "is-current" : ""}">
      <div class="player-card-header">
        <h3>${escapeHtml(player.name)}</h3>
        <span>${isCurrent ? "手番" : player.type === "cpu" ? "CPU" : "人間"}</span>
      </div>
      <div class="score-strip">
        <div><span>点</span><strong>${player.score}</strong></div>
        <div><span>カード</span><strong>${player.cards.length}</strong></div>
        <div><span>予約</span><strong>${player.reserved.length}/3</strong></div>
        <div><span>トークン</span><strong>${totalTokens(player.tokens)}/10</strong></div>
      </div>
      <div class="player-subsection">
        <h4>ボーナス</h4>
        <div class="bonus-list">
          ${TOKEN_COLORS.map((color) => `<span class="bonus-badge gem-${color}">${COLOR_LABELS[color]} ${bonuses[color]}</span>`).join("")}
        </div>
      </div>
      <div class="player-subsection">
        <h4>所持</h4>
        <div class="token-line">${renderTokenLine(player.tokens)}</div>
      </div>
      <div class="player-subsection">
        <h4>貴族</h4>
        <div class="noble-line">${renderClaimedNobles(player)}</div>
      </div>
      <div class="player-subsection">
        <h4>予約</h4>
        <div class="reserved-row">
          ${renderReservedCards(game, player)}
        </div>
      </div>
    </article>
  `;
}

function renderReservedCards(game, player) {
  if (player.reserved.length === 0) {
    return '<span class="empty-selection">なし</span>';
  }

  if (player.id !== game.currentPlayerIndex || player.type !== "human") {
    return player.reserved.map((card) => renderStaticCard(card)).join("");
  }

  return player.reserved
    .map((card) => renderCardButton(game, card, { type: "reserved", cardId: card.id }))
    .join("");
}

function renderStaticCard(card) {
  return `
    <div class="dev-card card-${card.bonus} level-${card.level} is-static">
      ${renderCardFace(card)}
    </div>
  `;
}

function renderClaimedNobles(player) {
  if (player.nobles.length === 0) {
    return '<span class="empty-selection">なし</span>';
  }

  return player.nobles
    .map((noble) => `<span class="claimed-noble">${noble.points}点</span>`)
    .join("");
}

function renderModal(game) {
  if (!modal) {
    return "";
  }

  if (modal.type === "confirmNewGame") {
    return renderNewGameConfirmModal();
  }

  const player = getCurrentPlayer(game);
  const source = modal.source;
  const card = findCardBySource(game, source);
  const canReserve = canUseAction(game) && source.type !== "reserved" && canReserveCard(game, player);
  const canBuy = card && canUseAction(game) && canBuyCard(player, card);
  const payment = card ? calculateAutoPayment(player, card) : null;

  return `
    <div class="modal-backdrop">
      <div class="card-modal">
        <button class="close-button" type="button" data-action="close-modal" title="閉じる">×</button>
        ${
          card
            ? `
              <div class="modal-card dev-card card-${card.bonus} level-${card.level}">
                ${renderCardFace(card)}
              </div>
              <div class="modal-details">
                <p class="eyebrow">Lv${card.level} / ${COLOR_NAMES[card.bonus]}</p>
                <h2>${card.points}点カード</h2>
                <p>支払い: ${payment ? formatTokenSelection(payment) : renderShortage(player, card)}</p>
              </div>
            `
            : ""
        }
        <div class="modal-actions">
          ${
            card
              ? `<button class="primary-button" type="button" data-action="buy-card" ${canBuy ? "" : "disabled"}>購入</button>`
              : ""
          }
          <button class="ghost-button" type="button" data-action="reserve-card" ${canReserve ? "" : "disabled"}>予約</button>
        </div>
      </div>
    </div>
  `;
}

function renderNewGameConfirmModal() {
  return `
    <div class="modal-backdrop">
      <div class="card-modal confirm-modal">
        <button class="close-button" type="button" data-action="close-modal" title="閉じる">×</button>
        <div class="modal-details">
          <p class="eyebrow">New Game</p>
          <h2>新規ゲームに戻りますか？</h2>
          <p>現在のゲームの進行状況は保存から削除されます。</p>
        </div>
        <div class="modal-actions">
          <button class="ghost-button" type="button" data-action="close-modal">キャンセル</button>
          <button class="primary-button" type="button" data-action="confirm-new-game">新規ゲーム</button>
        </div>
      </div>
    </div>
  `;
}

function renderCost(cost) {
  const normalized = normalizeTokens(cost);
  const parts = TOKEN_COLORS.filter((color) => normalized[color] > 0);
  if (parts.length === 0) {
    return '<span class="cost-token free">0</span>';
  }
  return parts
    .map((color) => `<span class="cost-token gem-${color}">${COLOR_LABELS[color]}${normalized[color]}</span>`)
    .join("");
}

function renderTokenLine(tokens) {
  const normalized = normalizeTokens(tokens);
  return ALL_TOKEN_COLORS.map((color) => `<span class="token-chip gem-${color}">${COLOR_LABELS[color]} ${normalized[color]}</span>`).join("");
}

function renderShortage(player, card) {
  const bonuses = getPlayerBonuses(player);
  const shortage = [];
  let goldNeed = 0;

  TOKEN_COLORS.forEach((color) => {
    const need = Math.max(0, card.cost[color] - bonuses[color]);
    const missing = Math.max(0, need - player.tokens[color]);
    if (missing > 0) {
      shortage.push(`${COLOR_LABELS[color]}${missing}`);
      goldNeed += missing;
    }
  });

  if (goldNeed > player.tokens.gold) {
    return `不足: ${shortage.join("・")}`;
  }
  return "購入可能";
}

function canUseAction(game) {
  if (!game || currentOptions.busy) {
    return false;
  }
  const player = getCurrentPlayer(game);
  return player.type === "human" && game.phase === "action";
}

function getPassAction(game) {
  if (!game || !canUseAction(game)) {
    return null;
  }
  const player = getCurrentPlayer(game);
  return getLegalActions(game, player.id).find((action) => action.type === "passTurn") || null;
}

function addSelectedToken(color) {
  if (!canUseAction(currentGame) || color === "gold") {
    showNotice(getTokenButtonDisabledReason(currentGame, color, canUseAction(currentGame)) || "今はそのトークンを選べません。");
    return;
  }
  const next = { ...selectedTokens };
  next[color] = (next[color] || 0) + 1;
  const reason = getPartialTakeSelectionReason(currentGame, next);
  if (reason) {
    showNotice(reason);
    return;
  }
  selectedTokens = normalizeTokens(next);
  render(currentGame, currentData, currentOptions);
}

function removeSelectedToken(color) {
  const next = { ...selectedTokens };
  next[color] = Math.max(0, (next[color] || 0) - 1);
  selectedTokens = normalizeTokens(next);
  render(currentGame, currentData, currentOptions);
}

function confirmTokens() {
  const player = getCurrentPlayer(currentGame);
  if (!canTakeTokens(currentGame, selectedTokens)) {
    return;
  }
  applyAndReset({
    type: "takeTokens",
    playerId: player.id,
    tokens: selectedTokens,
  });
}

function addDiscardToken(color) {
  if (!currentGame || currentGame.phase !== "discard") {
    return;
  }
  const player = getCurrentPlayer(currentGame);
  const next = { ...selectedDiscard };
  const excess = totalTokens(player.tokens) - 10;
  if (next[color] >= player.tokens[color] || totalTokens(next) >= excess) {
    return;
  }
  next[color] += 1;
  selectedDiscard = normalizeTokens(next);
  render(currentGame, currentData, currentOptions);
}

function removeDiscardToken(color) {
  const next = { ...selectedDiscard };
  next[color] = Math.max(0, next[color] - 1);
  selectedDiscard = normalizeTokens(next);
  render(currentGame, currentData, currentOptions);
}

function confirmDiscard() {
  const player = getCurrentPlayer(currentGame);
  const excess = totalTokens(player.tokens) - 10;
  if (totalTokens(selectedDiscard) !== excess) {
    return;
  }
  applyAndReset({
    type: "discardTokens",
    playerId: player.id,
    tokens: selectedDiscard,
  });
}

function applyAndReset(action) {
  resetTransientState();
  handlers.onApplyAction(action);
}

function openCardModal(target) {
  if (!canUseAction(currentGame)) {
    return;
  }
  modal = {
    source: sourceFromDataset(target.dataset),
  };
  render(currentGame, currentData, currentOptions);
}

function findCardBySource(game, source) {
  const player = getCurrentPlayer(game);
  if (source.type === "market") {
    return game.market[levelKey(source.level)].find((card) => card.id === source.cardId) || null;
  }
  if (source.type === "reserved") {
    return player.reserved.find((card) => card.id === source.cardId) || null;
  }
  return null;
}

function sourceFromDataset(dataset) {
  if (dataset.sourceType === "reserved") {
    return {
      type: "reserved",
      cardId: dataset.cardId,
    };
  }
  return {
    type: "market",
    level: Number(dataset.level),
    cardId: dataset.cardId,
  };
}

function sourceToAttrs(source) {
  return Object.entries({
    "data-source-type": source.type,
    "data-level": source.level || "",
    "data-card-id": source.cardId || "",
  })
    .map(([key, value]) => `${key}="${escapeAttr(String(value))}"`)
    .join(" ");
}

function isPartialTakeSelectionValid(game, selection) {
  return getPartialTakeSelectionReason(game, selection) === null;
}

function getPartialTakeSelectionReason(game, selection) {
  const tokens = normalizeTokens(selection);
  if (tokens.gold > 0 || totalTokens(tokens) > 3) {
    return "一度に取れる宝石は最大3枚です。";
  }
  if (TOKEN_COLORS.some((color) => tokens[color] > game.bank[color])) {
    return "場に残っている枚数を超えては取れません。";
  }

  const selected = TOKEN_COLORS.filter((color) => tokens[color] > 0);
  if (selected.length === 0) {
    return null;
  }

  if (selected.length === 1 && tokens[selected[0]] <= 2) {
    if (tokens[selected[0]] === 1 || game.bank[selected[0]] >= 4) {
      return null;
    }
    return `同じ宝石2枚を取るには、その色が場に4枚以上必要です。現在は${game.bank[selected[0]]}枚です。`;
  }

  if (selected.length <= 3 && selected.every((color) => tokens[color] === 1)) {
    return null;
  }

  return "取れる組み合わせは、異なる3色または同じ色2枚です。";
}

function getTokenButtonDisabledReason(game, color, isAction) {
  if (!game) {
    return "ゲーム開始後に選べます。";
  }
  if (!isAction) {
    return getActionBlockedReason(game);
  }
  if (color === "gold") {
    return "黄金は直接取れません。カード予約時に残っていれば1枚受け取ります。";
  }
  if (game.bank[color] <= 0) {
    return `${COLOR_LABELS[color]}は場に残っていません。`;
  }
  return null;
}

function getConfirmTokensDisabledReason(game, isAction) {
  if (!game) {
    return "ゲーム開始後に選べます。";
  }
  if (!isAction) {
    return getActionBlockedReason(game);
  }

  const selectedCount = totalTokens(selectedTokens);
  if (selectedCount === 0) {
    return "異なる3色、または同じ色2枚を選んでください。";
  }

  const selectedColors = TOKEN_COLORS.filter((color) => selectedTokens[color] > 0);
  if (selectedColors.length === 1 && selectedTokens[selectedColors[0]] === 1) {
    return "同じ色をもう1枚選ぶか、異なる3色になるように選んでください。";
  }
  if (selectedColors.length === 2 && selectedColors.every((color) => selectedTokens[color] === 1)) {
    return "異なる宝石を取る場合は3色選んでください。";
  }

  return getPartialTakeSelectionReason(game, selectedTokens) || "この組み合わせでは取れません。";
}

function getActionBlockedReason(game) {
  if (currentOptions.busy || getCurrentPlayer(game).type === "cpu") {
    return "CPUの手番中です。";
  }
  if (game.phase === "discard") {
    return "先にトークンを10枚以下に返却してください。";
  }
  if (game.phase === "noble") {
    return "先に獲得する貴族を選んでください。";
  }
  if (game.phase === "gameOver") {
    return "ゲームは終了しています。";
  }
  return "今はトークンを取るタイミングではありません。";
}

function disabledAttrs(reason) {
  if (!reason) {
    return "";
  }
  return `aria-disabled="true" data-disabled-reason="${escapeAttr(reason)}"`;
}

function showNotice(message) {
  if (!message) {
    return;
  }

  let notice = document.querySelector(".notice-popup");
  if (!notice) {
    notice = document.createElement("div");
    notice.className = "notice-popup";
    document.body.appendChild(notice);
  }

  notice.textContent = message;
  notice.classList.add("is-visible");
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    notice.classList.remove("is-visible");
  }, 2600);
}

function getPlayerConfigs() {
  return setupState.players.slice(0, setupState.playerCount).map((player, index) => ({
    type: player.type,
    name: player.name || defaultName(index, player.type),
    difficulty: player.difficulty || "easy",
  }));
}

function defaultName(index, type) {
  return type === "cpu" ? `CPU ${index + 1}` : `Player ${index + 1}`;
}

function phaseLabel(phase) {
  return {
    action: "手番",
    discard: "返却",
    noble: "貴族",
    gameOver: "終了",
  }[phase] || phase;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
