import {
  createNewGame,
  emptyTokens,
  refreshScores,
} from "./game.js";

const HUMAN_ID = 0;
const CPU_ID = 1;
const SCENARIO_COUNT = 3;

const TUTORIAL_STEPS = [
  [
    {
      action: "select-token",
      target: { color: "white" },
      message: "光マナを1つ選びます。",
      advance: "ui",
    },
    {
      action: "confirm-tokens",
      gameAction: "takeTokens",
      message: "選んだマナを取ります。相手の手番はスキップします。",
      after: skipToHumanAction,
    },
    {
      action: "open-card",
      target: { sourceType: "market", cardId: "tutorial-1-recruit" },
      message: "取ったマナで買える兵を選びます。",
      advance: "ui",
    },
    {
      action: "buy-card",
      gameAction: "buyCard",
      message: "スカウトして、兵が自分の場に加わる流れを見ます。",
      completeScenario: true,
    },
  ],
  [
    {
      action: "open-card",
      target: { sourceType: "market", cardId: "tutorial-2-reserve" },
      message: "予約したい兵を選びます。",
      advance: "ui",
    },
    {
      action: "reserve-card",
      gameAction: "reserveCard",
      message: "予約して全マナを受け取ります。",
      after: prepareScenario2ReservedBuy,
    },
    {
      action: "open-card",
      target: { sourceType: "reserved", cardId: "tutorial-2-reserve" },
      message: "次の手番です。予約した兵を選びます。",
      advance: "ui",
    },
    {
      action: "buy-card",
      gameAction: "buyCard",
      message: "全マナを使って予約した兵をスカウトします。",
      completeScenario: true,
    },
  ],
  [
    {
      action: "open-card",
      target: { sourceType: "market", cardId: "tutorial-3-trigger" },
      message: "この兵をスカウトすると紋章条件を満たします。",
      advance: "ui",
    },
    {
      action: "buy-card",
      gameAction: "buyCard",
      message: "兵をスカウトして、紋章を獲得できる状態にします。",
    },
    {
      action: "claim-noble",
      gameAction: "claimNoble",
      target: { nobleId: "tutorial-3-noble" },
      message: "条件を満たした紋章を獲得します。",
    },
    {
      action: "dismiss-cutin",
      gameAction: "clearCutIn",
      message: "双醒の覚醒効果を確認して閉じます。",
      after: prepareScenario3AwakeningBuy,
    },
    {
      action: "open-card",
      target: { sourceType: "market", cardId: "tutorial-3-lv3" },
      message: "覚醒を不足コストとして使えるLv3兵を選びます。",
      advance: "ui",
    },
    {
      action: "buy-card",
      gameAction: "buyCard",
      message: "覚醒を消費してLv3兵をスカウトします。",
      completeTutorial: true,
    },
  ],
];

const SCENARIO_TITLES = [
  "状況1: マナを取って兵をスカウト",
  "状況2: 予約で全マナを得てスカウト",
  "状況3: 紋章覚醒でLv3兵をスカウト",
];

export function createTutorialSession() {
  return {
    active: true,
    scenarioIndex: 0,
    stepIndex: 0,
    scenarioComplete: false,
    done: false,
  };
}

export function createTutorialGame(data, scenarioIndex = 0) {
  const game = createNewGame(
    [
      { type: "human", name: "あなた" },
      { type: "cpu", difficulty: "lv01" },
    ],
    data
  );
  game.players[HUMAN_ID].name = "あなた";
  game.players[CPU_ID].name = "CPU Lv1";
  game.settings.players[HUMAN_ID].name = "あなた";
  game.settings.players[CPU_ID].name = "CPU Lv1";
  game.turnOrder = [HUMAN_ID, CPU_ID];
  game.startPlayerIndex = HUMAN_ID;
  game.currentTurnOrderIndex = 0;
  game.currentPlayerIndex = HUMAN_ID;
  game.round = 1;
  game.phase = "action";
  game.pendingNobles = [];
  game.finalRoundTriggeredBy = null;
  game.winnerIds = [];
  game.cutIn = null;
  game.decks = { level1: [], level2: [], level3: [] };
  game.market = { level1: [], level2: [], level3: [] };
  game.nobles = [];
  game.bank = tokens();
  resetTutorialPlayers(game);

  if (scenarioIndex === 0) {
    setupScenario1(game);
  } else if (scenarioIndex === 1) {
    setupScenario2(game);
  } else {
    setupScenario3(game);
  }

  game.log = [
    logEntry(`${SCENARIO_TITLES[scenarioIndex]}を開始しました。`),
    logEntry("チュートリアル中は光っている場所だけ押してください。"),
  ];
  refreshScores(game);
  return game;
}

export function getTutorialView(tutorial) {
  if (!tutorial?.active) {
    return null;
  }
  const scenarioIndex = tutorial.scenarioIndex;
  const scenarioNumber = scenarioIndex + 1;
  const step = getTutorialStep(tutorial);
  return {
    active: true,
    scenarioIndex,
    scenarioNumber,
    scenarioCount: SCENARIO_COUNT,
    title: SCENARIO_TITLES[scenarioIndex],
    message: getTutorialMessage(tutorial, step),
    step,
    scenarioComplete: tutorial.scenarioComplete,
    done: tutorial.done,
  };
}

export function isTutorialActionAllowed(tutorialView, action, target = {}) {
  if (!tutorialView?.active) {
    return true;
  }
  if (action === "tutorial-exit") {
    return true;
  }
  return doesTutorialStepMatch(tutorialView.step, action, target);
}

