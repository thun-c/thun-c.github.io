import {
  TOKEN_COLORS,
  ALL_TOKEN_COLORS,
  LEVEL_KEYS,
  applyAction,
  canBuyCard,
  createPlayerView,
  getLegalActions,
  getPlayerBonuses,
  getPlayerScore,
  totalTokens,
} from "./game.js";

const LV01 = "lv01";
const LV02 = "lv02";
const LV03 = "lv03";
const LV04 = "lv04";
const FUTURE_BUY_SCORE_WEIGHT = 0.03;
const NEAREST_BUY_TURN_SCORE_WEIGHT = 0.12;
const RESERVED_CARD_TURN_SCORE_WEIGHT = 0.015;
const THEORETICAL_THREE_COLOR_TAKES = createTheoreticalThreeColorTakes();
const LV03_SEARCH_DEPTH = 3;
const LV03_BEAM_WIDTH = 8;
const LV03_ACTION_WIDTH = 6;
const LV03_ROOT_HEURISTIC_WEIGHT = 0.45;
const LV03_ROOT_RESERVE_PENALTY = 70;
const LV04_CANDIDATE_ACTIONS = 4;
const LV04_PLAYOUT_SAMPLES = 3;
const LV04_PLAYOUT_ACTION_LIMIT = 40;
const LV04_ROOT_POLICY_WEIGHT = 0.8;
const LV04_SWITCH_MARGIN = 180;

export function chooseCpuAction(game, playerId, difficulty = LV01) {
  const level = normalizeDifficulty(difficulty);
  const playerView = createPlayerView(game, playerId);
  const actions = getLegalActions(game, playerId);
  if (actions.length === 0) {
    return null;
  }
  if (level === LV04 && game.phase === "action") {
    return chooseActionByRootMonteCarlo(game, playerId, actions);
  }
  if (level === LV03 && game.phase === "action") {
    return chooseActionByBeamSearch(game, playerId, actions);
  }
  return chooseActionByHeuristic(playerView, actions, level);
}

