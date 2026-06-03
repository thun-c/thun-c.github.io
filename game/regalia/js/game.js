export const TOKEN_COLORS = ["white", "blue", "green", "red", "black"];
export const ALL_TOKEN_COLORS = [...TOKEN_COLORS, "gold"];
export const LEVEL_KEYS = ["level1", "level2", "level3"];
export const END_SCORE = 15;

export const COLOR_LABELS = {
  white: "光",
  blue: "雷",
  green: "精",
  red: "炎",
  black: "闇",
  gold: "全",
};

export const COLOR_NAMES = {
  white: "光",
  blue: "雷",
  green: "精",
  red: "炎",
  black: "闇",
  gold: "全",
};

export function normalizeGameData(cardData, nobleData) {
  return {
    cards: expandCards(cardData).map(normalizeCard),
    nobles: expandNobles(nobleData).map(normalizeNoble),
  };
}

export function createNewGame(playerConfigs, data) {
  const configs = playerConfigs.slice(0, 4);
  const decks = buildDecks(data.cards);
  const playerCount = configs.length;
  const turnOrder = shuffle(configs.map((_, index) => index));
  const game = {
    players: configs.map((config, index) => createPlayer(index, config)),
    turnOrder,
    currentTurnOrderIndex: 0,
    currentPlayerIndex: turnOrder[0],
    startPlayerIndex: turnOrder[0],
    round: 1,
    phase: "action",
    settings: {
      playerCount,
      players: configs.map((config) => ({
        ...config,
        difficulty: config.type === "cpu" ? normalizeCpuDifficulty(config.difficulty) : null,
      })),
    },
    bank: createBank(playerCount),
    decks,
    market: {
      level1: [],
      level2: [],
      level3: [],
    },
    nobles: shuffle(data.nobles.slice()).slice(0, playerCount + 1),
    pendingNobles: [],
    finalRoundTriggeredBy: null,
    log: [],
    winnerIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  LEVEL_KEYS.forEach((levelKey) => {
    for (let i = 0; i < 4; i += 1) {
      drawToMarket(game, levelKey);
    }
  });

  refreshScores(game);
  addLog(game, `手番順: ${turnOrder.map((id) => game.players[id].name).join(" → ")}`);
  addLog(game, `${playerCount}人でゲームを開始しました。`);
  return game;
}

export function createPlayer(id, config) {
  return {
    id,
    name: config.name || defaultPlayerName(id, config.type),
    type: config.type || "human",
    difficulty: config.type === "cpu" ? normalizeCpuDifficulty(config.difficulty) : null,
    tokens: emptyTokens(),
    cards: [],
    reserved: [],
    nobles: [],
    score: 0,
  };
}

export function createBank(playerCount) {
  const gemCount = playerCount === 2 ? 4 : playerCount === 3 ? 5 : 7;
  return {
    white: gemCount,
    blue: gemCount,
    green: gemCount,
    red: gemCount,
    black: gemCount,
    gold: 5,
  };
}

export function restoreGame(game) {
  if (!game) {
    return null;
  }
  game.players = (game.players || []).map((player, index) => ({
    id: index,
    name: player.name || defaultPlayerName(index, player.type),
    type: player.type || "human",
    difficulty: player.type === "cpu" ? normalizeCpuDifficulty(player.difficulty) : null,
    tokens: normalizeTokens(player.tokens),
    cards: (player.cards || []).map(normalizeCard),
    reserved: (player.reserved || []).map(normalizeCard),
    nobles: (player.nobles || []).map(normalizeNoble),
    score: player.score || 0,
  }));
  game.bank = normalizeTokens(game.bank);
  game.decks = normalizeDecks(game.decks || {});
  game.market = normalizeDecks(game.market || {});
  game.nobles = (game.nobles || []).map(normalizeNoble);
  game.pendingNobles = game.pendingNobles || [];
  game.log = game.log || [];
  game.winnerIds = game.winnerIds || [];
  game.phase = game.phase || "action";
  game.turnOrder = normalizeTurnOrder(game);
  game.currentPlayerIndex = Number.isInteger(game.currentPlayerIndex)
    ? game.currentPlayerIndex
    : game.turnOrder[0];
  game.currentTurnOrderIndex = game.turnOrder.indexOf(game.currentPlayerIndex);
  if (game.currentTurnOrderIndex < 0) {
    game.currentTurnOrderIndex = 0;
    game.currentPlayerIndex = game.turnOrder[0];
  }
  game.startPlayerIndex = game.startPlayerIndex ?? game.turnOrder[0];
  game.round = game.round || 1;
  refreshScores(game);
  return game;
}

export function getCurrentPlayer(game) {
  return game.players[game.currentPlayerIndex];
}

export function getPlayerBonuses(player) {
  const bonuses = emptyGems();
  player.cards.forEach((card) => {
    bonuses[card.bonus] += 1;
  });
  return bonuses;
}

export function getPlayerScore(player) {
  return (
    player.cards.reduce((sum, card) => sum + card.points, 0) +
    player.nobles.reduce((sum, noble) => sum + noble.points, 0)
  );
}

export function refreshScores(game) {
  game.players.forEach((player) => {
    player.score = getPlayerScore(player);
  });
}

export function totalTokens(tokens) {
  return ALL_TOKEN_COLORS.reduce((sum, color) => sum + (tokens[color] || 0), 0);
}

export function emptyTokens() {
  return {
    white: 0,
    blue: 0,
    green: 0,
    red: 0,
    black: 0,
    gold: 0,
  };
}

export function emptyGems() {
  return {
    white: 0,
    blue: 0,
    green: 0,
    red: 0,
    black: 0,
  };
}

export function normalizeTokens(tokens = {}) {
  const normalized = emptyTokens();
  ALL_TOKEN_COLORS.forEach((color) => {
    normalized[color] = Number(tokens[color] || 0);
  });
  return normalized;
}

export function normalizeGems(gems = {}) {
  const normalized = emptyGems();
  TOKEN_COLORS.forEach((color) => {
    normalized[color] = Number(gems[color] || 0);
  });
  return normalized;
}

export function canTakeTokens(game, selection) {
  const tokens = normalizeTokens(selection);
  if (tokens.gold > 0) {
    return false;
  }

  const selectedColors = TOKEN_COLORS.filter((color) => tokens[color] > 0);
  const count = selectedColors.reduce((sum, color) => sum + tokens[color], 0);
  if (count !== 2 && count !== 3) {
    return false;
  }

  if (selectedColors.some((color) => tokens[color] > game.bank[color])) {
    return false;
  }

  if (selectedColors.length === 1 && tokens[selectedColors[0]] === 2) {
    return game.bank[selectedColors[0]] >= 4;
  }

  return count === 3 && selectedColors.length === 3 && selectedColors.every((color) => tokens[color] === 1);
}

export function canReserveCard(game, player) {
  return game.phase === "action" && player.reserved.length < 3;
}

export function canBuyCard(player, card) {
  return calculateAutoPayment(player, card) !== null;
}

export function calculateAutoPayment(player, card) {
  const bonuses = getPlayerBonuses(player);
  const payment = emptyTokens();
  let goldNeeded = 0;

  for (const color of TOKEN_COLORS) {
    const need = Math.max(0, card.cost[color] - bonuses[color]);
    const payGem = Math.min(player.tokens[color], need);
    payment[color] = payGem;
    goldNeeded += need - payGem;
  }

  if (goldNeeded > player.tokens.gold) {
    return null;
  }

  payment.gold = goldNeeded;
  return payment;
}

export function getEligibleNobles(player, nobles) {
  const bonuses = getPlayerBonuses(player);
  return nobles.filter((noble) =>
    TOKEN_COLORS.every((color) => bonuses[color] >= noble.requirement[color])
  );
}

export function isTokenLimitExceeded(player) {
  return totalTokens(player.tokens) > 10;
}

export function getLegalActions(game, playerId) {
  const player = game.players[playerId];
  if (!player || playerId !== game.currentPlayerIndex || game.phase === "gameOver") {
    return [];
  }

  if (game.phase === "discard") {
    return getDiscardActions(player);
  }

  if (game.phase === "noble") {
    return game.pendingNobles.map((nobleId) => ({
      type: "claimNoble",
      playerId,
      nobleId,
    }));
  }

  if (game.phase !== "action") {
    return [];
  }

  const actions = [];
  actions.push(...getTakeTokenActions(game, playerId));
  actions.push(...getBuyActions(game, playerId));
  actions.push(...getReserveActions(game, playerId));
  if (actions.length === 0) {
    actions.push({ type: "passTurn", playerId });
  }
  return actions;
}

export function applyAction(game, action) {
  if (!action || game.phase === "gameOver") {
    return game;
  }

  const player = getCurrentPlayer(game);
  if (action.playerId !== player.id) {
    return game;
  }

  if (action.type === "takeTokens") {
    return takeTokens(game, action.tokens);
  }
  if (action.type === "reserveCard") {
    return reserveCard(game, action.source);
  }
  if (action.type === "buyCard") {
    return buyCard(game, action.source);
  }
  if (action.type === "discardTokens") {
    return discardTokens(game, action.tokens);
  }
  if (action.type === "claimNoble") {
    return claimNoble(game, action.nobleId);
  }
  if (action.type === "passTurn") {
    return passTurn(game);
  }

  return game;
}

export function takeTokens(game, selection) {
  if (game.phase !== "action" || !canTakeTokens(game, selection)) {
    return game;
  }

  const player = getCurrentPlayer(game);
  const tokens = normalizeTokens(selection);
  TOKEN_COLORS.forEach((color) => {
    game.bank[color] -= tokens[color];
    player.tokens[color] += tokens[color];
  });
  addLog(game, `${player.name} が ${formatTokenSelection(tokens)} を取りました。`);
  return finishMainAction(game);
}

export function reserveCard(game, source) {
  const player = getCurrentPlayer(game);
  if (!canReserveCard(game, player) || !source || source.type !== "market") {
    return game;
  }

  const result = removeCardFromSource(game, player, source);
  if (!result.card) {
    return game;
  }

  player.reserved.push(result.card);
  let goldTaken = 0;
  if (game.bank.gold > 0) {
    game.bank.gold -= 1;
    player.tokens.gold += 1;
    goldTaken = 1;
  }
  if (result.sourceType === "market") {
    drawToMarket(game, levelKey(result.card.level));
  }

  const goldText = goldTaken ? "全1枚も受け取りました" : "全は残っていませんでした";
  addLog(game, `${player.name} がカードを予約し、${goldText}。`);
  return finishMainAction(game);
}

export function buyCard(game, source) {
  if (game.phase !== "action") {
    return game;
  }

  const player = getCurrentPlayer(game);
  const card = findCardBySource(game, player, source);
  if (!card || !canBuyCard(player, card)) {
    return game;
  }

  const payment = calculateAutoPayment(player, card);
  if (!payment) {
    return game;
  }

  const result = removeCardFromSource(game, player, source);
  if (!result.card) {
    return game;
  }

  ALL_TOKEN_COLORS.forEach((color) => {
    player.tokens[color] -= payment[color];
    game.bank[color] += payment[color];
  });
  player.cards.push(result.card);

  if (result.sourceType === "market") {
    drawToMarket(game, levelKey(result.card.level));
  }

  addLog(
    game,
    `${player.name} が Lv${result.card.level} ${COLOR_LABELS[result.card.bonus]} のカードを購入しました。`
  );
  return finishMainAction(game);
}

export function discardTokens(game, selection) {
  if (game.phase !== "discard") {
    return game;
  }

  const player = getCurrentPlayer(game);
  const tokens = normalizeTokens(selection);
  const excess = totalTokens(player.tokens) - 10;
  if (excess <= 0 || totalTokens(tokens) !== excess) {
    return game;
  }
  if (ALL_TOKEN_COLORS.some((color) => tokens[color] > player.tokens[color])) {
    return game;
  }

  ALL_TOKEN_COLORS.forEach((color) => {
    player.tokens[color] -= tokens[color];
    game.bank[color] += tokens[color];
  });
  addLog(game, `${player.name} が ${formatTokenSelection(tokens)} を返却しました。`);
  return resolveNoblesOrEndTurn(game);
}

export function claimNoble(game, nobleId) {
  if (game.phase !== "noble" || !game.pendingNobles.includes(nobleId)) {
    return game;
  }
  claimNobleInternal(game, nobleId);
  game.pendingNobles = [];
  return completeTurn(game);
}

export function passTurn(game) {
  if (game.phase !== "action") {
    return game;
  }
  const player = getCurrentPlayer(game);
  addLog(game, `${player.name} は合法手がないため手番をパスしました。`);
  return completeTurn(game);
}

export function createPlayerView(game, playerId) {
  const player = game.players[playerId];
  return {
    phase: game.phase,
    currentPlayerIndex: game.currentPlayerIndex,
    playerId,
    player: clonePlayerForView(player, true),
    players: game.players.map((other) => clonePlayerForView(other, other.id === playerId)),
    bank: { ...game.bank },
    market: cloneMarket(game.market),
    nobles: game.nobles.map((noble) => ({ ...noble, requirement: { ...noble.requirement } })),
    pendingNobles: game.pendingNobles.slice(),
    deckCounts: Object.fromEntries(LEVEL_KEYS.map((key) => [key, game.decks[key].length])),
    finalRoundTriggeredBy: game.finalRoundTriggeredBy,
  };
}

export function getWinners(game) {
  refreshScores(game);
  const bestScore = Math.max(...game.players.map((player) => player.score));
  const scoreCandidates = game.players.filter((player) => player.score === bestScore);
  const fewestCards = Math.min(...scoreCandidates.map((player) => player.cards.length));
  return scoreCandidates
    .filter((player) => player.cards.length === fewestCards)
    .map((player) => player.id);
}

export function formatTokenSelection(tokens) {
  const normalized = normalizeTokens(tokens);
  const parts = ALL_TOKEN_COLORS
    .filter((color) => normalized[color] > 0)
    .map((color) => `${COLOR_LABELS[color]}${normalized[color]}`);
  return parts.length ? parts.join("・") : "なし";
}

export function levelKey(level) {
  return `level${level}`;
}

function expandCards(cardData) {
  if (Array.isArray(cardData)) {
    return cardData;
  }
  if (Array.isArray(cardData.cards)) {
    return cardData.cards;
  }

  const levels = cardData.levels || {};
  const colors = cardData.colors || TOKEN_COLORS;
  const cards = [];

  Object.entries(levels).forEach(([levelText, levelDefinition]) => {
    const level = Number(levelText);
    const patterns = levelDefinition.patterns || [];
    colors.forEach((bonus) => {
      patterns.forEach((pattern, patternIndex) => {
        cards.push({
          id: `L${level}-${bonus}-${String(patternIndex + 1).padStart(2, "0")}`,
          level,
          points: pattern.points,
          bonus,
          cost: resolvePatternCost(pattern.cost, bonus, colors),
        });
      });
    });
  });

  return cards;
}

function expandNobles(nobleData) {
  if (Array.isArray(nobleData)) {
    return nobleData;
  }
  return nobleData.nobles || [];
}

function resolvePatternCost(patternCost, bonus, colors) {
  const cost = emptyGems();
  const bonusIndex = colors.indexOf(bonus);

  Object.entries(patternCost || {}).forEach(([key, value]) => {
    if (TOKEN_COLORS.includes(key)) {
      cost[key] += Number(value);
      return;
    }

    const nextMatch = key.match(/^next(\d+)$/);
    if (nextMatch) {
      const offset = Number(nextMatch[1]);
      const color = colors[(bonusIndex + offset) % colors.length];
      cost[color] += Number(value);
    }
  });

  return cost;
}

function normalizeCard(card) {
  return {
    id: card.id,
    level: Number(card.level),
    points: Number(card.points || 0),
    bonus: card.bonus,
    cost: normalizeGems(card.cost),
  };
}

function normalizeNoble(noble) {
  const normalized = {
    id: noble.id,
    points: Number(noble.points || 3),
    requirement: normalizeGems(noble.requirement),
  };

  if (noble.name) {
    normalized.name = String(noble.name);
  }

  const art = normalizeNobleArt(noble.art);
  if (art) {
    normalized.art = art;
  }

  return normalized;
}

function normalizeNobleArt(art) {
  if (!art) {
    return null;
  }

  if (typeof art === "string") {
    return { src: art };
  }

  const normalized = {};
  if (art.src) {
    normalized.src = String(art.src);
  }
  if (art.position) {
    normalized.position = String(art.position);
  }
  return normalized.src ? normalized : null;
}

function normalizeDecks(decks) {
  return {
    level1: (decks.level1 || []).map(normalizeCard),
    level2: (decks.level2 || []).map(normalizeCard),
    level3: (decks.level3 || []).map(normalizeCard),
  };
}

function buildDecks(cards) {
  return {
    level1: shuffle(cards.filter((card) => card.level === 1)),
    level2: shuffle(cards.filter((card) => card.level === 2)),
    level3: shuffle(cards.filter((card) => card.level === 3)),
  };
}

function shuffle(array) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function drawToMarket(game, key) {
  if (game.decks[key].length > 0) {
    game.market[key].push(game.decks[key].pop());
  }
}

function getTakeTokenActions(game, playerId) {
  const actions = [];
  const available = TOKEN_COLORS.filter((color) => game.bank[color] > 0);

  if (available.length >= 3) {
    for (const combination of combinations(available, 3)) {
      const tokens = emptyTokens();
      combination.forEach((color) => {
        tokens[color] = 1;
      });
      if (canTakeTokens(game, tokens)) {
        actions.push({ type: "takeTokens", playerId, tokens });
      }
    }
  }

  TOKEN_COLORS.forEach((color) => {
    const tokens = emptyTokens();
    tokens[color] = 2;
    if (canTakeTokens(game, tokens)) {
      actions.push({ type: "takeTokens", playerId, tokens });
    }
  });

  return actions;
}

function getBuyActions(game, playerId) {
  const player = game.players[playerId];
  const actions = [];

  LEVEL_KEYS.forEach((key) => {
    game.market[key].forEach((card) => {
      if (canBuyCard(player, card)) {
        actions.push({
          type: "buyCard",
          playerId,
          source: { type: "market", level: card.level, cardId: card.id },
          card,
          payment: calculateAutoPayment(player, card),
        });
      }
    });
  });

  player.reserved.forEach((card) => {
    if (canBuyCard(player, card)) {
      actions.push({
        type: "buyCard",
        playerId,
        source: { type: "reserved", cardId: card.id },
        card,
        payment: calculateAutoPayment(player, card),
      });
    }
  });

  return actions;
}

function getReserveActions(game, playerId) {
  const player = game.players[playerId];
  if (!canReserveCard(game, player)) {
    return [];
  }

  const actions = [];
  LEVEL_KEYS.forEach((key) => {
    game.market[key].forEach((card) => {
      actions.push({
        type: "reserveCard",
        playerId,
        source: { type: "market", level: card.level, cardId: card.id },
        card,
      });
    });
  });

  return actions;
}

function getDiscardActions(player) {
  const excess = totalTokens(player.tokens) - 10;
  if (excess <= 0) {
    return [];
  }

  return generateTokenSelections(player.tokens, excess).map((tokens) => ({
    type: "discardTokens",
    playerId: player.id,
    tokens,
  }));
}

function combinations(items, size) {
  const result = [];
  const current = [];
  const dfs = (start) => {
    if (current.length === size) {
      result.push(current.slice());
      return;
    }
    for (let i = start; i < items.length; i += 1) {
      current.push(items[i]);
      dfs(i + 1);
      current.pop();
    }
  };
  dfs(0);
  return result;
}

function generateTokenSelections(holdings, exactCount) {
  const result = [];
  const current = emptyTokens();

  const dfs = (index, remaining) => {
    if (index === ALL_TOKEN_COLORS.length) {
      if (remaining === 0) {
        result.push({ ...current });
      }
      return;
    }

    const color = ALL_TOKEN_COLORS[index];
    const maxCount = Math.min(holdings[color] || 0, remaining);
    for (let count = 0; count <= maxCount; count += 1) {
      current[color] = count;
      dfs(index + 1, remaining - count);
    }
    current[color] = 0;
  };

  dfs(0, exactCount);
  return result;
}

function findCardBySource(game, player, source) {
  if (!source) {
    return null;
  }

  if (source.type === "market") {
    const key = levelKey(source.level);
    return game.market[key].find((card) => card.id === source.cardId) || null;
  }

  if (source.type === "reserved") {
    return player.reserved.find((card) => card.id === source.cardId) || null;
  }

  return null;
}

function removeCardFromSource(game, player, source) {
  if (!source) {
    return { card: null, sourceType: null };
  }

  if (source.type === "market") {
    const key = levelKey(source.level);
    const index = game.market[key].findIndex((card) => card.id === source.cardId);
    if (index < 0) {
      return { card: null, sourceType: null };
    }
    const [card] = game.market[key].splice(index, 1);
    return { card, sourceType: "market" };
  }

  if (source.type === "reserved") {
    const index = player.reserved.findIndex((card) => card.id === source.cardId);
    if (index < 0) {
      return { card: null, sourceType: null };
    }
    const [card] = player.reserved.splice(index, 1);
    return { card, sourceType: "reserved" };
  }

  return { card: null, sourceType: null };
}

function finishMainAction(game) {
  refreshScores(game);
  const player = getCurrentPlayer(game);
  game.updatedAt = Date.now();

  if (isTokenLimitExceeded(player)) {
    game.phase = "discard";
    game.pendingNobles = [];
    return game;
  }

  return resolveNoblesOrEndTurn(game);
}

function resolveNoblesOrEndTurn(game) {
  refreshScores(game);
  const player = getCurrentPlayer(game);
  const eligible = getEligibleNobles(player, game.nobles);

  if (eligible.length === 1) {
    claimNobleInternal(game, eligible[0].id);
    return completeTurn(game);
  }

  if (eligible.length > 1) {
    game.phase = "noble";
    game.pendingNobles = eligible.map((noble) => noble.id);
    game.updatedAt = Date.now();
    return game;
  }

  return completeTurn(game);
}

function claimNobleInternal(game, nobleId) {
  const player = getCurrentPlayer(game);
  const index = game.nobles.findIndex((noble) => noble.id === nobleId);
  if (index < 0) {
    return;
  }
  const [noble] = game.nobles.splice(index, 1);
  player.nobles.push(noble);
  refreshScores(game);
  addLog(game, `${player.name} が紋章タイルを獲得しました。`);
}

function completeTurn(game) {
  refreshScores(game);
  const player = getCurrentPlayer(game);

  if (game.finalRoundTriggeredBy === null && player.score >= END_SCORE) {
    game.finalRoundTriggeredBy = player.id;
    addLog(game, `${player.name} が${END_SCORE}点に到達しました。このラウンドで終了します。`);
  }

  const nextTurnOrderIndex = (game.currentTurnOrderIndex + 1) % game.turnOrder.length;
  const nextIndex = game.turnOrder[nextTurnOrderIndex];
  if (game.finalRoundTriggeredBy !== null && nextIndex === game.startPlayerIndex) {
    game.phase = "gameOver";
    game.winnerIds = getWinners(game);
    addLog(game, `ゲーム終了。勝者: ${game.winnerIds.map((id) => game.players[id].name).join("、")}`);
    game.updatedAt = Date.now();
    return game;
  }

  game.currentTurnOrderIndex = nextTurnOrderIndex;
  game.currentPlayerIndex = nextIndex;
  if (nextTurnOrderIndex === 0) {
    game.round += 1;
  }
  game.phase = "action";
  game.pendingNobles = [];
  game.updatedAt = Date.now();
  return game;
}

function normalizeTurnOrder(game) {
  const playerIds = game.players.map((player) => player.id);
  const existing = Array.isArray(game.turnOrder)
    ? game.turnOrder.filter((id) => playerIds.includes(id))
    : [];
  const missing = playerIds.filter((id) => !existing.includes(id));
  return [...existing, ...missing];
}

function addLog(game, text) {
  game.log.unshift({
    at: new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    text,
  });
  game.log = game.log.slice(0, 80);
}

function cloneMarket(market) {
  return {
    level1: market.level1.map((card) => ({ ...card, cost: { ...card.cost } })),
    level2: market.level2.map((card) => ({ ...card, cost: { ...card.cost } })),
    level3: market.level3.map((card) => ({ ...card, cost: { ...card.cost } })),
  };
}

function clonePlayerForView(player, includeReservedCards) {
  return {
    id: player.id,
    name: player.name,
    type: player.type,
    difficulty: player.difficulty,
    tokens: { ...player.tokens },
    cards: player.cards.map((card) => ({ ...card, cost: { ...card.cost } })),
    reserved: includeReservedCards
      ? player.reserved.map((card) => ({ ...card, cost: { ...card.cost } }))
      : player.reserved.map(() => null),
    nobles: player.nobles.map((noble) => ({ ...noble, requirement: { ...noble.requirement } })),
    score: getPlayerScore(player),
  };
}

function defaultPlayerName(id, type) {
  return type === "cpu" ? `CPU ${id + 1}` : `Player ${id + 1}`;
}

function normalizeCpuDifficulty(difficulty) {
  if (difficulty === "easy") {
    return "lv01";
  }
  if (difficulty === "medium") {
    return "lv02";
  }
  if (difficulty === "hard") {
    return "lv03";
  }
  if (difficulty === "lv02" || difficulty === "lv03") {
    return difficulty;
  }
  return "lv01";
}
