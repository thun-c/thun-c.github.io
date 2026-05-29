import {
  TOKEN_COLORS,
  ALL_TOKEN_COLORS,
  createPlayerView,
  getLegalActions,
  getPlayerBonuses,
  totalTokens,
} from "./game.js";

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
    return scoreReserveAction(playerView, action);
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
  const difficultyBonus = difficulty === "easy" ? 0 : noblePressure;
  return 120 + card.points * 35 + card.level * 6 + difficultyBonus;
}

function scoreReserveAction(playerView, action) {
  const card = action.card;
  if (!card) {
    return playerView.bank.gold > 0 ? 16 : 5;
  }
  const goldValue = playerView.bank.gold > 0 ? 18 : 0;
  return 10 + goldValue + card.points * 12 + card.level * 2;
}

function scoreTakeTokensAction(playerView, action, difficulty) {
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