export function chooseActionByHeuristic(playerView, actions, difficulty = LV01) {
  const level = normalizeDifficulty(difficulty);
  const scored = actions.map((action) => ({
    action,
    score: scoreAction(playerView, action, level) + Math.random() * 0.25,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0].action;
}

export function scoreAction(playerView, action, difficulty = LV01) {
  const level = normalizeDifficulty(difficulty);
  if (action.type === "claimNoble") {
    return 500;
  }

  if (action.type === "declineNoble") {
    return scoreDeclineNobleAction(playerView);
  }

  if (action.type === "discardTokens") {
    return scoreDiscardAction(playerView, action);
  }

  if (action.type === "buyCard") {
    return scoreBuyAction(playerView, action, level);
  }

  if (action.type === "reserveCard") {
    return scoreReserveAction(playerView, action, level);
  }

  if (action.type === "takeTokens") {
    return scoreTakeTokensAction(playerView, action, level);
  }

  if (action.type === "passTurn") {
    return -1000;
  }

  return 0;
}

export function normalizeDifficulty(difficulty) {
  if (difficulty === "easy") {
    return LV01;
  }
  if (difficulty === "medium") {
    return LV02;
  }
  if (difficulty === "hard") {
    return LV03;
  }
  if (difficulty === LV02 || difficulty === LV03 || difficulty === LV04) {
    return difficulty;
  }
  return LV01;
}

function scoreBuyAction(playerView, action, difficulty) {
  const card = action.card;
  const bonuses = getPlayerBonuses(playerView.player);
  const noblePressure = playerView.nobles.reduce((score, noble) => {
    const current = bonuses[card.bonus];
    const required = noble.requirement[card.bonus] || 0;
    return score + (current < required ? 4 : 0);
  }, 0);
  const difficultyBonus =
    difficulty === LV01 || difficulty === LV02 || difficulty === LV03 || difficulty === LV04
      ? 0
      : noblePressure;
  return 120 + card.points * 35 + card.level * 6 + difficultyBonus;
}

function scoreReserveAction(playerView, action, difficulty) {
  const card = action.card;
  if (!card) {
    return playerView.bank.gold > 0 ? 16 : 5;
  }
  if (difficulty !== LV02 && difficulty !== LV03 && difficulty !== LV04) {
    const goldValue = playerView.bank.gold > 0 ? 18 : 0;
    return 10 + goldValue + card.points * 12 + card.level * 2;
  }
  return scoreMediumReserveAction(playerView, action, difficulty);
}

function scoreTakeTokensAction(playerView, action, difficulty) {
  if (difficulty === LV02 || difficulty === LV03 || difficulty === LV04) {
    return scoreMediumTakeTokensAction(playerView, action, difficulty);
  }

  const player = playerView.player;
  const tokenCount = totalTokens(action.tokens);
  const wanted = getWantedColors(playerView, difficulty);

  let score = tokenCount * 10;
  TOKEN_COLORS.forEach((color) => {
    score += (action.tokens[color] || 0) * (wanted[color] || 0);
  });

  return score;
}

function scoreDiscardAction(playerView, action) {
  let penalty = 0;
  ALL_TOKEN_COLORS.forEach((color) => {
    const value = color === "gold" ? 9 : 4;
    penalty += (action.tokens[color] || 0) * value;
  });
  return 100 - penalty;
}

function scoreDeclineNobleAction(playerView) {
  const player = playerView.player;
  if (player.nobles.length > 0) {
    return -400;
  }
  const score = getPlayerScore(player);
  if (score >= 13) {
    return 900;
  }
  if (score >= 11) {
    return 520;
  }
  return -250;
}

function getWantedColors(playerView, difficulty) {
  const player = playerView.player;
  const bonuses = getPlayerBonuses(player);
  const wanted = {
    white: 1,
    blue: 1,
    green: 1,
    red: 1,
    black: 1,
  };

  const visibleCards = [
    ...playerView.market.level1,
    ...playerView.market.level2,
    ...playerView.market.level3,
    ...player.reserved,
  ].filter(Boolean);

  visibleCards.forEach((card) => {
    const pointWeight = difficulty === LV01 ? 1 : 1 + card.points;
    TOKEN_COLORS.forEach((color) => {
      const remaining = Math.max(0, card.cost[color] - bonuses[color] - player.tokens[color]);
      if (remaining > 0) {
        wanted[color] += remaining * pointWeight;
      }
    });
  });

  if (difficulty !== LV01) {
    playerView.nobles.forEach((noble) => {
      TOKEN_COLORS.forEach((color) => {
        const remaining = Math.max(0, noble.requirement[color] - bonuses[color]);
        wanted[color] += remaining * 0.75;
      });
    });
  }

  return wanted;
}

function chooseActionByBeamSearch(game, playerId, actions) {
  const searchGame = createVisibleSearchGame(game, playerId);
  const rootActions = rankSearchActions(searchGame, playerId, actions, playerId, Infinity);
  const rootView = createPlayerView(searchGame, playerId);
  let beam = rootActions.map((action) => {
    const nextGame = applySearchAction(searchGame, action, playerId);
    const rootBias = scoreRootSearchAction(rootView, action);
    return {
      game: nextGame,
      rootAction: action,
      rootBias,
      value: evaluateSearchState(nextGame, playerId) + rootBias,
    };
  });

  beam.sort((a, b) => b.value - a.value);
  beam = beam.slice(0, LV03_BEAM_WIDTH);

  for (let depth = 1; depth < LV03_SEARCH_DEPTH; depth += 1) {
    const nextBeam = [];
    beam.forEach((state) => {
      if (state.game.phase === "gameOver") {
        nextBeam.push(state);
        return;
      }

      const currentPlayerId = state.game.currentPlayerIndex;
      const legalActions = getLegalActions(state.game, currentPlayerId);
      if (legalActions.length === 0) {
        nextBeam.push(state);
        return;
      }

      const rankedActions = rankSearchActions(
        state.game,
        currentPlayerId,
        legalActions,
        playerId,
        LV03_ACTION_WIDTH
      );
      rankedActions.forEach((action) => {
        const nextGame = applySearchAction(state.game, action, playerId);
        nextBeam.push({
          game: nextGame,
          rootAction: state.rootAction,
          rootBias: state.rootBias,
          value: evaluateSearchState(nextGame, playerId) + state.rootBias,
        });
      });
    });

    nextBeam.sort((a, b) => b.value - a.value);
    beam = nextBeam.slice(0, LV03_BEAM_WIDTH);
  }

  return beam[0]?.rootAction || chooseActionByHeuristic(createPlayerView(game, playerId), actions, LV02);
}

function chooseActionByRootMonteCarlo(game, playerId, actions) {
  const fallbackAction = chooseActionByBeamSearch(game, playerId, actions);
  if (!shouldUseRootMonteCarlo(game, playerId)) {
    return fallbackAction;
  }

  const visibleGame = createVisibleSearchGame(game, playerId);
  const rootView = createPlayerView(visibleGame, playerId);
  const candidates = collectMonteCarloCandidates(
    visibleGame,
    playerId,
    actions,
    fallbackAction
  );
  if (candidates.length <= 1) {
    return fallbackAction;
  }

  const scored = candidates.map((action) => ({
    action,
    playoutTotal: 0,
    trials: 0,
    rootScore: scoreRootSearchAction(rootView, action) * LV04_ROOT_POLICY_WEIGHT,
  }));

  for (let sampleIndex = 0; sampleIndex < LV04_PLAYOUT_SAMPLES; sampleIndex += 1) {
    const sampledGame = createSampledPlayoutGame(game, playerId);
    scored.forEach((entry) => {
      const playoutGame = cloneGameForSearch(sampledGame);
      applyAction(playoutGame, cloneActionForSearch(entry.action));
      playOutGame(playoutGame);
      entry.playoutTotal += scoreMonteCarloResult(playoutGame, playerId);
      entry.trials += 1;
    });
  }

  const ranked = scored
    .map((entry) => ({
      ...entry,
      value: entry.playoutTotal / Math.max(1, entry.trials) + entry.rootScore,
    }))
    .sort((a, b) => b.value - a.value);
  const fallbackEntry =
    ranked.find((entry) => actionKey(entry.action) === actionKey(fallbackAction)) || ranked[0];
  const bestEntry = ranked[0];

  if (bestEntry.value >= fallbackEntry.value + getMonteCarloSwitchMargin(game)) {
    return bestEntry.action;
  }
  return fallbackAction;
}

function shouldUseRootMonteCarlo(game, playerId) {
  const rootScore = getPlayerScore(game.players[playerId]);
  const bestScore = Math.max(...game.players.map((player) => getPlayerScore(player)));
  const playerCount = game.players.length;
  if (game.finalRoundTriggeredBy !== null) {
    return true;
  }
  if (playerCount >= 4) {
    return rootScore >= 7 || bestScore >= 10 || game.round >= 10 + playerCount;
  }
  if (playerCount === 3) {
    return rootScore >= 11 || bestScore >= 13 || game.round >= 18;
  }
  return (
    rootScore >= 12 ||
    bestScore >= 14 ||
    game.round >= 22
  );
}

function getMonteCarloSwitchMargin(game) {
  if (game.players.length >= 4) {
    return LV04_SWITCH_MARGIN;
  }
  return 650;
}

function collectMonteCarloCandidates(game, playerId, actions, fallbackAction) {
  const candidates = [];
  const keys = new Set();
  const addAction = (action) => {
    if (!action) {
      return;
    }
    const key = actionKey(action);
    if (keys.has(key)) {
      return;
    }
    keys.add(key);
    candidates.push(action);
  };

  addAction(fallbackAction);
  rankSearchActions(game, playerId, actions, playerId, LV04_CANDIDATE_ACTIONS).forEach(addAction);
  return candidates.slice(0, LV04_CANDIDATE_ACTIONS);
}

function playOutGame(game) {
  let actions = 0;
  while (game.phase !== "gameOver" && actions < LV04_PLAYOUT_ACTION_LIMIT) {
    const playerId = game.currentPlayerIndex;
    const legalActions = getLegalActions(game, playerId);
    if (legalActions.length === 0) {
      break;
    }
    const action = chooseActionByHeuristic(createPlayerView(game, playerId), legalActions, LV02);
    if (!action) {
      break;
    }
    applyAction(game, action);
    actions += 1;
  }
}

function scoreMonteCarloResult(game, rootPlayerId) {
  const rootPlayer = game.players[rootPlayerId];
  const playerCount = game.players.length;
  const rootScore = getPlayerScore(rootPlayer);
  const opponentBestScore = Math.max(
    ...game.players
      .filter((player) => player.id !== rootPlayerId)
      .map((player) => getPlayerScore(player))
  );
  const scoreMargin = rootScore - opponentBestScore;
  const rank = getPlayerRank(game, rootPlayerId);
  const rankScore = (playerCount - rank) * 650;
  const triggerScore = game.finalRoundTriggeredBy === rootPlayerId ? 500 : 0;

  if (game.phase === "gameOver") {
    const winShare = game.winnerIds.includes(rootPlayerId) ? 1 / game.winnerIds.length : 0;
    const lossPenalty = winShare > 0 ? 0 : -1600;
    return (
      winShare * 18000 +
      lossPenalty +
      rankScore +
      scoreMargin * 260 +
      rootScore * 80 +
      rootPlayer.nobles.length * 170 +
      (rootPlayer.awakeningTokens || 0) * 70 +
      triggerScore
    );
  }

  return (
    evaluateSearchState(game, rootPlayerId) +
    rankScore +
    scoreMargin * 220 +
    rootScore * 65 +
    rootPlayer.nobles.length * 140 +
    (rootPlayer.awakeningTokens || 0) * 55 +
    triggerScore
  );
}

function getPlayerRank(game, playerId) {
  const ordered = game.players
    .map((player) => ({
      id: player.id,
      score: getPlayerScore(player),
      cards: player.cards.length,
    }))
    .sort((a, b) => b.score - a.score || a.cards - b.cards || a.id - b.id);
  return ordered.findIndex((player) => player.id === playerId) + 1;
}

function scoreRootSearchAction(playerView, action) {
  const reservePenalty = action.type === "reserveCard" ? LV03_ROOT_RESERVE_PENALTY : 0;
  return scoreAction(playerView, action, LV02) * LV03_ROOT_HEURISTIC_WEIGHT - reservePenalty;
}

function rankSearchActions(game, playerId, actions, rootPlayerId, limit) {
  const playerView = createPlayerView(game, playerId);
  const scored = actions.map((action) => ({
    action,
    score:
      scoreAction(playerView, action, LV02) +
      (playerId === rootPlayerId ? 0.05 : -0.05) * evaluateActionTempo(action),
  }));
  scored.sort((a, b) => b.score - a.score);

  const selected = [];
  const selectedKeys = new Set();
  const addAction = (action) => {
    const key = actionKey(action);
    if (selectedKeys.has(key)) {
      return;
    }
    selectedKeys.add(key);
    selected.push(action);
  };

  scored
    .filter((entry) => entry.action.type === "claimNoble" || entry.action.type === "buyCard")
    .forEach((entry) => addAction(entry.action));
  scored.slice(0, limit).forEach((entry) => addAction(entry.action));

  return selected.slice(0, Math.max(limit, LV03_ACTION_WIDTH));
}

function evaluateActionTempo(action) {
  if (action.type === "buyCard") {
    return 3;
  }
  if (action.type === "claimNoble") {
    return 2;
  }
  if (action.type === "declineNoble") {
    return 2;
  }
  if (action.type === "reserveCard") {
    return 1;
  }
  return 0;
}

function applySearchAction(game, action, rootPlayerId) {
  const nextGame = cloneGameForSearch(game);
  applyAction(nextGame, cloneActionForSearch(action));
  return sanitizeSearchGame(nextGame, rootPlayerId);
}

function evaluateSearchState(game, rootPlayerId) {
  if (game.phase === "gameOver") {
    if (game.winnerIds.includes(rootPlayerId)) {
      return 100000 / game.winnerIds.length;
    }
    return -100000;
  }

  const rootPlayer = game.players[rootPlayerId];
  const opponents = game.players.filter((player) => player.id !== rootPlayerId);
  const rootView = createPlayerView(game, rootPlayerId);
  const rootScore = getPlayerScore(rootPlayer);
  const opponentBestScore = Math.max(...opponents.map((player) => getPlayerScore(player)));

  return (
    rootScore * 115 -
    opponentBestScore * 75 +
    rootPlayer.cards.length * 24 +
    rootPlayer.nobles.length * 85 +
    (rootPlayer.awakeningTokens || 0) * 34 +
    totalTokens(rootPlayer.tokens) * 1.5 +
    scoreBonusSpread(rootPlayer) +
    scoreVisibleBuyPotential(rootView) +
    scoreNobleProgress(rootView, rootPlayer) -
    scoreOpponentPressure(game, rootPlayerId)
  );
}

function scoreBonusSpread(player) {
  const bonuses = getPlayerBonuses(player);
  const totalBonus = TOKEN_COLORS.reduce((sum, color) => sum + bonuses[color], 0);
  const colorCoverage = TOKEN_COLORS.filter((color) => bonuses[color] > 0).length;
  return totalBonus * 18 + colorCoverage * 10;
}

function scoreVisibleBuyPotential(playerView) {
  const player = playerView.player;
  return getBuyableCards(playerView).reduce((score, card) => {
    if (canBuyCard(player, card)) {
      return score + scoreBuyAction(playerView, { card }, LV02) * 0.12;
    }
    const turns = estimateTokenTurnsToBuy(player, card, playerView.bank, true);
    if (!Number.isFinite(turns)) {
      return score;
    }
    return score + (scoreBuyAction(playerView, { card }, LV02) * 0.03) / (turns + 1);
  }, 0);
}

function scoreNobleProgress(playerView, player) {
  const bonuses = getPlayerBonuses(player);
  return playerView.nobles.reduce((score, noble) => {
    const missing = TOKEN_COLORS.reduce(
      (sum, color) => sum + Math.max(0, noble.requirement[color] - bonuses[color]),
      0
    );
    if (missing === 0) {
      return score + 80;
    }
    if (missing === 1) {
      return score + 48;
    }
    if (missing === 2) {
      return score + 28;
    }
    return score + Math.max(0, 14 - missing * 2);
  }, 0);
}

function scoreOpponentPressure(game, rootPlayerId) {
  return game.players
    .filter((player) => player.id !== rootPlayerId)
    .reduce((score, player) => {
      const view = createPlayerView(game, player.id);
      return score + getPlayerScore(player) * 8 + scoreVisibleBuyPotential(view) * 0.2;
    }, 0);
}

function actionKey(action) {
  return JSON.stringify(action);
}

function createVisibleSearchGame(game, rootPlayerId) {
  return sanitizeSearchGame(cloneGameForSearch(game), rootPlayerId);
}

function createSampledPlayoutGame(game, rootPlayerId) {
  const sampledGame = cloneGameForSearch(game);
  const unknownCardsByLevel = createUnknownCardsByLevel(sampledGame, rootPlayerId);

  sampledGame.players.forEach((player) => {
    player.difficulty = normalizeDifficulty(player.difficulty);
    if (player.id === rootPlayerId) {
      return;
    }

    player.reserved = player.reserved.map((card) => {
      const key = levelKeyForCard(card);
      return drawRandomUnknownCard(unknownCardsByLevel[key]) || card;
    });
  });

  LEVEL_KEYS.forEach((key) => {
    sampledGame.decks[key] = shuffleCards(unknownCardsByLevel[key]);
  });
  sampledGame.log = [];
  return sampledGame;
}

function createUnknownCardsByLevel(game, rootPlayerId) {
  const unknownCardsByLevel = Object.fromEntries(LEVEL_KEYS.map((key) => [key, []]));

  LEVEL_KEYS.forEach((key) => {
    unknownCardsByLevel[key].push(...game.decks[key]);
  });

  game.players.forEach((player) => {
    if (player.id === rootPlayerId) {
      return;
    }
    player.reserved.forEach((card) => {
      unknownCardsByLevel[levelKeyForCard(card)].push(card);
    });
  });

  LEVEL_KEYS.forEach((key) => {
    unknownCardsByLevel[key] = shuffleCards(unknownCardsByLevel[key]);
  });
  return unknownCardsByLevel;
}

function drawRandomUnknownCard(cards) {
  if (!cards || cards.length === 0) {
    return null;
  }
  return cards.pop();
}

function cloneGameForSearch(game) {
  return JSON.parse(JSON.stringify(game));
}

function cloneActionForSearch(action) {
  return JSON.parse(JSON.stringify(action));
}

function sanitizeSearchGame(game, rootPlayerId) {
  game.decks = {
    level1: [],
    level2: [],
    level3: [],
  };
  game.log = [];
  game.players.forEach((player) => {
    player.difficulty = normalizeDifficulty(player.difficulty);
    if (player.id !== rootPlayerId) {
      player.reserved = player.reserved.map((_, index) => createHiddenReservedCard(player.id, index));
    }
  });
  return game;
}

function createHiddenReservedCard(playerId, index) {
  return {
    id: `hidden-${playerId}-${index}`,
    level: 1,
    points: 0,
    bonus: TOKEN_COLORS[0],
    cost: {
      white: 99,
      blue: 99,
      green: 99,
      red: 99,
      black: 99,
    },
  };
}

function isHiddenReservedCard(card) {
  return String(card.id || "").startsWith("hidden-");
}

function levelKeyForCard(card) {
  return `level${card.level}`;
}

function shuffleCards(cards) {
  const result = cards.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

function scoreMediumTakeTokensAction(playerView, action, difficulty) {
  const futurePlayer = createPlayerWithTokenChanges(playerView.player, action.tokens);
  const futureBank = createBankAfterTakingTokens(playerView.bank, action.tokens);
  const cards = getBuyableCards(playerView);
  const allowFutureDoubleTake = !isDoubleTokenTake(action.tokens);
  return (
    scoreNewBuyableCards(playerView, futurePlayer, cards, difficulty) +
    scoreNearestBuyTurn(playerView, futurePlayer, futureBank, cards, difficulty, allowFutureDoubleTake)
  );
}

function scoreMediumReserveAction(playerView, action, difficulty) {
  const card = action.card;
  const tokenChanges = playerView.bank.gold > 0 ? { gold: 1 } : {};
  const futurePlayer = createPlayerWithTokenChanges(playerView.player, tokenChanges, card);
  const futureBank = createBankAfterReservingCard(playerView.bank);
  const futureCards = getBuyableCards(playerView).filter((candidate) => candidate.id !== card.id);
  futureCards.push(card);
  return (
    scoreNewBuyableCards(playerView, futurePlayer, futureCards, difficulty) +
    scoreReservedCardBuyTurn(playerView, futurePlayer, futureBank, card, difficulty)
  );
}

function scoreNewBuyableCards(playerView, futurePlayer, futureCards, difficulty) {
  const currentlyBuyableIds = new Set(
    getBuyableCards(playerView)
      .filter((card) => canBuyCard(playerView.player, card))
      .map((card) => card.id)
  );
  const futureView = { ...playerView, player: futurePlayer };

  return futureCards.reduce((score, card) => {
    if (currentlyBuyableIds.has(card.id) || !canBuyCard(futurePlayer, card)) {
      return score;
    }
    return score + scoreBuyAction(futureView, { card }, difficulty) * FUTURE_BUY_SCORE_WEIGHT;
  }, 0);
}

function getBuyableCards(playerView) {
  return [
    ...playerView.market.level1,
    ...playerView.market.level2,
    ...playerView.market.level3,
    ...playerView.player.reserved,
  ].filter((card) => card && !isHiddenReservedCard(card));
}

function createPlayerWithTokenChanges(player, tokenChanges, reservedCard = null) {
  const tokens = { ...player.tokens };
  ALL_TOKEN_COLORS.forEach((color) => {
    tokens[color] += tokenChanges[color] || 0;
  });

  return {
    ...player,
    tokens,
    reserved: reservedCard ? [...player.reserved, reservedCard] : player.reserved.slice(),
  };
}

function createBankAfterTakingTokens(bank, tokens) {
  const nextBank = { ...bank };
  TOKEN_COLORS.forEach((color) => {
    nextBank[color] -= tokens[color] || 0;
  });
  return nextBank;
}

function createBankAfterReservingCard(bank) {
  return {
    ...bank,
    gold: Math.max(0, (bank.gold || 0) - 1),
  };
}

function scoreReservedCardBuyTurn(playerView, player, bank, card, difficulty) {
  const turns = estimateTokenTurnsToBuy(player, card, bank, true);
  if (!Number.isFinite(turns)) {
    return 0;
  }

  const buyScore = scoreBuyAction({ ...playerView, player }, { card }, difficulty);
  return (buyScore * RESERVED_CARD_TURN_SCORE_WEIGHT) / (turns + 1);
}

function scoreNearestBuyTurn(playerView, player, bank, cards, difficulty, allowDoubleTake) {
  const nearest = cards.reduce(
    (best, card) => {
      const turns = estimateTokenTurnsToBuy(player, card, bank, allowDoubleTake);
      if (turns > best.turns) {
        return best;
      }

      const buyScore = scoreBuyAction({ ...playerView, player }, { card }, difficulty);
      if (turns === best.turns && buyScore <= best.buyScore) {
        return best;
      }

      return { turns, buyScore };
    },
    { turns: Infinity, buyScore: 0 }
  );

  if (!Number.isFinite(nearest.turns)) {
    return 0;
  }

  return (nearest.buyScore * NEAREST_BUY_TURN_SCORE_WEIGHT) / (nearest.turns + 1);
}

function estimateTokenTurnsToBuy(player, card, bank, allowDoubleTake) {
  const bonuses = getPlayerBonuses(player);
  const deficits = TOKEN_COLORS.map((color) =>
    Math.max(0, card.cost[color] - bonuses[color] - player.tokens[color])
  );
  const flexibleTokens = (player.tokens.gold || 0) + (player.awakeningTokens || 0);
  const doubleTakeColorIndexes = allowDoubleTake ? getDoubleTakeColorIndexes(bank) : [];
  return countTokenTurnsUntilAffordable(deficits, flexibleTokens, doubleTakeColorIndexes);
}

function countTokenTurnsUntilAffordable(initialDeficits, flexibleTokens, doubleTakeColorIndexes) {
  if (sumDeficits(initialDeficits) <= flexibleTokens) {
    return 0;
  }

  const queue = [{ deficits: initialDeficits, turns: 0, doubleTakeUsed: false }];
  const visited = new Set([tokenTurnSearchKey(initialDeficits, false)]);

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const tokenTakes = [...THEORETICAL_THREE_COLOR_TAKES];
    if (!current.doubleTakeUsed) {
      doubleTakeColorIndexes.forEach((colorIndex) => {
        const tokenTake = Array(TOKEN_COLORS.length).fill(0);
        tokenTake[colorIndex] = 2;
        tokenTakes.push(tokenTake);
      });
    }

    for (const tokenTake of tokenTakes) {
      const nextDeficits = current.deficits.map((deficit, colorIndex) =>
        Math.max(0, deficit - tokenTake[colorIndex])
      );
      const nextDoubleTakeUsed = current.doubleTakeUsed || tokenTake.some((count) => count > 1);
      const key = tokenTurnSearchKey(nextDeficits, nextDoubleTakeUsed);
      if (visited.has(key)) {
        continue;
      }
      if (sumDeficits(nextDeficits) <= flexibleTokens) {
        return current.turns + 1;
      }
      visited.add(key);
      queue.push({
        deficits: nextDeficits,
        turns: current.turns + 1,
        doubleTakeUsed: nextDoubleTakeUsed,
      });
    }
  }

  return Infinity;
}

function createTheoreticalThreeColorTakes() {
  const takes = [];
  for (let first = 0; first < TOKEN_COLORS.length - 2; first += 1) {
    for (let second = first + 1; second < TOKEN_COLORS.length - 1; second += 1) {
      for (let third = second + 1; third < TOKEN_COLORS.length; third += 1) {
        const take = Array(TOKEN_COLORS.length).fill(0);
        take[first] = 1;
        take[second] = 1;
        take[third] = 1;
        takes.push(take);
      }
    }
  }

  return takes;
}

function getDoubleTakeColorIndexes(bank) {
  return TOKEN_COLORS.map((color, index) => ((bank[color] || 0) >= 4 ? index : null)).filter(
    (index) => index !== null
  );
}

function isDoubleTokenTake(tokens) {
  return TOKEN_COLORS.some((color) => tokens[color] === 2);
}

function tokenTurnSearchKey(deficits, doubleTakeUsed) {
  return `${deficits.join(",")}:${doubleTakeUsed ? 1 : 0}`;
}

function sumDeficits(deficits) {
  return deficits.reduce((sum, deficit) => sum + deficit, 0);
}
