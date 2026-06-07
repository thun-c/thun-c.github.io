import {
  createNewGame,
  emptyTokens,
  passTurn,
  refreshScores,
} from "./game.js";

const HUMAN_ID = 0;
const CPU_ID = 1;
const SCENARIO_COUNT = 5;

const TUTORIAL_STEPS = [
  [
    {
      action: "select-token",
      target: { color: "white" },
      message: "光マナを1つ選びます。",
      details: [
        "この兵は光1・雷1が必要です。",
        "あなたは雷マナを1つ持っています。足りない光マナを取りにいきます。",
      ],
      advance: "ui",
    },
    {
      action: "confirm-tokens",
      gameAction: "takeTokens",
      message: "選んだマナを取ります。相手の手番はスキップします。",
      details: [
        "取った光マナは自分のプレイヤー枠に移ります。",
        "光1・雷1がそろうので、ギルドの緑の兵をスカウトできるようになります。",
      ],
      after: skipToHumanAction,
    },
    {
      action: "open-card",
      target: { sourceType: "market", cardId: "tutorial-1-recruit" },
      message: "取ったマナで買える兵を選びます。",
      details: [
        "カード下部の条件と、プレイヤー枠のマナが一致しています。",
        "スカウトできるか迷ったら、まず兵を押して詳細を確認できます。",
      ],
      advance: "ui",
    },
    {
      action: "buy-card",
      gameAction: "buyCard",
      message: "スカウトして、兵が自分の場に加わる流れを見ます。",
      details: [
        "支払ったマナは場に戻ります。",
        "兵は自分の場に残り、次から同じ色の割引として働きます。",
      ],
      completeScenario: true,
    },
  ],
  [
    {
      action: "open-card",
      target: { sourceType: "market", cardId: "tutorial-2-discount" },
      message: "兵の割引とマナで買える兵を選びます。",
      details: [
        "この兵は光1・雷1が必要です。",
        "あなたの白い兵が光1ぶんを肩代わりし、手元の雷マナ1個だけを支払います。",
      ],
      advance: "ui",
    },
    {
      action: "buy-card",
      gameAction: "buyCard",
      message: "兵は消費せず、マナだけを支払ってスカウトします。",
      details: [
        "支払い表示は雷1だけになります。",
        "スカウト後も白い兵はプレイヤー枠に残り、次のスカウトでも割引になります。",
      ],
      completeScenario: true,
    },
  ],
  [
    {
      action: "open-card",
      target: { sourceType: "market", cardId: "tutorial-3-reserve" },
      message: "予約したい兵を選びます。",
      details: [
        "この兵は赤マナが足りず、今はスカウトできません。",
        "予約するとカードを手元に確保し、全マナを1つ受け取れます。",
      ],
      advance: "ui",
    },
    {
      action: "reserve-card",
      gameAction: "reserveCard",
      message: "予約して全マナを受け取ります。",
      details: [
        "全マナは足りない色の代わりになります。",
        "ここでは相手の手番を飛ばして、次の自分の手番へ進みます。",
      ],
      after: prepareScenario3ReservedBuy,
    },
    {
      action: "open-card",
      target: { sourceType: "reserved", cardId: "tutorial-3-reserve" },
      message: "次の手番です。予約した兵を選びます。",
      details: [
        "予約した兵はプレイヤー枠の予約欄にあります。",
        "白マナ1つと全マナ1つで、白1・赤1の条件を満たせます。",
      ],
      advance: "ui",
    },
    {
      action: "buy-card",
      gameAction: "buyCard",
      message: "全マナを使って予約した兵をスカウトします。",
      details: [
        "予約は、欲しい兵を確保しながら次の購入準備をする行動です。",
        "全マナをいつ使うかが、中盤以降の計画に効いてきます。",
      ],
      completeScenario: true,
    },
  ],
  [
    {
      action: "open-card",
      target: { sourceType: "market", cardId: "tutorial-4-trigger" },
      message: "この兵をスカウトすると紋章条件を満たします。",
      details: [
        "場の紋章は白の兵2枚を条件にしています。",
        "あなたはすでに白の兵を1枚持っているので、もう1枚で条件達成です。",
      ],
      advance: "ui",
    },
    {
      action: "buy-card",
      gameAction: "buyCard",
      message: "兵をスカウトして、紋章を獲得できる状態にします。",
      details: [
        "兵は購入後も残るので、紋章条件の枚数として数えます。",
        "購入後、条件を満たした紋章を獲得する選択に進みます。",
      ],
    },
    {
      action: "claim-noble",
      gameAction: "claimNoble",
      target: { nobleId: "tutorial-4-noble" },
      message: "条件を満たした紋章を獲得します。",
      details: [
        "この紋章は双醒です。",
        "獲得すると覚醒を2個得て、次の大きなスカウトを助けます。",
      ],
    },
    {
      action: "dismiss-cutin",
      gameAction: "clearCutIn",
      message: "双醒の覚醒効果を確認して閉じます。",
      details: [
        "覚醒はカード購入時の不足コストとして使えます。",
        "次の手番では、足りない赤2を覚醒2個で補います。",
      ],
      after: prepareScenario4AwakeningBuy,
    },
    {
      action: "open-card",
      target: { sourceType: "market", cardId: "tutorial-4-lv3" },
      message: "覚醒を不足コストとして使えるLv3兵を選びます。",
      details: [
        "このLv3兵は赤2が足りません。",
        "通常なら買えませんが、覚醒2個で不足分を補えます。",
      ],
      advance: "ui",
    },
    {
      action: "buy-card",
      gameAction: "buyCard",
      message: "覚醒を消費してLv3兵をスカウトします。",
      details: [
        "覚醒はマナではないので、10枚上限に数えません。",
        "紋章ルートは、覚醒で高レベル兵へ届きやすくなるのが強みです。",
      ],
      completeScenario: true,
    },
  ],
  [
    {
      action: "open-card",
      target: { sourceType: "market", cardId: "tutorial-5-finish" },
      message: "最後の得点つき兵を選び、13点到達を確認します。",
      details: [
        "ゲームの目的は、得点つき兵や紋章で点数を集めて勝つことです。",
        "2人戦で紋章を持っていない場合は、13点で終了条件を発生させられます。",
        "この盤面では終了条件に集中するため、支払いなしで買える兵を置いています。",
      ],
      advance: "ui",
    },
    {
      action: "buy-card",
      gameAction: "buyCard",
      message: "1点の兵をスカウトして、12点から13点へ到達します。",
      details: [
        "終了条件に届くと、すぐ勝ちではなく、このラウンドで終了します。",
        "紋章を1枚以上持っている場合は、通常どおり15点が終了条件です。",
      ],
    },
    {
      action: "dismiss-cutin",
      gameAction: "clearCutIn",
      message: "終了条件到達の演出を確認して閉じます。",
      details: [
        "あなたが13点に到達したので、このラウンドで終了します。",
        "ここではCPUの最終手番をチュートリアル用にスキップし、勝敗確認へ進みます。",
      ],
      after: finishTutorialFinalRound,
    },
    {
      action: "new-game",
      message: "優勝演出を確認したら、新規ゲームへ戻ります。",
      details: [
        "勝者は最終点数で決まります。",
        "同点なら、購入した兵が少ないプレイヤーが勝ちます。",
      ],
    },
  ],
];

