import {
  TOKEN_COLORS,
  ALL_TOKEN_COLORS,
  canBuyCard,
  createPlayerView,
  getLegalActions,
  getPlayerBonuses,
  totalTokens,
} from "./game.js";

const FUTURE_BUY_SCORE_WEIGHT = 0.03;
const NEAREST_BUY_TURN_SCORE_WEIGHT = 0.12;
const RESERVED_CARD_TURN_SCORE_WEIGHT = 0.015;
const THEORETICAL_THREE_COLOR_TAKES = createTheoreticalThreeColorTakes();

export function chooseCpuAction(game, playerId, difficulty = "easy") {
  const playerView = createPlayerView(game, playerId);
  const actions = getLegalActions(game, playerId);
  if (actions.length === 0) {
    return null;
  }
  return chooseActionByHeuristic(playerView, actions, difficulty);
}

export function chooseActionByHeuristic(playerView, actions, difficulty = "easy") {
  const scored = actions.map((action) => ({
    action,
    score: scoreAction(playerView, action, difficulty) + Math.random() * 0.25,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0].action;
}

export function scoreAction(playerView, action, difficulty = "easy") {
  if (action.type === "claimNoble") {
    return 500;
  }

  if (action.type === "discardTokens") {
    return scoreDiscardAction(playerView, action);
  }

  if (action.type === "buyCard") {
    return scoreBuyAction(playerView, action, difficulty);
  }

  if (action.type === "reserveCard") {
    return scoreReserveAction(playerView, action, difficulty);
  }

  if (action.type === "takeTokens") {
    return scoreTakeTokensAction(playerView, action, difficulty);
  }

  if (action.type === "passTurn") {
    return -1000;
  }

  return 0;
}

function scoreBuyAction(playerView, action, difficulty) {
  const card = action.card;
  const bonuses = getPlayerBonuses(playerView.player);
  const noblePressure = playerView.nobles.reduce((score, noble) => {
    const current = bonuses[card.bonus];
    const required = noble.requirement[card.bonus] || 0;
    return score + (current < required ? 4 : 0);
  }, 0);
  const difficultyBonus = difficulty === "easy" || difficulty === "medium" ? 0 : noblePressure;
  return 120 + card.points * 35 + card.level * 6 + difficultyBonus;
}

function scoreReserveAction(playerView, action, difficulty) {
  const card = action.card;
  if (!card) {
    return playerView.bank.gold > 0 ? 16 : 5;
  }
  if (difficulty !== "medium") {
    const goldValue = playerView.bank.gold > 0 ? 18 : 0;
    return 10 + goldValue + card.points * 12 + card.level * 2;
  }
  return scoreMediumReserveAction(playerView, action, difficulty);
}

function scoreTakeTokensAction(playerView, action, difficulty) {
  if (difficulty === "medium") {
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
    const pointWeight = difficulty === "easy" ? 1 : 1 + card.points;
    TOKEN_COLORS.forEach((color) => {
      const remaining = Math.max(0, card.cost[color] - bonuses[color] - player.tokens[color]);
      if (remaining > 0) {
        wanted[color] += remaining * pointWeight;
      }
    });
  });

  if (difficulty !== "easy") {
    playerView.nobles.forEach((noble) => {
      TOKEN_COLORS.forEach((color) => {
        const remaining = Math.max(0, noble.requirement[color] - bonuses[color]);
        wanted[color] += remaining * 0.75;
      });
    });
  }

  return wanted;
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
  ].filter(Boolean);
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
  const gold = player.tokens.gold || 0;
  const doubleTakeColorIndexes = allowDoubleTake ? getDoubleTakeColorIndexes(bank) : [];
  return countTokenTurnsUntilAffordable(deficits, gold, doubleTakeColorIndexes);
}

function countTokenTurnsUntilAffordable(initialDeficits, gold, doubleTakeColorIndexes) {
  if (sumDeficits(initialDeficits) <= gold) {
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
      if (sumDeficits(nextDeficits) <= gold) {
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