export function doesTutorialStepMatch(step, action, target = {}) {
  if (!step || step.action !== action) {
    return false;
  }
  return Object.entries(step.target || {}).every(([key, value]) => String(target[key] || "") === String(value));
}

export function getTutorialBlockedMessage(tutorialView) {
  return tutorialView?.step?.action === "tutorial-next"
    ? "次の状況へ進んでください。"
    : "光っている場所を押してください。";
}

export function advanceTutorialAfterUiAction(tutorial, action, target = {}) {
  const step = getTutorialStep(tutorial);
  if (step?.advance !== "ui" || !doesTutorialStepMatch(step, action, target)) {
    return;
  }
  tutorial.stepIndex += 1;
}

export function advanceTutorialAfterGameAction(tutorial, game, action) {
  const step = getTutorialStep(tutorial);
  if (!step || step.gameAction !== action.type) {
    return;
  }
  if (step.target && !doesTutorialStepMatch(step, step.action, actionToTarget(action))) {
    return;
  }
  if (typeof step.after === "function") {
    step.after(game);
  }
  if (step.completeTutorial) {
    tutorial.done = true;
    tutorial.scenarioComplete = false;
    return;
  }
  if (step.completeScenario) {
    tutorial.scenarioComplete = true;
    return;
  }
  tutorial.stepIndex += 1;
}

export function advanceTutorialScenario(tutorial) {
  if (!tutorial?.active || tutorial.done) {
    return tutorial;
  }
  return {
    active: true,
    scenarioIndex: Math.min(tutorial.scenarioIndex + 1, SCENARIO_COUNT - 1),
    stepIndex: 0,
    scenarioComplete: false,
    done: false,
  };
}

function getTutorialStep(tutorial) {
  if (!tutorial?.active) {
    return null;
  }
  if (tutorial.done) {
    return {
      action: "tutorial-exit",
      message: "チュートリアルは完了です。通常の新規ゲームへ戻れます。",
    };
  }
  if (tutorial.scenarioComplete) {
    return {
      action: "tutorial-next",
      message: "この状況は完了です。次の状況へ進みます。",
    };
  }
  return TUTORIAL_STEPS[tutorial.scenarioIndex]?.[tutorial.stepIndex] || null;
}

function getTutorialMessage(tutorial, step) {
  if (!step) {
    return "チュートリアルを進めます。";
  }
  if (tutorial.done || tutorial.scenarioComplete) {
    return step.message;
  }
  return step.message;
}

function actionToTarget(action) {
  if (action.type === "claimNoble") {
    return { nobleId: action.nobleId };
  }
  if (action.source) {
    return {
      sourceType: action.source.type,
      cardId: action.source.cardId,
    };
  }
  return {};
}

function setupScenario1(game) {
  const player = game.players[HUMAN_ID];
  player.tokens = tokens({ blue: 1 });
  game.bank = tokens({ white: 1, gold: 5 });
  game.market.level1 = [
    card("tutorial-1-recruit", 1, 0, "green", { white: 1, blue: 1 }),
  ];
}

function setupScenario2(game) {
  const player = game.players[HUMAN_ID];
  player.tokens = tokens({ white: 1 });
  game.bank = tokens({ gold: 5 });
  game.market.level1 = [
    card("tutorial-2-reserve", 1, 0, "blue", { white: 1, red: 1 }),
  ];
}

function setupScenario3(game) {
  const player = game.players[HUMAN_ID];
  player.tokens = tokens({ green: 1 });
  player.cards = [
    card("tutorial-3-base", 1, 0, "white", {}),
  ];
  game.bank = tokens({ gold: 5 });
  game.market.level1 = [
    card("tutorial-3-trigger", 1, 0, "white", { green: 1 }),
  ];
  game.market.level3 = [
    card("tutorial-3-lv3", 3, 3, "black", { red: 2 }),
  ];
  game.nobles = [
    noble("tutorial-3-noble", 3, { white: 2 }, "dual"),
  ];
}

function prepareScenario2ReservedBuy(game) {
  skipToHumanAction(game);
}

function prepareScenario3AwakeningBuy(game) {
  skipToHumanAction(game);
  game.market.level3 = [
    card("tutorial-3-lv3", 3, 3, "black", { red: 2 }),
  ];
  refreshScores(game);
}

function skipToHumanAction(game) {
  game.turnOrder = [HUMAN_ID, CPU_ID];
  game.startPlayerIndex = HUMAN_ID;
  game.currentTurnOrderIndex = 0;
  game.currentPlayerIndex = HUMAN_ID;
  game.phase = "action";
  game.pendingNobles = [];
  game.updatedAt = Date.now();
  refreshScores(game);
}

function resetTutorialPlayers(game) {
  game.players.forEach((player) => {
    player.tokens = tokens();
    player.cards = [];
    player.reserved = [];
    player.nobles = [];
    player.awakeningTokens = 0;
    player.prestigeBonus = 0;
    player.lastScoringSource = null;
    player.score = 0;
  });
}

function card(id, level, points, bonus, cost) {
  return {
    id,
    level,
    points,
    bonus,
    cost: gems(cost),
  };
}

function noble(id, points, requirement, awakeningEffectId) {
  return {
    id,
    points,
    requirement: gems(requirement),
    awakeningEffectId,
  };
}

function tokens(values = {}) {
  return {
    ...emptyTokens(),
    ...values,
  };
}

function gems(values = {}) {
  return {
    white: 0,
    blue: 0,
    green: 0,
    red: 0,
    black: 0,
    ...values,
  };
}

function logEntry(text) {
  return {
    at: new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    text,
  };
}