const SCENARIO_TITLES = [
  "状況1: マナを取って兵をスカウト",
  "状況2: 兵割引とマナでスカウト",
  "状況3: 予約で全マナを得てスカウト",
  "状況4: 紋章覚醒でLv3兵をスカウト",
  "状況5: 点数を集めて終了条件へ",
];

const SCENARIO_COMPLETIONS = [
  {
    message: "マナを取って兵をスカウトできました。",
    details: [
      "マナは支払いで場に戻り、兵は自分の場に残ります。",
    ],
  },
  {
    message: "兵割引とマナを合算してスカウトできました。",
    details: [
      "雷マナは消費されましたが、白い兵は残っています。",
      "兵は使い捨てではなく、ずっと割引として働きます。",
    ],
  },
  {
    message: "予約と全マナを使ったスカウトを確認しました。",
    details: [
      "予約は、欲しい兵を確保しながら不足色を補う準備になります。",
    ],
  },
  {
    message: "紋章覚醒で高レベル兵へ届く流れを確認しました。",
    details: [
      "紋章を取ると、覚醒効果で通常より大きなスカウトを狙えます。",
    ],
  },
];

const SCENARIO_SETUPS = [
  setupScenario1,
  setupScenario2,
  setupScenario3,
  setupScenario4,
  setupScenario5,
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

  const setupScenario = SCENARIO_SETUPS[scenarioIndex] || setupScenario1;
  setupScenario(game);

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
    details: getTutorialDetails(step),
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
  if (tutorialView?.step?.action === "new-game") {
    return "優勝演出の新規ゲームを押してください。";
  }
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
      details: [
        "マナ取得、兵割引、予約、紋章覚醒、終了条件を確認しました。",
        "通常ゲームでは相手も動くので、どの準備を優先するかが大切です。",
      ],
    };
  }
  if (tutorial.scenarioComplete) {
    const completion = SCENARIO_COMPLETIONS[tutorial.scenarioIndex] || {};
    return {
      action: "tutorial-next",
      message: completion.message || "この状況は完了です。次の状況へ進みます。",
      details: completion.details || [
        "ここでは学びやすいように、次の固定盤面へ切り替えます。",
      ],
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

function getTutorialDetails(step) {
  return Array.isArray(step?.details) ? step.details : [];
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
  player.tokens = tokens({ blue: 1 });
  player.cards = [
    card("tutorial-2-bonus", 1, 0, "white", {}),
  ];
  game.bank = tokens({ gold: 5 });
  game.market.level1 = [
    card("tutorial-2-discount", 1, 0, "red", { white: 1, blue: 1 }),
  ];
}

function setupScenario3(game) {
  const player = game.players[HUMAN_ID];
  player.tokens = tokens({ white: 1 });
  game.bank = tokens({ gold: 5 });
  game.market.level1 = [
    card("tutorial-3-reserve", 1, 0, "blue", { white: 1, red: 1 }),
  ];
}

function setupScenario4(game) {
  const player = game.players[HUMAN_ID];
  player.tokens = tokens({ green: 1 });
  player.cards = [
    card("tutorial-4-base", 1, 0, "white", {}),
  ];
  game.bank = tokens({ gold: 5 });
  game.market.level1 = [
    card("tutorial-4-trigger", 1, 0, "white", { green: 1 }),
  ];
  game.market.level3 = [
    card("tutorial-4-lv3", 3, 3, "black", { red: 2 }),
  ];
  game.nobles = [
    noble("tutorial-4-noble", 3, { white: 2 }, "dual"),
  ];
}

function setupScenario5(game) {
  const player = game.players[HUMAN_ID];
  player.cards = [
    card("tutorial-5-score-a", 2, 3, "white", {}),
    card("tutorial-5-score-b", 2, 3, "blue", {}),
    card("tutorial-5-score-c", 2, 3, "green", {}),
    card("tutorial-5-score-d", 2, 3, "black", {}),
  ];
  game.bank = tokens();
  game.market.level1 = [
    card("tutorial-5-finish", 1, 1, "red", {}),
  ];
  refreshScores(game);
}

function prepareScenario3ReservedBuy(game) {
  skipToHumanAction(game);
}

function prepareScenario4AwakeningBuy(game) {
  skipToHumanAction(game);
  game.market.level3 = [
    card("tutorial-4-lv3", 3, 3, "black", { red: 2 }),
  ];
  refreshScores(game);
}

function finishTutorialFinalRound(game) {
  passTurn(game);
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
