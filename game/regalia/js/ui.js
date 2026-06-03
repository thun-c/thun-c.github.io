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
import { RULE_PANEL } from "../rules/quick-reference.js";

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
    { type: "human", name: "Player 1", difficulty: "lv01" },
    { type: "cpu", name: "CPU 1", difficulty: "lv01" },
    { type: "cpu", name: "CPU 2", difficulty: "lv01" },
    { type: "cpu", name: "CPU 3", difficulty: "lv01" },
  ],
};

export function initUI(nextHandlers) {
  root = document.getElementById("app");
  handlers = nextHandlers;
  root.addEventListener("click", handleClick);
  root.addEventListener("error", handleAssetError, true);
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

function handleAssetError(event) {
  const image = event.target;
  if (!(image instanceof HTMLImageElement)) {
    return;
  }

  if (image.classList.contains("noble-art")) {
    const tile = image.closest(".noble-tile");
    if (tile) {
      tile.classList.remove("has-art");
      tile.removeAttribute("style");
    }
    image.remove();
    return;
  }

  if (image.classList.contains("rule-image")) {
    const frame = image.closest(".rule-image-frame, .rule-figure");
    if (frame) {
      frame.remove();
      return;
    }
    image.remove();
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
        <p class="eyebrow">Regalia of the Five Lights</p>
        <h1>五燈のレガリア</h1>
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
  const difficulty = normalizeSetupDifficulty(player.difficulty);
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
          <option value="lv01" ${difficulty === "lv01" ? "selected" : ""}>Lv01</option>
          <option value="lv02" ${difficulty === "lv02" ? "selected" : ""}>Lv02</option>
          <option value="lv03" ${difficulty === "lv03" ? "selected" : ""}>Lv03</option>
          <option value="lv04" ${difficulty === "lv04" ? "selected" : ""}>Lv04</option>
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
          <h1>五燈のレガリア</h1>
        </div>
        <div class="topbar-status">
          <button class="ghost-button topbar-button" type="button" data-action="new-game">新規ゲーム</button>
        </div>
      </header>
      ${renderGameOver(game, winners)}
      ${renderNobleChoiceBanner(game)}
      <main class="board-grid">
        <div class="left-column">
          <section class="panel nobles-panel">
            <div class="panel-title">
              <h2>紋章</h2>
              <span>${game.nobles.length}枚</span>
            </div>
            <div class="noble-grid">
              ${game.nobles.map((noble) => renderNoble(game, noble)).join("")}
            </div>
          </section>
          <section class="panel bank-panel">
            <div class="panel-title">
              <h2>マナ</h2>
              <span>場</span>
            </div>
            ${renderBank(game)}
          </section>
        </div>
        <div class="market-column">
          <section class="panel market-panel">
            <div class="panel-title">
              <h2>ギルド</h2>
              <span>${data.cards.length} 枚</span>
            </div>
            ${[3, 2, 1].map((level) => renderMarketRow(game, level)).join("")}
          </section>
          ${renderInstructionPanel(game)}
        </div>
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
        <section class="panel rules-panel">
          <div class="panel-title">
            <h2>${escapeHtml(RULE_PANEL.title)}</h2>
            <span>${escapeHtml(RULE_PANEL.badge)}</span>
          </div>
          ${renderRulesPanel(RULE_PANEL)}
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

function renderInstructionPanel(game) {
  return `
    <section class="panel instruction-panel">
      <div class="panel-title">
        <h2>指示</h2>
        <span>現在</span>
      </div>
      <p class="instruction-text">${escapeHtml(getPlayerInstruction(game))}</p>
    </section>
  `;
}

function getPlayerInstruction(game) {
  const player = getCurrentPlayer(game);
  const playerName = `${player.name}さん`;

  if (game.phase === "gameOver") {
    return "ゲームは終了しました。新規ゲームを開始できます。";
  }

  if (currentOptions.busy || player.type === "cpu") {
    return getCpuInstruction(game, playerName);
  }

  if (game.phase === "discard") {
    const excess = Math.max(0, totalTokens(player.tokens) - 10);
    return `${playerName}、マナを${excess}枚返却して、合計10枚以下にしてください。`;
  }

  if (game.phase === "noble") {
    const choiceText = game.pendingNobles.length > 1 ? `${game.pendingNobles.length}枚の中から` : "";
    return `${playerName}、条件を満たした紋章を${choiceText}1枚選択してください。`;
  }

  const selectedCount = totalTokens(selectedTokens);
  if (selectedCount > 0) {
    return canTakeTokens(game, selectedTokens)
      ? `${playerName}、選択中のマナを取るか、選択を取消してください。`
      : `${playerName}、異なる3種類、または同じ種類2枚になるようにマナを選んでください。`;
  }

  const actionTypes = new Set(getLegalActions(game, player.id).map((action) => action.type));
  if (actionTypes.has("passTurn")) {
    return `${playerName}、実行できる行動がありません。パスしてください。`;
  }

  const options = [];
  if (actionTypes.has("takeTokens")) {
    options.push("マナを取得");
  }
  if (actionTypes.has("buyCard")) {
    options.push("兵をスカウト");
  }
  if (actionTypes.has("reserveCard")) {
    options.push("兵を予約");
  }

  return `${playerName}、${joinInstructionOptions(options)}。`;
}

function getCpuInstruction(game, playerName) {
  if (game.phase === "discard") {
    return `${playerName}、CPUが返却するマナを選んでいます。`;
  }
  if (game.phase === "noble") {
    return `${playerName}、CPUが獲得する紋章を選んでいます。`;
  }
  return `${playerName}、CPUが行動を選んでいます。`;
}

function joinInstructionOptions(options) {
  if (options.length === 0) {
    return "状況を確認してください";
  }
  if (options.length === 1) {
    return `${options[0]}してください`;
  }
  const earlier = options.slice(0, -1).map((option) => `${option}する`).join("か、");
  return `${earlier}か、${options[options.length - 1]}してください`;
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
        <h2>${escapeHtml(player.name)} は獲得する紋章を1枚選んでください</h2>
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
  const art = getNobleArtData(noble);
  const displayName = getNobleDisplayName(noble);
  const artAttrs = art
    ? `style="--noble-art-position: ${escapeAttr(art.position)};" aria-label="${escapeAttr(displayName || `${noble.points}点の紋章`)}"`
    : "";
  return `
    <${tag} class="noble-tile ${art ? "has-art" : ""} ${isPending ? "is-pending" : ""} ${canClaim ? "is-claimable" : ""}" ${attrs} ${artAttrs}>
      ${art ? `<img class="noble-art" src="${escapeAttr(art.url)}" alt="" loading="lazy" decoding="async">` : ""}
      <strong class="noble-points">${noble.points}</strong>
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
    <button class="dev-card card-${card.bonus} level-${card.level} ${buyable ? "is-buyable" : ""}" type="button" data-action="open-card" ${sourceAttrs} ${cardArtAttrs(card)} ${canUseAction(game) ? "" : "disabled"}>
      ${renderCardFace(card)}
    </button>
  `;
}

function renderCardFace(card) {
  const pointLabel = card.points > 0 ? ` ${card.points}点` : "";
  return `
    <span class="card-top">
      <span class="bonus-dot card-bonus gem-${card.bonus}" aria-label="${COLOR_LABELS[card.bonus]}${pointLabel}">
        ${card.points > 0 ? `<span class="card-points">${card.points}</span>` : ""}
      </span>
    </span>
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
    <div class="bank-grid bank-pool-grid">
      ${ALL_TOKEN_COLORS.map((color) => {
        const tokenReason = getTokenButtonDisabledReason(game, color, isAction);
        return `
          <button class="token-button gem-${color}" type="button" data-action="select-token" data-color="${color}" aria-label="${COLOR_LABELS[color]} ${game.bank[color]}枚" ${disabledAttrs(tokenReason)}>
            <strong>${game.bank[color]}</strong>
          </button>
        `;
      }).join("")}
    </div>
    <div class="selection-box">
      <span>選択中: 異なる3種類、または同じ種類2枚</span>
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
          <button class="token-button gem-${color}" type="button" data-action="select-discard" data-color="${color}" aria-label="${COLOR_LABELS[color]} ${player.tokens[color]}枚" ${player.tokens[color] > selectedDiscard[color] ? "" : "disabled"}>
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
        <button class="selected-token gem-${color}" type="button" data-action="${removeAction}" data-color="${color}" aria-label="${COLOR_LABELS[color]} ${normalized[color]}枚を外す">
          ${normalized[color]}
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
    <article class="player-detail-card has-reserved ${isCurrent ? "is-current" : ""}">
      <div class="player-core">
        <div class="player-card-header">
          <h3>${escapeHtml(player.name)}</h3>
          <div class="player-card-badges">
            ${isCurrent ? "<span>手番</span>" : ""}
            <span>${player.type === "cpu" ? "CPU" : "人間"}</span>
          </div>
        </div>
        <div class="score-strip">
          <div><span>点</span><strong>${player.score}</strong></div>
          <div><span>カード</span><strong>${player.cards.length}</strong></div>
          <div><span>予約</span><strong>${player.reserved.length}/3</strong></div>
          <div><span>マナ</span><strong>${totalTokens(player.tokens)}/10</strong></div>
        </div>
        <div class="player-subsection">
          <h4>兵</h4>
          <div class="bonus-list">
            ${TOKEN_COLORS.map((color) => `<span class="bonus-badge gem-${color}" aria-label="${COLOR_LABELS[color]} ${bonuses[color]}">${bonuses[color]}</span>`).join("")}
          </div>
        </div>
        <div class="player-subsection">
          <h4>マナ</h4>
          <div class="token-line">${renderTokenLine(player.tokens)}</div>
        </div>
        <div class="player-subsection">
          <h4>紋章</h4>
          <div class="noble-line">${renderClaimedNobles(player)}</div>
        </div>
      </div>
      <div class="player-reserved-shelf">
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
    <div class="dev-card card-${card.bonus} level-${card.level} is-static" ${cardArtAttrs(card)}>
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

function renderRulesPanel(rulePanel) {
  const lead = rulePanel.lead ? `<p class="rules-lead">${escapeHtml(rulePanel.lead)}</p>` : "";
  const sections = (rulePanel.sections || []).map((section) => renderRuleSection(section)).join("");
  return `<div class="rules-content">${lead}${sections}</div>`;
}

function renderRuleSection(section) {
  const body = section.body ? `<p>${escapeHtml(section.body)}</p>` : "";
  const items = Array.isArray(section.items)
    ? `<ul>${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "";

  return `
    <article class="rule-block">
      <h3>${escapeHtml(section.heading)}</h3>
      ${renderRuleMedia(section.media)}
      ${body}
      ${items}
    </article>
  `;
}

function renderRuleMedia(media) {
  if (!media) {
    return "";
  }

  if (media.type === "image-strip" && Array.isArray(media.images)) {
    return `
      <div class="rule-image-strip" aria-label="${escapeAttr(media.label || "")}">
        ${media.images.map((image) => renderRuleImage(image)).join("")}
      </div>
    `;
  }

  if (media.type === "image" && media.src) {
    const src = resolveRuleAssetSrc(media.src);
    if (!src) {
      return "";
    }
    const caption = media.caption ? `<figcaption>${escapeHtml(media.caption)}</figcaption>` : "";
    return `
      <figure class="rule-figure">
        <img class="rule-image" src="${escapeAttr(src)}" alt="${escapeAttr(media.alt || "")}">
        ${caption}
      </figure>
    `;
  }

  return "";
}

function renderRuleImage(image) {
  const src = resolveRuleAssetSrc(image.src);
  if (!src) {
    return "";
  }
  return `
    <span class="rule-image-frame">
      <img class="rule-image" src="${escapeAttr(src)}" alt="${escapeAttr(image.alt || "")}">
    </span>
  `;
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
              <div class="modal-card dev-card card-${card.bonus} level-${card.level} ${canBuy ? "is-buyable" : ""}" ${cardArtAttrs(card)}>
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
              ? `<button class="primary-button" type="button" data-action="buy-card" ${canBuy ? "" : "disabled"}>スカウト</button>`
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
    .map((color) => `<span class="cost-token gem-${color}" aria-label="${COLOR_LABELS[color]} ${normalized[color]}">${normalized[color]}</span>`)
    .join("");
}

function renderTokenLine(tokens) {
  const normalized = normalizeTokens(tokens);
  return ALL_TOKEN_COLORS.map((color) => `<span class="token-chip gem-${color}" aria-label="${COLOR_LABELS[color]} ${normalized[color]}">${normalized[color]}</span>`).join("");
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
  return "スカウト可能";
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
    showNotice(getTokenButtonDisabledReason(currentGame, color, canUseAction(currentGame)) || "今はそのマナを選べません。");
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

function getNobleArtData(noble) {
  const metadata = getNobleMetadata(noble);
  const art = metadata?.art || noble.art;
  const src = sanitizeNobleArtSrc(typeof art === "string" ? art : art?.src);
  if (!src) {
    return null;
  }

  return {
    url: new URL(`../${src}`, import.meta.url).href,
    position: sanitizeCssPosition(art?.position) || "50% 50%",
  };
}

function getNobleDisplayName(noble) {
  return noble.name || getNobleMetadata(noble)?.name || "";
}

function getNobleMetadata(noble) {
  return currentData?.nobles?.find((candidate) => candidate.id === noble.id) || null;
}

function cardArtAttrs(card) {
  const art = getCardArt(card);
  if (!art) {
    return "";
  }

  const src = sanitizeCardArtSrc(art.src);
  if (!src) {
    return "";
  }

  const url = new URL(`../${src}`, import.meta.url).href;
  const position = sanitizeCssPosition(art.position) || "50% 50%";
  return `style="--card-art-image: url('${escapeAttr(url)}'); --card-art-position: ${escapeAttr(position)};"`;
}

function getCardArt(card) {
  const variantsByLevel = currentData?.cardArt?.variantsByColorAndLevel?.[card.bonus] || {};
  const variants =
    variantsByLevel[String(card.level)] ||
    variantsByLevel[`level${card.level}`] ||
    currentData?.cardArt?.variantsByColor?.[card.bonus] ||
    [];
  if (variants.length === 0) {
    return null;
  }
  return variants[stableHash(card.id) % variants.length];
}

function stableHash(value) {
  return String(value)
    .split("")
    .reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0);
}

function sanitizeCardArtSrc(value) {
  const src = String(value || "");
  return /^assets\/card-art\/[-a-z0-9_/]+\.(png|jpe?g|webp)$/i.test(src) ? src : null;
}

function sanitizeNobleArtSrc(value) {
  const src = String(value || "");
  return /^assets\/noble-art\/[-a-z0-9_/]+\.(png|jpe?g|webp|svg)$/i.test(src) ? src : null;
}

function resolveRuleAssetSrc(value) {
  const src = String(value || "");
  if (!/^(assets|rules)\/[-a-z0-9_/]+\.(png|jpe?g|webp|svg)$/i.test(src)) {
    return null;
  }
  return new URL(`../${src}`, import.meta.url).href;
}

function sanitizeCssPosition(value) {
  const position = String(value || "").trim();
  return /^[-a-z0-9.%\s]+$/i.test(position) ? position : null;
}

function isPartialTakeSelectionValid(game, selection) {
  return getPartialTakeSelectionReason(game, selection) === null;
}

function getPartialTakeSelectionReason(game, selection) {
  const tokens = normalizeTokens(selection);
  if (tokens.gold > 0 || totalTokens(tokens) > 3) {
    return "一度に取れるマナは最大3枚です。";
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
    return `同じ種類を2枚取るには、その種類が場に4枚以上必要です。現在は${game.bank[selected[0]]}枚です。`;
  }

  if (selected.length <= 3 && selected.every((color) => tokens[color] === 1)) {
    return null;
  }

  return "取れる組み合わせは、異なる3種類または同じ種類2枚です。";
}

function getTokenButtonDisabledReason(game, color, isAction) {
  if (!game) {
    return "ゲーム開始後に選べます。";
  }
  if (!isAction) {
    return getActionBlockedReason(game);
  }
  if (color === "gold") {
    return "全は直接取れません。カード予約時に残っていれば1枚受け取ります。";
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
    return "異なる3種類、または同じ種類2枚を選んでください。";
  }

  const selectedColors = TOKEN_COLORS.filter((color) => selectedTokens[color] > 0);
  if (selectedColors.length === 1 && selectedTokens[selectedColors[0]] === 1) {
    return "同じ種類をもう1枚選ぶか、異なる3種類になるように選んでください。";
  }
  if (selectedColors.length === 2 && selectedColors.every((color) => selectedTokens[color] === 1)) {
    return "異なる種類を取る場合は3種類選んでください。";
  }

  return getPartialTakeSelectionReason(game, selectedTokens) || "この組み合わせでは取れません。";
}

function getActionBlockedReason(game) {
  if (currentOptions.busy || getCurrentPlayer(game).type === "cpu") {
    return "CPUが操作中です。";
  }
  if (game.phase === "discard") {
    return "先にマナを10枚以下に返却してください。";
  }
  if (game.phase === "noble") {
    return "先に獲得する紋章を選んでください。";
  }
  if (game.phase === "gameOver") {
    return "ゲームは終了しています。";
  }
  return "今はマナを取るタイミングではありません。";
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
    difficulty: normalizeSetupDifficulty(player.difficulty),
  }));
}

function defaultName(index, type) {
  return type === "cpu" ? `CPU ${index + 1}` : `Player ${index + 1}`;
}

function normalizeSetupDifficulty(difficulty) {
  if (difficulty === "easy") {
    return "lv01";
  }
  if (difficulty === "medium") {
    return "lv02";
  }
  if (difficulty === "hard") {
    return "lv03";
  }
  if (difficulty === "lv02" || difficulty === "lv03" || difficulty === "lv04") {
    return difficulty;
  }
  return "lv01";
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
