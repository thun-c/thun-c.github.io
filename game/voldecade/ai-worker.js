(function(modules){const cache={};function load(id){if(cache[id])return cache[id].exports;const record=modules[id];if(!record)throw new Error("Missing module "+id);const module={exports:{}};cache[id]=module;record[0](module,module.exports,(name)=>load(record[1][name]));return module.exports;}load(0);})({0:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAiWorkerRequest = void 0;
const ai_1 = require("@voldecade/ai");
const runAiWorkerRequest = (request) => ({
    generationId: request.generationId,
    decision: (0, ai_1.decideTeam)(request.observation, (0, ai_1.getAiProfile)(request.stage), request.rngState, request.chainPlan),
});
exports.runAiWorkerRequest = runAiWorkerRequest;
const scope = globalThis;
if (scope.document === undefined && typeof scope.postMessage === "function") {
    scope.onmessage = (event) => {
        scope.postMessage?.((0, exports.runAiWorkerRequest)(event.data));
    };
}

},{"@voldecade/ai":1}],
1:[function(module,exports,require){
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./bitboard-survival"), exports);
__exportStar(require("./danger"), exports);
__exportStar(require("./decide"), exports);
__exportStar(require("./observation"), exports);
__exportStar(require("./profiles"), exports);
__exportStar(require("./stage-ten"), exports);
__exportStar(require("./stage-eight"), exports);

},{"./bitboard-survival":2,"./danger":21,"./decide":22,"./observation":25,"./profiles":29,"./stage-ten":23,"./stage-eight":27}],
2:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canTeamSurviveForTurnsBitboard = exports.getTeamSurvivalForTurnsBitboard = exports.getTeamReachableCountsForTurnsBitboard = void 0;
const engine_1 = require("@voldecade/engine");
const makeBitboard = (cellCount) => new Uint32Array(Math.ceil(cellCount / 32));
const setBit = (board, index) => {
    const word = index >>> 5;
    board[word] = ((board[word] ?? 0) | (1 << (index & 31))) >>> 0;
};
const clearBit = (board, index) => {
    const word = index >>> 5;
    board[word] = ((board[word] ?? 0) & ~(1 << (index & 31))) >>> 0;
};
const hasBits = (board) => board.some((word) => word !== 0);
const andInto = (target, mask) => {
    for (let index = 0; index < target.length; index += 1) {
        target[index] = ((target[index] ?? 0) & (mask[index] ?? 0)) >>> 0;
    }
};
const andNotInto = (target, mask) => {
    for (let index = 0; index < target.length; index += 1) {
        target[index] = ((target[index] ?? 0) & ~(mask[index] ?? 0)) >>> 0;
    }
};
const orInto = (target, source) => {
    for (let index = 0; index < target.length; index += 1) {
        target[index] = ((target[index] ?? 0) | (source[index] ?? 0)) >>> 0;
    }
};
const shifted = (source, distance, cellCount) => {
    const result = makeBitboard(cellCount);
    const magnitude = Math.abs(distance);
    const wordShift = magnitude >>> 5;
    const bitShift = magnitude & 31;
    for (let sourceWord = 0; sourceWord < source.length; sourceWord += 1) {
        const value = source[sourceWord] ?? 0;
        if (value === 0)
            continue;
        if (distance > 0) {
            const targetWord = sourceWord + wordShift;
            if (targetWord < result.length)
                result[targetWord] = ((result[targetWord] ?? 0) | (value << bitShift)) >>> 0;
            if (bitShift !== 0 && targetWord + 1 < result.length) {
                result[targetWord + 1] = ((result[targetWord + 1] ?? 0) | (value >>> (32 - bitShift))) >>> 0;
            }
        }
        else {
            const targetWord = sourceWord - wordShift;
            if (targetWord >= 0)
                result[targetWord] = ((result[targetWord] ?? 0) | (value >>> bitShift)) >>> 0;
            if (bitShift !== 0 && targetWord - 1 >= 0) {
                result[targetWord - 1] = ((result[targetWord - 1] ?? 0) | (value << (32 - bitShift))) >>> 0;
            }
        }
    }
    const excessBits = result.length * 32 - cellCount;
    if (excessBits > 0 && result.length > 0) {
        const last = result.length - 1;
        result[last] = ((result[last] ?? 0) & (0xffffffff >>> excessBits)) >>> 0;
    }
    return result;
};
const buildEnterable = (floor, magics, width) => {
    const enterable = floor.slice();
    for (const magic of magics)
        clearBit(enterable, (0, engine_1.positionIndex)(magic.position, width));
    return enterable;
};
const expandReachable = (current, enterable, width, cellCount, leftSources, rightSources) => {
    const left = current.slice();
    andInto(left, leftSources);
    const right = current.slice();
    andInto(right, rightSources);
    const entered = shifted(left, -1, cellCount);
    orInto(entered, shifted(right, 1, cellCount));
    orInto(entered, shifted(current, -width, cellCount));
    orInto(entered, shifted(current, width, cellCount));
    andInto(entered, enterable);
    orInto(entered, current);
    return entered;
};
/**
 * Returns, for each observed-team character, whether a movement path keeps it
 * alive through `turnsAhead` future turn resolutions. Optional scheduled magic
 * is added after movement on its placedTurn, allowing evaluation of a fixed
 * construction plan without prematurely blocking the opponent's escape routes.
 * The caller supplies valid placements with unique IDs; unknown future actions
 * and interference with that schedule are not predicted.
 * The bitboard reachability propagation follows Board_bb::get_survival_time_bb
 * from the original upstream project, adapted to this engine's turn and blast rules.
 */
const getTeamReachability = (observation, turnsAhead, scheduledMagics = [], countCells = false) => {
    if (!Number.isInteger(turnsAhead) || turnsAhead < 0)
        throw new RangeError("turnsAhead must be a non-negative integer");
    if (scheduledMagics.some((magic) => !Number.isInteger(magic.placedTurn) || magic.placedTurn <= observation.turn)) {
        throw new RangeError("scheduled magic must be placed on a future turn");
    }
    const characterIds = (0, engine_1.teamCharacterIds)(observation.teamId);
    const characters = characterIds.map((id) => observation.characters[id]);
    const currentSurvival = characters.map((character) => Number(character.alive));
    if (turnsAhead === 0 || (!countCells && ![...observation.magics, ...scheduledMagics].some((magic) => magic.detonateTurn !== null)))
        return currentSurvival;
    const cellCount = observation.width * observation.height;
    const leftSources = makeBitboard(cellCount);
    const rightSources = makeBitboard(cellCount);
    for (let index = 0; index < cellCount; index += 1) {
        const col = index % observation.width;
        if (col > 0)
            setBit(leftSources, index);
        if (col + 1 < observation.width)
            setBit(rightSources, index);
    }
    const reachable = characters.map((character) => {
        const board = makeBitboard(cellCount);
        if (character.alive)
            setBit(board, (0, engine_1.positionIndex)(character.position, observation.width));
        return board;
    });
    const terrain = [...observation.terrain];
    const floor = makeBitboard(cellCount);
    terrain.forEach((cell, index) => { if (cell === "FLOOR")
        setBit(floor, index); });
    let magics = observation.magics.map((magic) => ({ ...magic, position: { ...magic.position } }));
    for (let step = 1; step <= turnsAhead; step += 1) {
        const enterable = buildEnterable(floor, magics, observation.width);
        reachable[0] = expandReachable(reachable[0], enterable, observation.width, cellCount, leftSources, rightSources);
        reachable[1] = expandReachable(reachable[1], enterable, observation.width, cellCount, leftSources, rightSources);
        const turn = observation.turn + step;
        // Movement precedes placement: future magic must not block earlier movement.
        magics.push(...scheduledMagics.filter((magic) => magic.placedTurn === turn));
        if (magics.some((magic) => magic.detonateTurn !== null && magic.detonateTurn <= turn)) {
            const closure = (0, engine_1.collectBlastClosure)(terrain, observation.width, observation.height, magics, turn);
            const blast = makeBitboard(cellCount);
            for (const position of closure.blastCells)
                setBit(blast, (0, engine_1.positionIndex)(position, observation.width));
            andNotInto(reachable[0], blast);
            andNotInto(reachable[1], blast);
            for (const position of closure.destroyedSoftCells) {
                const index = (0, engine_1.positionIndex)(position, observation.width);
                terrain[index] = "FLOOR";
                setBit(floor, index);
            }
            const triggered = new Set(closure.triggeredMagicIds);
            magics = magics.filter((magic) => !triggered.has(magic.id));
        }
        if (!countCells && !magics.some((magic) => magic.detonateTurn !== null) && !scheduledMagics.some((magic) => magic.placedTurn > turn))
            break;
    }
    const count = (board) => {
        if (!countCells)
            return Number(hasBits(board));
        let total = 0;
        for (let word of board)
            while (word !== 0) {
                word = (word & (word - 1)) >>> 0;
                total++;
            }
        return total;
    };
    return [count(reachable[0]), count(reachable[1])];
};
/** Counts distinct reachable safe cells, not paths; uses actual timed chain reactions. */
const getTeamReachableCountsForTurnsBitboard = (observation, turnsAhead, scheduledMagics = []) => getTeamReachability(observation, turnsAhead, scheduledMagics, true);
exports.getTeamReachableCountsForTurnsBitboard = getTeamReachableCountsForTurnsBitboard;
const getTeamSurvivalForTurnsBitboard = (observation, turnsAhead, scheduledMagics = []) => {
    const counts = getTeamReachability(observation, turnsAhead, scheduledMagics);
    return [counts[0] > 0, counts[1] > 0];
};
exports.getTeamSurvivalForTurnsBitboard = getTeamSurvivalForTurnsBitboard;
const canTeamSurviveForTurnsBitboard = (observation, turnsAhead, scheduledMagics = []) => (0, exports.getTeamSurvivalForTurnsBitboard)(observation, turnsAhead, scheduledMagics).every((survives) => survives);
exports.canTeamSurviveForTurnsBitboard = canTeamSurviveForTurnsBitboard;

},{"@voldecade/engine":3}],
3:[function(module,exports,require){
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./blast"), exports);
__exportStar(require("./campaign"), exports);
__exportStar(require("./events"), exports);
__exportStar(require("./items"), exports);
__exportStar(require("./invariants"), exports);
__exportStar(require("./map"), exports);
__exportStar(require("./magic"), exports);
__exportStar(require("./movement"), exports);
__exportStar(require("./outcome"), exports);
__exportStar(require("./resolve-turn"), exports);
__exportStar(require("./rng"), exports);
__exportStar(require("./ruleset"), exports);
__exportStar(require("./state"), exports);
__exportStar(require("./stage-names"), exports);
__exportStar(require("./team-intent"), exports);
__exportStar(require("./test-board"), exports);
__exportStar(require("./types"), exports);

},{"./blast":4,"./campaign":6,"./events":17,"./items":9,"./invariants":18,"./map":16,"./magic":10,"./movement":12,"./outcome":13,"./resolve-turn":8,"./rng":7,"./ruleset":11,"./state":15,"./stage-names":19,"./team-intent":14,"./test-board":20,"./types":5}],
4:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveBlasts = exports.collectBlastClosure = void 0;
const types_1 = require("./types");
const DIRECTIONS = [
    { row: -1, col: 0 },
    { row: 0, col: 1 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
];
const toPosition = (index, width) => ({
    row: Math.floor(index / width),
    col: index % width,
});
const sortedPositions = (indexes, width) => [...indexes].sort((left, right) => left - right).map((index) => toPosition(index, width));
const collectBlastClosure = (terrainBeforeBlast, width, height, magics, currentTurn) => {
    const magicsByCell = new Map();
    for (const magic of magics) {
        const cell = (0, types_1.positionIndex)(magic.position, width);
        const atCell = magicsByCell.get(cell) ?? [];
        atCell.push(magic);
        magicsByCell.set(cell, atCell);
    }
    for (const atCell of magicsByCell.values())
        atCell.sort((left, right) => left.id - right.id);
    const queue = magics
        .filter((magic) => magic.detonateTurn !== null && magic.detonateTurn <= currentTurn)
        .sort((left, right) => left.id - right.id);
    const queued = new Set(queue.map((magic) => magic.id));
    const triggered = new Set();
    const blasts = new Set();
    const destroyed = new Set();
    const enqueueCell = (cell) => {
        for (const magic of magicsByCell.get(cell) ?? []) {
            if (!queued.has(magic.id) && !triggered.has(magic.id)) {
                queue.push(magic);
                queued.add(magic.id);
            }
        }
    };
    while (queue.length > 0) {
        const magic = queue.shift();
        if (magic === undefined || triggered.has(magic.id))
            continue;
        triggered.add(magic.id);
        const center = (0, types_1.positionIndex)(magic.position, width);
        blasts.add(center);
        enqueueCell(center);
        for (const direction of DIRECTIONS) {
            for (let distance = 1; distance <= magic.power; distance += 1) {
                const position = {
                    row: magic.position.row + direction.row * distance,
                    col: magic.position.col + direction.col * distance,
                };
                if (position.row < 0 || position.col < 0 || position.row >= height || position.col >= width)
                    break;
                const cell = (0, types_1.positionIndex)(position, width);
                const terrain = terrainBeforeBlast[cell];
                if (terrain === "HARD" || terrain === undefined)
                    break;
                blasts.add(cell);
                enqueueCell(cell);
                if (terrain === "SOFT") {
                    destroyed.add(cell);
                    break;
                }
            }
        }
    }
    return {
        blastCells: sortedPositions(blasts, width),
        triggeredMagicIds: [...triggered].sort((left, right) => left - right),
        destroyedSoftCells: sortedPositions(destroyed, width),
    };
};
exports.collectBlastClosure = collectBlastClosure;
const resolveBlasts = (state, currentTurn) => {
    const terrainBeforeBlast = [...state.terrain];
    const closure = (0, exports.collectBlastClosure)(terrainBeforeBlast, state.width, state.height, state.magics, currentTurn);
    const blastIndexes = new Set(closure.blastCells.map((position) => (0, types_1.positionIndex)(position, state.width)));
    const triggeredIds = new Set(closure.triggeredMagicIds);
    const terrain = [...state.terrain];
    const hiddenItems = [...state.hiddenItems];
    const visibleItems = [...state.visibleItems];
    const events = [];
    for (const magicId of closure.triggeredMagicIds) {
        const magic = state.magics.find((candidate) => candidate.id === magicId);
        if (magic !== undefined)
            events.push({ kind: "MAGIC_TRIGGERED", magicId, position: magic.position });
    }
    for (const position of closure.destroyedSoftCells) {
        const cell = (0, types_1.positionIndex)(position, state.width);
        terrain[cell] = "FLOOR";
        events.push({ kind: "SOFT_DESTROYED", position });
        const item = hiddenItems[cell];
        if (item !== null && item !== undefined) {
            visibleItems[cell] = item;
            hiddenItems[cell] = null;
            events.push({ kind: "ITEM_REVEALED", item, position });
        }
    }
    const characters = state.characters.map((character) => {
        if (!character.alive || !blastIndexes.has((0, types_1.positionIndex)(character.position, state.width)))
            return character;
        events.push({ kind: "CHARACTER_DEFEATED", characterId: character.id, position: character.position });
        return { ...character, alive: false };
    });
    return {
        state: {
            ...state,
            terrain,
            hiddenItems,
            visibleItems,
            characters,
            magics: state.magics.filter((magic) => !triggeredIds.has(magic.id)),
            lastBlastCells: closure.blastCells,
        },
        events,
        closure,
    };
};
exports.resolveBlasts = resolveBlasts;

},{"./types":5}],
5:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.samePosition = exports.positionIndex = void 0;
const positionIndex = (position, width) => position.row * width + position.col;
exports.positionIndex = positionIndex;
const samePosition = (left, right) => left.row === right.row && left.col === right.col;
exports.samePosition = samePosition;

},{}],
6:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCampaignTurn = exports.createCampaignAtStage = exports.createCampaign = exports.deriveStageSeed = exports.getCampaignProgress = exports.getCampaignScore = void 0;
const rng_1 = require("./rng");
const resolve_turn_1 = require("./resolve-turn");
const state_1 = require("./state");
const emptyScore = () => ({ clearedStages: 0, turnsToLastClear: null, enemyDefeated: 0, playerDefeated: 0, pendingEnemyDefeated: 0, pendingPlayerDefeated: 0 });
const getCampaignScore = (controller) => {
    const score = controller.score ?? emptyScore();
    return { clearedStages: score.clearedStages, turnsToLastClear: score.turnsToLastClear, enemyDefeated: score.enemyDefeated, playerDefeated: score.playerDefeated, killDifference: score.enemyDefeated - score.playerDefeated };
};
exports.getCampaignScore = getCampaignScore;
const getCampaignProgress = (state) => {
    const clearedStages = state.clearedStages ?? 0;
    return {
        clearedStages,
        stageNumber: clearedStages % 10 + 1,
        cycle: Math.floor(clearedStages / 10) + 1,
    };
};
exports.getCampaignProgress = getCampaignProgress;
const deriveStageSeed = (seedRoot, clearedStages) => (0, rng_1.deriveSeed)((0, rng_1.normalizeSeed)(seedRoot), `stage:${clearedStages}`);
exports.deriveStageSeed = deriveStageSeed;
const createStageState = (seedRoot, clearedStages, turn) => {
    const stageSeed = (0, exports.deriveStageSeed)(seedRoot, clearedStages);
    const initial = (0, state_1.createInitialState)("CAMPAIGN", stageSeed);
    return {
        ...initial,
        turn,
        clearedStages,
        stageStartTurn: turn,
        stageSeed,
    };
};
const createCampaign = (seedRoot) => ({
    seedRoot: (0, rng_1.normalizeSeed)(seedRoot),
    state: createStageState(seedRoot, 0, 0),
    score: emptyScore(),
});
exports.createCampaign = createCampaign;
const createCampaignAtStage = (seedRoot, stageNumber) => {
    if (!Number.isInteger(stageNumber) || stageNumber < 1 || stageNumber > 10) {
        throw new Error("development stage must be an integer from 1 to 10");
    }
    return {
        seedRoot: (0, rng_1.normalizeSeed)(seedRoot),
        state: createStageState(seedRoot, stageNumber - 1, 0),
        score: emptyScore(),
    };
};
exports.createCampaignAtStage = createCampaignAtStage;
const resolveCampaignTurn = (controller, playerIntent, enemyIntent) => {
    if (controller.state.mode !== "CAMPAIGN")
        throw new Error("campaign controller requires campaign state");
    const turnResult = (0, resolve_turn_1.resolveTurn)(controller.state, [playerIntent, enemyIntent]);
    const cleared = turnResult.events.some((event) => event.kind === "STAGE_CLEARED");
    const stageChanged = cleared && turnResult.state.outcome.kind === "ONGOING";
    const previousScore = controller.score ?? emptyScore();
    const defeated = turnResult.events.filter((event) => event.kind === "CHARACTER_DEFEATED");
    const pendingEnemyDefeated = previousScore.pendingEnemyDefeated + defeated.filter((event) => event.characterId < 2).length;
    const pendingPlayerDefeated = previousScore.pendingPlayerDefeated + defeated.filter((event) => event.characterId >= 2).length;
    const score = cleared
        ? { clearedStages: previousScore.clearedStages + 1, turnsToLastClear: turnResult.state.turn, enemyDefeated: previousScore.enemyDefeated + pendingEnemyDefeated, playerDefeated: previousScore.playerDefeated + pendingPlayerDefeated, pendingEnemyDefeated: 0, pendingPlayerDefeated: 0 }
        : { ...previousScore, pendingEnemyDefeated, pendingPlayerDefeated };
    if (!stageChanged) {
        return { ...turnResult, controller: { ...controller, state: turnResult.state, score }, stageChanged: false };
    }
    const clearedStages = turnResult.state.clearedStages ?? 0;
    const state = createStageState(controller.seedRoot, clearedStages, turnResult.state.turn);
    const progress = (0, exports.getCampaignProgress)(state);
    const stageEvent = {
        kind: "STAGE_STARTED",
        stageNumber: progress.stageNumber,
        cycle: progress.cycle,
        stageSeed: state.stageSeed,
    };
    return {
        state,
        events: [...turnResult.events, stageEvent],
        resolvedActions: turnResult.resolvedActions,
        controller: { ...controller, state, score },
        stageChanged: true,
        // The resolved board still belongs to the stage that just ended. Keep its
        // pre-clear stage number so UI artwork (including defeat animations) uses
        // the defeated stage's character set until the next stage is shown.
        stageEndState: { ...turnResult.state, clearedStages: Math.max(0, clearedStages - 1) },
    };
};
exports.resolveCampaignTurn = resolveCampaignTurn;

},{"./rng":7,"./resolve-turn":8,"./state":15}],
7:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveSeed = exports.Xorshift32 = exports.nextXorshift32 = exports.normalizeSeed = void 0;
const NON_ZERO_FALLBACK_SEED = 0x6d2b79f5;
const normalizeSeed = (seed) => {
    if (!Number.isSafeInteger(seed)) {
        throw new RangeError("seed must be a safe integer");
    }
    const normalized = seed >>> 0;
    return normalized === 0 ? NON_ZERO_FALLBACK_SEED : normalized;
};
exports.normalizeSeed = normalizeSeed;
const nextXorshift32 = (state) => {
    let value = (0, exports.normalizeSeed)(state);
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return value >>> 0;
};
exports.nextXorshift32 = nextXorshift32;
class Xorshift32 {
    constructor(seed) {
        this.current = (0, exports.normalizeSeed)(seed);
    }
    nextUint32() {
        this.current = (0, exports.nextXorshift32)(this.current);
        return this.current;
    }
    nextInt(upperExclusive) {
        if (!Number.isSafeInteger(upperExclusive) || upperExclusive <= 0) {
            throw new RangeError("upperExclusive must be a positive safe integer");
        }
        return this.nextUint32() % upperExclusive;
    }
    state() {
        return this.current;
    }
}
exports.Xorshift32 = Xorshift32;
const deriveSeed = (rootSeed, streamName) => {
    let hash = (0, exports.normalizeSeed)(rootSeed) ^ 0x811c9dc5;
    for (let index = 0; index < streamName.length; index += 1) {
        hash ^= streamName.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return (0, exports.normalizeSeed)(hash);
};
exports.deriveSeed = deriveSeed;

},{}],
8:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTurn = void 0;
const blast_1 = require("./blast");
const items_1 = require("./items");
const magic_1 = require("./magic");
const movement_1 = require("./movement");
const outcome_1 = require("./outcome");
const team_intent_1 = require("./team-intent");
const movementEvents = (result) => result.movements.flatMap((movement) => {
    if (!movement.succeeded)
        return [{ kind: "MOVE_BLOCKED", characterId: movement.characterId, at: movement.from }];
    if (movement.from.row === movement.to.row && movement.from.col === movement.to.col)
        return [];
    return [{ kind: "MOVED", characterId: movement.characterId, from: movement.from, to: movement.to }];
});
const resolveTurn = (state, intents) => {
    if (state.outcome.kind !== "ONGOING")
        throw new Error("cannot resolve a turn after the game ended");
    const currentTurn = state.turn + 1;
    const normalized = [
        (0, team_intent_1.normalizeTeamIntent)(state, 0, intents[0]),
        (0, team_intent_1.normalizeTeamIntent)(state, 1, intents[1]),
    ];
    const moved = (0, movement_1.resolveMovement)(state, (0, team_intent_1.actionsForMovement)(normalized));
    const collected = (0, items_1.collectVisibleItems)(moved.state);
    const placementActions = (0, team_intent_1.actionsForPlacement)(collected.state, normalized, moved.movements);
    const placed = (0, magic_1.placeRequestedMagics)(collected.state, moved.movements, currentTurn, placementActions);
    const blasted = (0, blast_1.resolveBlasts)(placed.state, currentTurn);
    let nextState = { ...blasted.state, turn: currentTurn };
    const events = [
        ...movementEvents(moved),
        ...collected.events.map((event) => ({ kind: "ITEM_COLLECTED", ...event })),
        ...placed.events,
        ...blasted.events,
    ];
    if (nextState.mode === "CAMPAIGN") {
        const result = (0, outcome_1.evaluateCampaignOutcome)(nextState);
        nextState = { ...nextState, outcome: result.outcome, clearedStages: result.clearedStages };
        if (result.stageCleared)
            events.push({ kind: "STAGE_CLEARED", clearedStages: result.clearedStages });
    }
    else {
        nextState = { ...nextState, outcome: (0, outcome_1.evaluateVersusOutcome)(nextState) };
    }
    if (nextState.outcome.kind !== "ONGOING")
        events.push({ kind: "GAME_ENDED", outcome: nextState.outcome });
    return { state: nextState, events, resolvedActions: placed.resolvedActions };
};
exports.resolveTurn = resolveTurn;

},{"./blast":4,"./items":9,"./magic":10,"./movement":12,"./outcome":13,"./team-intent":14}],
9:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectVisibleItems = void 0;
const types_1 = require("./types");
const collectVisibleItems = (state) => {
    const visibleItems = [...state.visibleItems];
    const collectedCells = new Set();
    const events = [];
    const characters = state.characters.map((character) => {
        if (!character.alive)
            return character;
        const cell = (0, types_1.positionIndex)(character.position, state.width);
        const item = state.visibleItems[cell];
        if (item === null || item === undefined)
            return character;
        collectedCells.add(cell);
        events.push({ characterId: character.id, item, position: character.position });
        return item === "POWER"
            ? { ...character, power: character.power + 1 }
            : { ...character, capacity: character.capacity + 1 };
    });
    for (const cell of collectedCells)
        visibleItems[cell] = null;
    return { state: { ...state, characters, visibleItems }, events };
};
exports.collectVisibleItems = collectVisibleItems;

},{"./types":5}],
10:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.placeRequestedMagics = void 0;
const ruleset_1 = require("./ruleset");
const placeRequestedMagics = (state, movements, currentTurn, placementActions = movements.map((movement) => movement.action)) => {
    const activeByOwner = new Map();
    for (const magic of state.magics) {
        activeByOwner.set(magic.ownerId, (activeByOwner.get(magic.ownerId) ?? 0) + 1);
    }
    const magics = [...state.magics];
    const events = [];
    const resolvedActions = movements.map((movement, index) => {
        const character = state.characters[index];
        if (character === undefined)
            throw new Error(`missing character ${index}`);
        const canPlace = character.alive &&
            movement.succeeded &&
            placementActions[index]?.placeMagic === true &&
            (activeByOwner.get(character.id) ?? 0) < character.capacity;
        if (!canPlace)
            return { ...placementActions[index], placeMagic: false };
        const remainingBeforePlacement = character.capacity - (activeByOwner.get(character.id) ?? 0);
        const requestedFuse = placementActions[index]?.fuse ?? "EIGHT_TURNS";
        const effectiveFuse = requestedFuse === "INFINITE" && remainingBeforePlacement > 1
            ? "INFINITE"
            : "EIGHT_TURNS";
        const magic = {
            id: state.nextMagicId + events.length,
            ownerId: character.id,
            position: character.position,
            power: character.power,
            placedTurn: currentTurn,
            detonateTurn: effectiveFuse === "INFINITE" ? null : currentTurn + ruleset_1.RULESET_V2.fuseTurns,
        };
        magics.push(magic);
        activeByOwner.set(character.id, (activeByOwner.get(character.id) ?? 0) + 1);
        events.push({ kind: "MAGIC_PLACED", magicId: magic.id, ownerId: magic.ownerId, position: magic.position });
        return { ...placementActions[index], fuse: effectiveFuse };
    });
    return {
        state: { ...state, magics, nextMagicId: state.nextMagicId + events.length },
        events,
        resolvedActions,
    };
};
exports.placeRequestedMagics = placeRequestedMagics;

},{"./ruleset":11}],
11:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RULESET_V2 = exports.AI_VERSION = exports.MAP_GENERATOR_VERSION = exports.ENGINE_VERSION = exports.SCHEMA_VERSION = void 0;
exports.SCHEMA_VERSION = 2;
exports.ENGINE_VERSION = "0.6.1";
exports.MAP_GENERATOR_VERSION = "2.0.0";
exports.AI_VERSION = "ai-v18";
exports.RULESET_V2 = Object.freeze({
    id: "ruleset-v2",
    width: 11,
    height: 11,
    fuseTurns: 8,
    campaignTurnLimit: 1000,
    versusTurnLimit: 1000,
    turnDeadlineMs: 3000,
    engineVersion: exports.ENGINE_VERSION,
    aiVersion: exports.AI_VERSION,
    mapGeneratorVersion: exports.MAP_GENERATOR_VERSION,
});

},{}],
12:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveMovement = void 0;
const types_1 = require("./types");
const DELTA = {
    UP: { row: -1, col: 0 },
    RIGHT: { row: 0, col: 1 },
    DOWN: { row: 1, col: 0 },
    LEFT: { row: 0, col: -1 },
    NONE: { row: 0, col: 0 },
};
const resolveOne = (state, character, action) => {
    const delta = DELTA[action.move];
    const target = { row: character.position.row + delta.row, col: character.position.col + delta.col };
    const inBounds = target.row >= 0 && target.col >= 0 && target.row < state.height && target.col < state.width;
    const terrain = inBounds ? state.terrain[(0, types_1.positionIndex)(target, state.width)] : undefined;
    const hasMagic = action.move !== "NONE" && state.magics.some((magic) => (0, types_1.samePosition)(magic.position, target));
    const succeeded = character.alive && (action.move === "NONE" || (inBounds && terrain === "FLOOR" && !hasMagic));
    return {
        characterId: character.id,
        from: character.position,
        to: succeeded ? target : character.position,
        succeeded,
        action: succeeded ? action : { ...action, placeMagic: false },
    };
};
const resolveMovement = (state, actions) => {
    const movements = state.characters.map((character, index) => resolveOne(state, character, actions[index]));
    const characters = state.characters.map((character, index) => ({
        ...character,
        position: movements[index]?.to ?? character.position,
    }));
    return { state: { ...state, characters }, movements };
};
exports.resolveMovement = resolveMovement;

},{"./types":5}],
13:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateVersusOutcome = exports.evaluateCampaignOutcome = void 0;
const ruleset_1 = require("./ruleset");
const deathCount = (state, teamId) => state.characters.filter((character) => character.teamId === teamId && !character.alive).length;
const aliveCount = (state, teamId) => state.characters.filter((character) => character.teamId === teamId && character.alive).length;
const evaluateCampaignOutcome = (state) => {
    const clearedStages = state.clearedStages ?? 0;
    const playerAlive = aliveCount(state, 0);
    const enemyAlive = aliveCount(state, 1);
    const updatedClears = clearedStages;
    const stageCleared = playerAlive > enemyAlive && (deathCount(state, 0) > 0 || deathCount(state, 1) > 0);
    if (stageCleared) {
        const nextClears = clearedStages + 1;
        if (state.turn >= ruleset_1.RULESET_V2.campaignTurnLimit) {
            return { outcome: { kind: "CAMPAIGN_ENDED", reason: "TURN_LIMIT" }, clearedStages: nextClears, stageCleared: true };
        }
        return { outcome: { kind: "ONGOING" }, clearedStages: nextClears, stageCleared: true };
    }
    if (deathCount(state, 0) > 0 || deathCount(state, 1) > 0) {
        return { outcome: { kind: "CAMPAIGN_ENDED", reason: "PLAYER_DEFEATED" }, clearedStages, stageCleared: false };
    }
    if (state.turn >= ruleset_1.RULESET_V2.campaignTurnLimit) {
        return { outcome: { kind: "CAMPAIGN_ENDED", reason: "TURN_LIMIT" }, clearedStages: updatedClears, stageCleared };
    }
    return { outcome: { kind: "ONGOING" }, clearedStages: updatedClears, stageCleared };
};
exports.evaluateCampaignOutcome = evaluateCampaignOutcome;
const evaluateVersusOutcome = (state) => {
    const team0Deaths = deathCount(state, 0);
    const team1Deaths = deathCount(state, 1);
    if (team0Deaths !== 0 || team1Deaths !== 0) {
        if (team0Deaths === team1Deaths)
            return { kind: "VERSUS_ENDED", result: { kind: "DRAW" } };
        const teamId = team0Deaths < team1Deaths ? 0 : 1;
        return { kind: "VERSUS_ENDED", result: { kind: "WIN", teamId } };
    }
    return state.turn >= ruleset_1.RULESET_V2.versusTurnLimit
        ? { kind: "VERSUS_ENDED", result: { kind: "DRAW" } }
        : { kind: "ONGOING" };
};
exports.evaluateVersusOutcome = evaluateVersusOutcome;

},{"./ruleset":11}],
14:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.actionsForPlacement = exports.actionsForMovement = exports.selectGroupCaster = exports.normalizeTeamIntent = exports.teamCharacterIds = exports.InvalidTeamIntentError = void 0;
const types_1 = require("./types");
class InvalidTeamIntentError extends Error {
    constructor(message) {
        super(message);
        this.name = "InvalidTeamIntentError";
    }
}
exports.InvalidTeamIntentError = InvalidTeamIntentError;
const DIRECTIONS = new Set(["UP", "RIGHT", "DOWN", "LEFT", "NONE"]);
const FUSES = new Set(["EIGHT_TURNS", "INFINITE"]);
const teamCharacterIds = (teamId) => teamId === 0 ? [0, 1] : [2, 3];
exports.teamCharacterIds = teamCharacterIds;
const charactersForTeam = (state, teamId) => {
    const [firstId, secondId] = (0, exports.teamCharacterIds)(teamId);
    return [state.characters[firstId], state.characters[secondId]];
};
const assertAction = (action) => {
    if (action === undefined || !DIRECTIONS.has(action.move) || typeof action.placeMagic !== "boolean") {
        throw new InvalidTeamIntentError("invalid character action");
    }
    if (action.fuse !== undefined && !FUSES.has(action.fuse))
        throw new InvalidTeamIntentError("invalid magic fuse");
    return action.placeMagic
        ? { move: action.move, placeMagic: true, fuse: action.fuse ?? "EIGHT_TURNS" }
        : { move: action.move, placeMagic: false };
};
const directionToward = (moving, anchor) => {
    const rowDelta = anchor.position.row - moving.position.row;
    const colDelta = anchor.position.col - moving.position.col;
    if (Math.abs(rowDelta) + Math.abs(colDelta) !== 1) {
        throw new InvalidTeamIntentError("merge requires orthogonally adjacent characters");
    }
    if (rowDelta === -1)
        return "UP";
    if (rowDelta === 1)
        return "DOWN";
    if (colDelta === -1)
        return "LEFT";
    return "RIGHT";
};
const normalizeTeamIntent = (state, teamId, intent) => {
    const characterIds = (0, exports.teamCharacterIds)(teamId);
    const characters = charactersForTeam(state, teamId);
    if (intent === null || typeof intent !== "object")
        throw new InvalidTeamIntentError("intent must be an object");
    if (intent.kind === "individual") {
        if (!Array.isArray(intent.actions) || intent.actions.length !== 2) {
            throw new InvalidTeamIntentError("individual intent requires exactly two actions");
        }
        return {
            teamId,
            kind: "individual",
            characterIds,
            actions: [assertAction(intent.actions[0]), assertAction(intent.actions[1])],
            groupPlacementRequested: false,
            groupFuse: "EIGHT_TURNS",
        };
    }
    if (intent.kind === "group") {
        if (!DIRECTIONS.has(intent.move) || typeof intent.placeMagic !== "boolean" || (intent.fuse !== undefined && !FUSES.has(intent.fuse))) {
            throw new InvalidTeamIntentError("invalid group action");
        }
        if (!characters.every((character) => character.alive) || !(0, types_1.samePosition)(characters[0].position, characters[1].position)) {
            throw new InvalidTeamIntentError("group intent requires two living characters on the same cell");
        }
        const action = { move: intent.move, placeMagic: false };
        return {
            teamId,
            kind: "group",
            characterIds,
            actions: [action, action],
            groupPlacementRequested: intent.placeMagic,
            groupFuse: intent.fuse ?? "EIGHT_TURNS",
        };
    }
    if (intent.kind === "merge") {
        if (!characterIds.includes(intent.anchorId))
            throw new InvalidTeamIntentError("merge anchor does not belong to the team");
        if (!characters.every((character) => character.alive)) {
            throw new InvalidTeamIntentError("merge requires two living characters");
        }
        const anchorIndex = characterIds[0] === intent.anchorId ? 0 : 1;
        const movingIndex = anchorIndex === 0 ? 1 : 0;
        const movingDirection = directionToward(characters[movingIndex], characters[anchorIndex]);
        const actions = [
            { move: "NONE", placeMagic: false },
            { move: "NONE", placeMagic: false },
        ];
        actions[movingIndex] = { move: movingDirection, placeMagic: false };
        return { teamId, kind: "merge", characterIds, actions, groupPlacementRequested: false, groupFuse: "EIGHT_TURNS" };
    }
    throw new InvalidTeamIntentError("unknown team intent kind");
};
exports.normalizeTeamIntent = normalizeTeamIntent;
const selectGroupCaster = (characters, magics) => {
    const ranked = characters
        .map((character) => ({
        character,
        remaining: character.capacity - magics.filter((magic) => magic.ownerId === character.id).length,
    }))
        .filter(({ character, remaining }) => character.alive && remaining > 0)
        .sort((left, right) => right.remaining - left.remaining ||
        right.character.power - left.character.power ||
        left.character.id - right.character.id);
    return ranked[0]?.character.id ?? null;
};
exports.selectGroupCaster = selectGroupCaster;
const actionsForMovement = (normalized) => [
    normalized[0].actions[0],
    normalized[0].actions[1],
    normalized[1].actions[0],
    normalized[1].actions[1],
];
exports.actionsForMovement = actionsForMovement;
const actionsForPlacement = (stateAfterCollection, normalized, movements) => {
    const actions = movements.map((movement) => ({ ...movement.action }));
    for (const teamIntent of normalized) {
        if (teamIntent.kind !== "group")
            continue;
        const [firstId, secondId] = teamIntent.characterIds;
        actions[firstId] = { ...actions[firstId], placeMagic: false };
        actions[secondId] = { ...actions[secondId], placeMagic: false };
        if (!teamIntent.groupPlacementRequested)
            continue;
        const caster = (0, exports.selectGroupCaster)([stateAfterCollection.characters[firstId], stateAfterCollection.characters[secondId]], stateAfterCollection.magics);
        if (caster !== null)
            actions[caster] = {
                ...actions[caster],
                placeMagic: true,
                fuse: teamIntent.groupFuse,
            };
    }
    return actions;
};
exports.actionsForPlacement = actionsForPlacement;

},{"./types":5}],
15:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialState = void 0;
const map_1 = require("./map");
const rng_1 = require("./rng");
const ruleset_1 = require("./ruleset");
const character = (id) => ({
    id,
    teamId: id < 2 ? 0 : 1,
    position: id < 2 ? map_1.START_A : map_1.START_B,
    power: 2,
    capacity: 1,
    alive: true,
});
const createInitialState = (mode, seed) => {
    const map = (0, map_1.generateMap)(seed);
    const common = {
        schemaVersion: ruleset_1.SCHEMA_VERSION,
        rulesetId: ruleset_1.RULESET_V2.id,
        mode,
        turn: 0,
        width: map.width,
        height: map.height,
        terrain: map.terrain,
        hiddenItems: map.hiddenItems,
        visibleItems: map.visibleItems,
        characters: [character(0), character(1), character(2), character(3)],
        magics: [],
        nextMagicId: 1,
        lastBlastCells: [],
        rngStates: {
            map: map.rngState,
            items: (0, rng_1.deriveSeed)(seed, "items"),
            ai: [(0, rng_1.deriveSeed)(seed, "ai:0"), (0, rng_1.deriveSeed)(seed, "ai:1")],
        },
        outcome: { kind: "ONGOING" },
    };
    return mode === "CAMPAIGN"
        ? { ...common, clearedStages: 0, stageStartTurn: 0, stageSeed: (0, rng_1.normalizeSeed)(seed) }
        : common;
};
exports.createInitialState = createInitialState;

},{"./map":16,"./rng":7,"./ruleset":11}],
16:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateMap = exports.validateGeneratedMap = exports.START_PROTECTED = exports.START_B = exports.START_A = void 0;
const rng_1 = require("./rng");
const ruleset_1 = require("./ruleset");
const types_1 = require("./types");
const CENTER = { row: 5, col: 5 };
const POWER_ITEM_PAIRS = 4;
const CAPACITY_ITEM_PAIRS = 4;
exports.START_A = Object.freeze({ row: 1, col: 1 });
exports.START_B = Object.freeze({ row: 9, col: 9 });
exports.START_PROTECTED = Object.freeze([
    exports.START_A,
    { row: 1, col: 2 },
    { row: 2, col: 1 },
    exports.START_B,
    { row: 9, col: 8 },
    { row: 8, col: 9 },
]);
const rotate = (position) => ({
    row: ruleset_1.RULESET_V2.height - 1 - position.row,
    col: ruleset_1.RULESET_V2.width - 1 - position.col,
});
const keyOf = (position) => `${position.row},${position.col}`;
const protectedKeys = new Set(exports.START_PROTECTED.map(keyOf));
const baseTerrain = () => {
    const terrain = [];
    for (let row = 0; row < ruleset_1.RULESET_V2.height; row += 1) {
        for (let col = 0; col < ruleset_1.RULESET_V2.width; col += 1) {
            const outer = row === 0 || col === 0 || row === ruleset_1.RULESET_V2.height - 1 || col === ruleset_1.RULESET_V2.width - 1;
            const fixedInnerHard = row % 2 === 0 && col % 2 === 0;
            terrain.push(outer || fixedInnerHard ? "HARD" : "FLOOR");
        }
    }
    return terrain;
};
const eligiblePairs = () => {
    const terrain = baseTerrain();
    const pairs = [];
    for (let row = 1; row < ruleset_1.RULESET_V2.height - 1; row += 1) {
        for (let col = 1; col < ruleset_1.RULESET_V2.width - 1; col += 1) {
            const position = { row, col };
            const opposite = rotate(position);
            if (terrain[(0, types_1.positionIndex)(position, ruleset_1.RULESET_V2.width)] !== "FLOOR" ||
                (row === CENTER.row && col === CENTER.col) ||
                protectedKeys.has(keyOf(position)) ||
                protectedKeys.has(keyOf(opposite)) ||
                (0, types_1.positionIndex)(position, ruleset_1.RULESET_V2.width) > (0, types_1.positionIndex)(opposite, ruleset_1.RULESET_V2.width)) {
                continue;
            }
            pairs.push([position, opposite]);
        }
    }
    return pairs;
};
const PAIRS = eligiblePairs();
const shuffledIndexes = (rng) => {
    const indexes = PAIRS.map((_, index) => index);
    for (let index = indexes.length - 1; index > 0; index -= 1) {
        const other = rng.nextInt(index + 1);
        const value = indexes[index];
        indexes[index] = indexes[other];
        indexes[other] = value;
    }
    return indexes;
};
const validSelection = (indexes) => {
    const selected = indexes.slice(0, 12);
    return selected.length === 12 &&
        new Set(selected).size === 12 &&
        selected.every((index) => Number.isInteger(index) && index >= 0 && index < PAIRS.length);
};
const buildFromSelection = (indexes, centerItem, rngState, usedFallback) => {
    const terrain = baseTerrain();
    const hiddenItems = Array.from({ length: terrain.length }, () => null);
    const visibleItems = Array.from({ length: terrain.length }, () => null);
    indexes.slice(0, 12).forEach((pairIndex, index) => {
        const pair = PAIRS[pairIndex];
        if (pair === undefined)
            return;
        const item = index < POWER_ITEM_PAIRS
            ? "POWER"
            : index < POWER_ITEM_PAIRS + CAPACITY_ITEM_PAIRS
                ? "CAPACITY"
                : null;
        for (const position of pair) {
            const cell = (0, types_1.positionIndex)(position, ruleset_1.RULESET_V2.width);
            terrain[cell] = "SOFT";
            hiddenItems[cell] = item;
        }
    });
    const centerIndex = (0, types_1.positionIndex)(CENTER, ruleset_1.RULESET_V2.width);
    terrain[centerIndex] = "SOFT";
    hiddenItems[centerIndex] = centerItem;
    return {
        width: ruleset_1.RULESET_V2.width,
        height: ruleset_1.RULESET_V2.height,
        terrain,
        hiddenItems,
        visibleItems,
        rngState,
        usedFallback,
    };
};
const validateGeneratedMap = (map) => {
    const errors = [];
    const expectedSize = ruleset_1.RULESET_V2.width * ruleset_1.RULESET_V2.height;
    if (map.width !== ruleset_1.RULESET_V2.width || map.height !== ruleset_1.RULESET_V2.height)
        errors.push("invalid dimensions");
    if (map.terrain.length !== expectedSize || map.hiddenItems.length !== expectedSize || map.visibleItems.length !== expectedSize) {
        errors.push("invalid layer size");
        return errors;
    }
    let softCount = 0;
    let powerItemCount = 0;
    let capacityItemCount = 0;
    for (let row = 0; row < ruleset_1.RULESET_V2.height; row += 1) {
        for (let col = 0; col < ruleset_1.RULESET_V2.width; col += 1) {
            const position = { row, col };
            const cell = (0, types_1.positionIndex)(position, ruleset_1.RULESET_V2.width);
            const opposite = (0, types_1.positionIndex)(rotate(position), ruleset_1.RULESET_V2.width);
            const terrain = map.terrain[cell];
            const outer = row === 0 || col === 0 || row === ruleset_1.RULESET_V2.height - 1 || col === ruleset_1.RULESET_V2.width - 1;
            const fixedInnerHard = !outer && row % 2 === 0 && col % 2 === 0;
            if ((outer || fixedInnerHard) && terrain !== "HARD")
                errors.push(`required hard cell ${row},${col}`);
            if (protectedKeys.has(keyOf(position)) && terrain !== "FLOOR")
                errors.push(`protected cell ${row},${col}`);
            if (terrain === "SOFT") {
                softCount += 1;
                if (map.hiddenItems[cell] === "POWER")
                    powerItemCount += 1;
                if (map.hiddenItems[cell] === "CAPACITY")
                    capacityItemCount += 1;
            }
            else if (map.hiddenItems[cell] !== null) {
                errors.push(`hidden item outside soft ${row},${col}`);
            }
            if (terrain !== map.terrain[opposite] || map.hiddenItems[cell] !== map.hiddenItems[opposite]) {
                errors.push(`rotation mismatch ${row},${col}`);
            }
        }
    }
    if (softCount !== 25)
        errors.push(`expected 25 soft cells, got ${softCount}`);
    if (powerItemCount < 8 || powerItemCount > 9)
        errors.push(`expected 8 or 9 power items, got ${powerItemCount}`);
    if (capacityItemCount < 8 || capacityItemCount > 9)
        errors.push(`expected 8 or 9 capacity items, got ${capacityItemCount}`);
    if (powerItemCount + capacityItemCount > 17)
        errors.push("only the center cell may break paired item counts");
    return errors;
};
exports.validateGeneratedMap = validateGeneratedMap;
const generateMap = (seed, options = {}) => {
    const rng = new rng_1.Xorshift32((0, rng_1.deriveSeed)(seed, "map"));
    const selected = options.pairOrder ?? shuffledIndexes(rng);
    const centerRoll = rng.nextInt(3);
    const centerItem = centerRoll === 0 ? "POWER" : centerRoll === 1 ? "CAPACITY" : null;
    const generated = validSelection(selected)
        ? buildFromSelection(selected, centerItem, rng.state(), false)
        : buildFromSelection(PAIRS.map((_, index) => index), centerItem, rng.state(), true);
    if ((0, exports.validateGeneratedMap)(generated).length === 0)
        return generated;
    const fallback = buildFromSelection(PAIRS.map((_, index) => index), centerItem, rng.state(), true);
    const fallbackErrors = (0, exports.validateGeneratedMap)(fallback);
    if (fallbackErrors.length > 0)
        throw new Error(`invalid fallback map: ${fallbackErrors.join("; ")}`);
    return fallback;
};
exports.generateMap = generateMap;

},{"./rng":7,"./ruleset":11,"./types":5}],
17:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

},{}],
18:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateGameState = void 0;
const types_1 = require("./types");
const validateGameState = (state) => {
    const errors = [];
    if (!Number.isSafeInteger(state.width) || !Number.isSafeInteger(state.height) || state.width <= 0 || state.height <= 0) {
        return ["board dimensions must be positive safe integers"];
    }
    const size = state.width * state.height;
    if (state.terrain.length !== size)
        errors.push("terrain layer size mismatch");
    if (state.hiddenItems.length !== size)
        errors.push("hidden item layer size mismatch");
    if (state.visibleItems.length !== size)
        errors.push("visible item layer size mismatch");
    if (!Number.isSafeInteger(state.turn) || state.turn < 0)
        errors.push("turn must be a non-negative safe integer");
    const characterIds = new Set();
    for (const character of state.characters) {
        if (characterIds.has(character.id))
            errors.push(`duplicate character id ${character.id}`);
        characterIds.add(character.id);
        if (character.teamId !== (character.id < 2 ? 0 : 1))
            errors.push(`invalid team for character ${character.id}`);
        const { row, col } = character.position;
        if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= state.height || col >= state.width) {
            errors.push(`character ${character.id} is outside the board`);
        }
        else if (state.terrain[(0, types_1.positionIndex)(character.position, state.width)] !== "FLOOR") {
            errors.push(`character ${character.id} is not on floor`);
        }
        if (!Number.isSafeInteger(character.power) || character.power < 0)
            errors.push(`invalid power for character ${character.id}`);
        if (!Number.isSafeInteger(character.capacity) || character.capacity < 0)
            errors.push(`invalid capacity for character ${character.id}`);
    }
    const magicIds = new Set();
    for (const magic of state.magics) {
        if (magicIds.has(magic.id))
            errors.push(`duplicate magic id ${magic.id}`);
        magicIds.add(magic.id);
        const { row, col } = magic.position;
        if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= state.height || col >= state.width) {
            errors.push(`magic ${magic.id} is outside the board`);
        }
        else if (state.terrain[(0, types_1.positionIndex)(magic.position, state.width)] !== "FLOOR") {
            errors.push(`magic ${magic.id} is not on floor`);
        }
        if (!Number.isSafeInteger(magic.power) || magic.power < 0)
            errors.push(`invalid power for magic ${magic.id}`);
        if (!Number.isSafeInteger(magic.placedTurn) || magic.placedTurn < 0)
            errors.push(`invalid placed turn for magic ${magic.id}`);
        if (magic.detonateTurn !== null && (!Number.isSafeInteger(magic.detonateTurn) || magic.detonateTurn < magic.placedTurn)) {
            errors.push(`invalid detonation turn for magic ${magic.id}`);
        }
    }
    return errors;
};
exports.validateGameState = validateGameState;

},{"./types":5}],
19:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStageProfileNumber = exports.getStageSeriesName = exports.getStageName = exports.STAGE_DEFINITIONS = void 0;
/** Reorder this array to change the campaign and displayed stage order. */
exports.STAGE_DEFINITIONS = Object.freeze([
    { profileStage: 1, name: "ドルトータスLv1", series: "base" },
    { profileStage: 2, name: "ドルトータスLv2", series: "base" },
    { profileStage: 3, name: "イチマジカ", series: "onebomb" },
    { profileStage: 4, name: "レンヴォルLv1", series: "search" },
    { profileStage: 5, name: "レンヴォルLv2", series: "search" },
    { profileStage: 6, name: "レンヴォルLv3", series: "search" },
    { profileStage: 8, name: "クランベル", series: "sides" },
    { profileStage: 9, name: "エンヴェイルLv1", series: "plan" },
    { profileStage: 10, name: "エンヴェイルLv2", series: "plan" },
    { profileStage: 7, name: "ノクティリア", series: "likehuman" }, // 圧迫攻撃
]);
const definitionAt = (stage) => {
    if (!Number.isInteger(stage) || stage < 1 || stage > exports.STAGE_DEFINITIONS.length)
        throw new RangeError("stage must be from 1 to 10");
    return exports.STAGE_DEFINITIONS[stage - 1];
};
const getStageName = (stage) => definitionAt(stage).name;
exports.getStageName = getStageName;
const getStageSeriesName = (stage) => definitionAt(stage).series;
exports.getStageSeriesName = getStageSeriesName;
const getStageProfileNumber = (stage) => definitionAt(stage).profileStage;
exports.getStageProfileNumber = getStageProfileNumber;

},{}],
20:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTestState = void 0;
const ruleset_1 = require("./ruleset");
/** Builds a deliberately non-product-sized board for local rule tests only. */
const buildTestState = (spec) => {
    if (spec.rows.length === 0 || spec.rows[0]?.length === 0 || spec.rows.some((row) => row.length !== spec.rows[0]?.length)) {
        throw new Error("test rows must form a non-empty rectangle");
    }
    const terrain = [];
    const hiddenItems = [];
    const visibleItems = [];
    for (const row of spec.rows) {
        for (const symbol of row) {
            if (!".#+pcPC".includes(symbol))
                throw new Error(`unsupported test cell: ${symbol}`);
            terrain.push(symbol === "#" ? "HARD" : "+PC".includes(symbol) ? "SOFT" : "FLOOR");
            hiddenItems.push(symbol === "P" ? "POWER" : symbol === "C" ? "CAPACITY" : null);
            visibleItems.push(symbol === "p" ? "POWER" : symbol === "c" ? "CAPACITY" : null);
        }
    }
    return {
        schemaVersion: ruleset_1.SCHEMA_VERSION,
        rulesetId: "test-only",
        mode: "VERSUS",
        turn: 0,
        width: spec.rows[0]?.length,
        height: spec.rows.length,
        terrain,
        hiddenItems,
        visibleItems,
        characters: spec.characters.map((character) => ({ ...character, position: { ...character.position } })),
        magics: spec.magics ?? [],
        nextMagicId: 1,
        lastBlastCells: [],
        rngStates: { map: 1, items: 1, ai: [1, 1] },
        outcome: { kind: "ONGOING" },
    };
};
exports.buildTestState = buildTestState;

},{"./ruleset":11}],
21:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDangerMap = exports.consumeNode = void 0;
const engine_1 = require("@voldecade/engine");
const consumeNode = (budget) => {
    if (budget.used >= budget.limit)
        return false;
    budget.used += 1;
    return true;
};
exports.consumeNode = consumeNode;
/** Zero means no known danger within the requested horizon; other values are absolute turns. */
const buildDangerMap = (observation, horizon, budget) => {
    const danger = Array.from({ length: observation.width * observation.height }, () => 0);
    const terrain = [...observation.terrain];
    let magics = observation.magics.map((magic) => ({ ...magic }));
    for (let turn = observation.turn + 1; turn <= observation.turn + horizon && budget.used < budget.limit; turn += 1) {
        if (!magics.some((magic) => magic.detonateTurn !== null && magic.detonateTurn <= turn))
            continue;
        if (!(0, exports.consumeNode)(budget))
            break;
        const closure = (0, engine_1.collectBlastClosure)(terrain, observation.width, observation.height, magics, turn);
        for (const position of closure.blastCells) {
            if (!(0, exports.consumeNode)(budget))
                break;
            const cell = (0, engine_1.positionIndex)(position, observation.width);
            if (danger[cell] === 0)
                danger[cell] = turn;
        }
        for (const position of closure.destroyedSoftCells)
            terrain[(0, engine_1.positionIndex)(position, observation.width)] = "FLOOR";
        const triggered = new Set(closure.triggeredMagicIds);
        magics = magics.filter((magic) => !triggered.has(magic.id));
    }
    return danger;
};
exports.buildDangerMap = buildDangerMap;

},{"@voldecade/engine":3}],
22:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decideTeam = exports.hasEscapeFromPlacement = exports.countReachableSafeCells = exports.legalActionsForCharacter = void 0;
const engine_1 = require("@voldecade/engine");
const bitboard_survival_1 = require("./bitboard-survival");
const danger_1 = require("./danger");
const stage_ten_1 = require("./stage-ten");
const stage_nine_1 = require("./stage-nine");
const stage_eight_1 = require("./stage-eight");
const stage_seven_1 = require("./stage-seven");
const DIRECTIONS = ["NONE", "UP", "RIGHT", "DOWN", "LEFT"];
const DELTA = {
    NONE: { row: 0, col: 0 },
    UP: { row: -1, col: 0 },
    RIGHT: { row: 0, col: 1 },
    DOWN: { row: 1, col: 0 },
    LEFT: { row: 0, col: -1 },
};
const targetFor = (character, move) => ({
    row: character.position.row + DELTA[move].row,
    col: character.position.col + DELTA[move].col,
});
const isPassable = (observation, character, move) => {
    if (move === "NONE")
        return true;
    const target = targetFor(character, move);
    if (target.row < 0 || target.col < 0 || target.row >= observation.height || target.col >= observation.width)
        return false;
    if (observation.terrain[(0, engine_1.positionIndex)(target, observation.width)] !== "FLOOR")
        return false;
    return !observation.magics.some((magic) => magic.position.row === target.row && magic.position.col === target.col);
};
const remainingCapacity = (observation, character) => character.capacity - observation.magics.filter((magic) => magic.ownerId === character.id).length;
const legalActionsForCharacter = (observation, character) => {
    const actions = [];
    for (const move of DIRECTIONS) {
        if (!isPassable(observation, character, move))
            continue;
        actions.push({ move, placeMagic: false });
        if (remainingCapacity(observation, character) > 0)
            actions.push({ move, placeMagic: true });
    }
    return actions;
};
exports.legalActionsForCharacter = legalActionsForCharacter;
const movementOnlyActions = (observation, character, includeStop) => {
    const actions = (0, exports.legalActionsForCharacter)(observation, character)
        .filter((action) => !action.placeMagic && (includeStop || action.move !== "NONE"));
    return actions.length > 0 ? actions : [{ move: "NONE", placeMagic: false }];
};
const randomMovementPair = (observation, characters, rngState) => {
    let rng = rngState;
    const actions = characters.map((character) => {
        rng = (0, engine_1.nextXorshift32)(rng);
        const legal = movementOnlyActions(observation, character, false);
        return legal[rng % legal.length];
    });
    return { actions, nextRngState: rng };
};
const blastIndexesForMagic = (observation, magic) => {
    const closure = (0, engine_1.collectBlastClosure)(observation.terrain, observation.width, observation.height, [{ ...magic, detonateTurn: observation.turn }], observation.turn);
    return new Set(closure.blastCells.map((position) => (0, engine_1.positionIndex)(position, observation.width)));
};
const stageTwoAction = (observation, character, rngState, budget) => {
    const nextRngState = (0, engine_1.nextXorshift32)(rngState);
    if (observation.magics.length === 0) {
        const legal = movementOnlyActions(observation, character, false);
        return { action: legal[nextRngState % legal.length], nextRngState };
    }
    const hazards = observation.magics
        .map((magic) => ({ magic, blast: blastIndexesForMagic(observation, magic) }))
        .filter(({ blast }) => blast.has((0, engine_1.positionIndex)(character.position, observation.width)))
        .sort((left, right) => manhattan(character.position, left.magic.position) - manhattan(character.position, right.magic.position) || left.magic.id - right.magic.id);
    const closest = hazards[0];
    if (closest === undefined)
        return { action: { move: "NONE", placeMagic: false }, nextRngState };
    const legal = movementOnlyActions(observation, character, false);
    const scored = legal.map((action) => {
        (0, danger_1.consumeNode)(budget);
        const target = targetFor(character, action.move);
        return {
            action,
            escaped: !closest.blast.has((0, engine_1.positionIndex)(target, observation.width)),
            distance: manhattan(target, closest.magic.position),
        };
    });
    const escaped = scored.filter((candidate) => candidate.escaped);
    const choices = escaped.length > 0 ? escaped : scored.filter((candidate) => candidate.distance === Math.max(...scored.map((entry) => entry.distance)));
    return { action: (choices[nextRngState % choices.length]?.action ?? { move: "NONE", placeMagic: false }), nextRngState };
};
const stageThreeEscapeAction = (observation, character, rngState, budget) => {
    const nextRngState = (0, engine_1.nextXorshift32)(rngState);
    const hazards = observation.magics
        .map((magic) => ({ magic, blast: blastIndexesForMagic(observation, magic) }))
        .filter(({ blast }) => blast.has((0, engine_1.positionIndex)(character.position, observation.width)))
        .sort((left, right) => manhattan(character.position, left.magic.position) - manhattan(character.position, right.magic.position) || left.magic.id - right.magic.id);
    const closest = hazards[0];
    if (closest === undefined)
        return { action: { move: "NONE", placeMagic: false }, nextRngState };
    const startIndex = (0, engine_1.positionIndex)(character.position, observation.width);
    const visited = new Set([startIndex]);
    const queue = [];
    for (const move of DIRECTIONS.slice(1)) {
        if (!isPassable(observation, character, move))
            continue;
        const target = targetFor(character, move);
        visited.add((0, engine_1.positionIndex)(target, observation.width));
        queue.push({ position: target, distance: 1, firstMove: move });
    }
    let shortestDistance = Number.POSITIVE_INFINITY;
    const shortestMoves = [];
    while (queue.length > 0 && budget.used < budget.limit) {
        const current = queue.shift();
        if (current === undefined || current.distance > shortestDistance || !(0, danger_1.consumeNode)(budget))
            continue;
        if (!closest.blast.has((0, engine_1.positionIndex)(current.position, observation.width))) {
            shortestDistance = current.distance;
            if (!shortestMoves.includes(current.firstMove))
                shortestMoves.push(current.firstMove);
            continue;
        }
        for (const move of DIRECTIONS.slice(1)) {
            const target = {
                row: current.position.row + DELTA[move].row,
                col: current.position.col + DELTA[move].col,
            };
            if (target.row < 0 || target.col < 0 || target.row >= observation.height || target.col >= observation.width)
                continue;
            const targetIndex = (0, engine_1.positionIndex)(target, observation.width);
            if (visited.has(targetIndex) || observation.terrain[targetIndex] !== "FLOOR")
                continue;
            if (observation.magics.some((magic) => magic.position.row === target.row && magic.position.col === target.col))
                continue;
            visited.add(targetIndex);
            queue.push({ position: target, distance: current.distance + 1, firstMove: current.firstMove });
        }
    }
    if (shortestMoves.length > 0) {
        return {
            action: { move: shortestMoves[nextRngState % shortestMoves.length], placeMagic: false },
            nextRngState,
        };
    }
    return stageTwoAction(observation, character, rngState, budget);
};
const floorComponent = (observation, start, budget) => {
    const startIndex = (0, engine_1.positionIndex)(start, observation.width);
    const visited = new Set([startIndex]);
    const queue = [start];
    while (queue.length > 0 && budget.used < budget.limit) {
        const current = queue.shift();
        if (current === undefined || !(0, danger_1.consumeNode)(budget))
            continue;
        for (const move of DIRECTIONS.slice(1)) {
            const target = {
                row: current.row + DELTA[move].row,
                col: current.col + DELTA[move].col,
            };
            if (target.row < 0 || target.col < 0 || target.row >= observation.height || target.col >= observation.width)
                continue;
            const targetIndex = (0, engine_1.positionIndex)(target, observation.width);
            if (visited.has(targetIndex) || observation.terrain[targetIndex] !== "FLOOR")
                continue;
            visited.add(targetIndex);
            queue.push(target);
        }
    }
    return visited;
};
const hypotheticalBlast = (observation, position, power) => (0, engine_1.collectBlastClosure)(observation.terrain, observation.width, observation.height, [{
        id: Number.MAX_SAFE_INTEGER,
        ownerId: (0, engine_1.teamCharacterIds)(observation.teamId)[0],
        position,
        power,
        placedTurn: observation.turn + 1,
        detonateTurn: observation.turn + 1 + engine_1.RULESET_V2.fuseTurns,
    }], observation.turn + 1 + engine_1.RULESET_V2.fuseTurns);
const canEscapeBlastBeforeActivation = (observation, start, blastCells, budget) => {
    const blast = new Set(blastCells.map((position) => (0, engine_1.positionIndex)(position, observation.width)));
    const startIndex = (0, engine_1.positionIndex)(start, observation.width);
    const visited = new Set([startIndex]);
    const queue = [{ position: start, distance: 0 }];
    while (queue.length > 0 && budget.used < budget.limit) {
        const current = queue.shift();
        if (current === undefined || !(0, danger_1.consumeNode)(budget))
            continue;
        if (!blast.has((0, engine_1.positionIndex)(current.position, observation.width)))
            return current.distance < engine_1.RULESET_V2.fuseTurns;
        if (current.distance + 1 >= engine_1.RULESET_V2.fuseTurns)
            continue;
        for (const move of DIRECTIONS.slice(1)) {
            const target = {
                row: current.position.row + DELTA[move].row,
                col: current.position.col + DELTA[move].col,
            };
            if (target.row < 0 || target.col < 0 || target.row >= observation.height || target.col >= observation.width)
                continue;
            const targetIndex = (0, engine_1.positionIndex)(target, observation.width);
            if (visited.has(targetIndex) || observation.terrain[targetIndex] !== "FLOOR")
                continue;
            if (observation.magics.some((magic) => magic.position.row === target.row && magic.position.col === target.col))
                continue;
            visited.add(targetIndex);
            queue.push({ position: target, distance: current.distance + 1 });
        }
    }
    return false;
};
const decideStageThree = (observation, profile, rngState) => {
    const nextRngState = (0, engine_1.nextXorshift32)(rngState);
    const budget = { limit: profile.maxNodes, used: 0 };
    const [firstId, secondId] = (0, engine_1.teamCharacterIds)(observation.teamId);
    const characters = [observation.characters[firstId], observation.characters[secondId]];
    const position = characters[0].position;
    const component = floorComponent(observation, position, budget);
    const componentHasMagic = observation.magics.some((magic) => component.has((0, engine_1.positionIndex)(magic.position, observation.width)));
    if (componentHasMagic) {
        const escape = stageThreeEscapeAction(observation, characters[0], rngState, budget);
        return {
            intent: { kind: "group", move: escape.action.move, placeMagic: false },
            nextRngState: escape.nextRngState,
            nodesVisited: budget.used,
            profileStage: profile.stage,
        };
    }
    const casterId = (0, engine_1.selectGroupCaster)(characters, observation.magics);
    const caster = casterId === null ? null : observation.characters[casterId];
    const blast = hypotheticalBlast(observation, position, caster?.power ?? characters[0].power);
    const blastIndexes = new Set(blast.blastCells.map((cell) => (0, engine_1.positionIndex)(cell, observation.width)));
    const includesTarget = blast.destroyedSoftCells.length > 0 || observation.characters.some((character) => character.teamId !== observation.teamId &&
        character.alive &&
        blastIndexes.has((0, engine_1.positionIndex)(character.position, observation.width)));
    const placeMagic = caster !== null && includesTarget && canEscapeBlastBeforeActivation(observation, position, blast.blastCells, budget);
    if (placeMagic) {
        return {
            intent: { kind: "group", move: "NONE", placeMagic: true, fuse: "EIGHT_TURNS" },
            nextRngState,
            nodesVisited: budget.used,
            profileStage: profile.stage,
        };
    }
    const legal = movementOnlyActions(observation, characters[0], false);
    return {
        intent: { kind: "group", move: legal[nextRngState % legal.length].move, placeMagic: false },
        nextRngState,
        nodesVisited: budget.used,
        profileStage: profile.stage,
    };
};
const observationAfterStageFourCandidate = (observation, candidate) => {
    const [firstId, secondId] = (0, engine_1.teamCharacterIds)(observation.teamId);
    const currentCharacters = [observation.characters[firstId], observation.characters[secondId]];
    if (!currentCharacters.every((character) => character.alive && isPassable(observation, character, candidate.move)))
        return null;
    const target = targetFor(currentCharacters[0], candidate.move);
    const targetCell = (0, engine_1.positionIndex)(target, observation.width);
    const collectedItem = observation.visibleItems[targetCell] ?? null;
    const characters = observation.characters.map((character) => {
        if (character.teamId !== observation.teamId)
            return character;
        const moved = { ...character, position: { ...target } };
        if (collectedItem === "POWER")
            return { ...moved, power: moved.power + 1 };
        if (collectedItem === "CAPACITY")
            return { ...moved, capacity: moved.capacity + 1 };
        return moved;
    });
    const movedCharacters = [characters[firstId], characters[secondId]];
    let magics = observation.magics.map((magic) => ({ ...magic, position: { ...magic.position } }));
    if (candidate.placeMagic) {
        const casterId = (0, engine_1.selectGroupCaster)(movedCharacters, magics);
        if (casterId === null)
            return null;
        const caster = characters[casterId];
        magics.push({
            id: Math.max(0, ...magics.map((magic) => magic.id)) + 1,
            ownerId: casterId,
            position: { ...target },
            power: caster.power,
            placedTurn: observation.turn + 1,
            detonateTurn: observation.turn + 1 + engine_1.RULESET_V2.fuseTurns,
        });
    }
    const turn = observation.turn + 1;
    const terrain = [...observation.terrain];
    if (magics.some((magic) => magic.detonateTurn !== null && magic.detonateTurn <= turn)) {
        const closure = (0, engine_1.collectBlastClosure)(terrain, observation.width, observation.height, magics, turn);
        const blast = new Set(closure.blastCells.map((position) => (0, engine_1.positionIndex)(position, observation.width)));
        if (blast.has(targetCell))
            return null;
        for (const position of closure.destroyedSoftCells)
            terrain[(0, engine_1.positionIndex)(position, observation.width)] = "FLOOR";
        const triggered = new Set(closure.triggeredMagicIds);
        magics = magics.filter((magic) => !triggered.has(magic.id));
    }
    const visibleItems = [...observation.visibleItems];
    if (collectedItem !== null)
        visibleItems[targetCell] = null;
    return { ...observation, turn, terrain, visibleItems, characters, magics };
};
const chooseUniformly = (values, rngState) => {
    if (values.length === 0)
        throw new Error("cannot choose from an empty list");
    const randomRange = 0x100000000;
    const acceptedRange = Math.floor(randomRange / values.length) * values.length;
    let nextRngState = rngState;
    do {
        nextRngState = (0, engine_1.nextXorshift32)(nextRngState);
    } while (nextRngState >= acceptedRange);
    return { value: values[nextRngState % values.length], nextRngState };
};
const decideStageFour = (observation, profile, rngState) => {
    const [firstId, secondId] = (0, engine_1.teamCharacterIds)(observation.teamId);
    const characters = [observation.characters[firstId], observation.characters[secondId]];
    const candidates = [];
    for (const move of DIRECTIONS) {
        if (!characters.every((character) => isPassable(observation, character, move)))
            continue;
        candidates.push({ move, placeMagic: false });
        const target = targetFor(characters[0], move);
        const collectsCapacity = observation.visibleItems[(0, engine_1.positionIndex)(target, observation.width)] === "CAPACITY";
        if ((0, engine_1.selectGroupCaster)(characters, observation.magics) !== null || collectsCapacity)
            candidates.push({ move, placeMagic: true });
    }
    const safe = candidates.filter((candidate) => {
        const nextObservation = observationAfterStageFourCandidate(observation, candidate);
        return nextObservation !== null && (0, bitboard_survival_1.canTeamSurviveForTurnsBitboard)(nextObservation, 8);
    });
    const choice = chooseUniformly(safe.length > 0 ? safe : candidates, rngState);
    return {
        intent: {
            kind: "group",
            move: choice.value.move,
            placeMagic: choice.value.placeMagic,
            ...(choice.value.placeMagic ? { fuse: "EIGHT_TURNS" } : {}),
        },
        nextRngState: choice.nextRngState,
        nodesVisited: candidates.length * 8,
        profileStage: profile.stage,
    };
};
const stageSixActionsForCharacter = (observation, character) => {
    if (!character.alive)
        return [{ move: "NONE", placeMagic: false }];
    const actions = [];
    for (const move of DIRECTIONS) {
        if (!isPassable(observation, character, move))
            continue;
        actions.push({ move, placeMagic: false });
        const target = targetFor(character, move);
        const collectsCapacity = observation.visibleItems[(0, engine_1.positionIndex)(target, observation.width)] === "CAPACITY";
        if (remainingCapacity(observation, character) > 0 || collectsCapacity) {
            actions.push({ move, placeMagic: true, fuse: "EIGHT_TURNS" });
        }
    }
    return actions;
};
const stageSixTeamCandidates = (observation, teamId) => {
    const [firstId, secondId] = (0, engine_1.teamCharacterIds)(teamId);
    const firstActions = stageSixActionsForCharacter(observation, observation.characters[firstId]);
    const secondActions = stageSixActionsForCharacter(observation, observation.characters[secondId]);
    const candidates = [];
    for (const first of firstActions)
        for (const second of secondActions)
            candidates.push([first, second]);
    return candidates;
};
const observationAfterMinimaxActions = (observation, friendlyIntent, enemyIntent) => {
    const state = {
        schemaVersion: engine_1.SCHEMA_VERSION,
        rulesetId: engine_1.RULESET_V2.id,
        mode: "VERSUS",
        turn: observation.turn,
        width: observation.width,
        height: observation.height,
        terrain: observation.terrain,
        hiddenItems: observation.blockItems,
        visibleItems: observation.visibleItems,
        characters: observation.characters,
        magics: observation.magics,
        nextMagicId: Math.max(0, ...observation.magics.map((magic) => magic.id)) + 1,
        lastBlastCells: [],
        rngStates: { map: 1, items: 1, ai: [1, 1] },
        outcome: { kind: "ONGOING" },
    };
    const intents = observation.teamId === 0
        ? [friendlyIntent, enemyIntent]
        : [enemyIntent, friendlyIntent];
    const next = (0, engine_1.resolveTurn)(state, intents).state;
    return {
        teamId: observation.teamId,
        turn: next.turn,
        width: next.width,
        height: next.height,
        terrain: next.terrain,
        blockItems: next.hiddenItems,
        visibleItems: next.visibleItems,
        characters: next.characters,
        magics: next.magics,
    };
};
const deadCount = (survival) => Number(!survival[0]) + Number(!survival[1]);
const stageFiveTeamCandidates = (observation, teamId) => {
    const [firstId, secondId] = (0, engine_1.teamCharacterIds)(teamId);
    const characters = [observation.characters[firstId], observation.characters[secondId]];
    const candidates = [];
    for (const move of DIRECTIONS) {
        if (!characters.every((character) => character.alive && isPassable(observation, character, move)))
            continue;
        candidates.push({ kind: "group", move, placeMagic: false });
        const target = targetFor(characters[0], move);
        const collectsCapacity = observation.visibleItems[(0, engine_1.positionIndex)(target, observation.width)] === "CAPACITY";
        if ((0, engine_1.selectGroupCaster)(characters, observation.magics) !== null || collectsCapacity) {
            candidates.push({ kind: "group", move, placeMagic: true, fuse: "EIGHT_TURNS" });
        }
    }
    return candidates;
};
const decideOnePlyMinimax = (observation, profile, rngState, friendlyCandidates, enemyCandidates) => {
    const enemyTeamId = (1 - observation.teamId);
    let nextRngState = rngState;
    let best = friendlyCandidates[0];
    let bestWorstScore = Number.NEGATIVE_INFINITY;
    let nodesVisited = 0;
    for (const friendly of friendlyCandidates) {
        let worstScore = Number.POSITIVE_INFINITY;
        for (const enemy of enemyCandidates) {
            const next = observationAfterMinimaxActions(observation, friendly, enemy);
            const friendlySurvival = (0, bitboard_survival_1.getTeamSurvivalForTurnsBitboard)(next, 8);
            const enemySurvival = (0, bitboard_survival_1.getTeamSurvivalForTurnsBitboard)({ ...next, teamId: enemyTeamId }, 8);
            nextRngState = (0, engine_1.nextXorshift32)(nextRngState);
            const tinyRandom = (nextRngState / 0x100000000) * 1e-6;
            const score = deadCount(enemySurvival) - deadCount(friendlySurvival) + tinyRandom;
            nodesVisited += 1;
            if (score < worstScore)
                worstScore = score;
        }
        if (worstScore > bestWorstScore) {
            best = friendly;
            bestWorstScore = worstScore;
        }
    }
    return {
        intent: best,
        nextRngState,
        nodesVisited,
        profileStage: profile.stage,
    };
};
const decideStageFive = (observation, profile, rngState) => {
    const enemyTeamId = (1 - observation.teamId);
    const enemyCandidates = stageSixTeamCandidates(observation, enemyTeamId)
        .map((actions) => ({ kind: "individual", actions }));
    return decideOnePlyMinimax(observation, profile, rngState, stageFiveTeamCandidates(observation, observation.teamId), enemyCandidates);
};
const decideStageSix = (observation, profile, rngState) => {
    const enemyTeamId = (1 - observation.teamId);
    const individualCandidates = (teamId) => stageSixTeamCandidates(observation, teamId).map((actions) => ({ kind: "individual", actions }));
    return decideOnePlyMinimax(observation, profile, rngState, individualCandidates(observation.teamId), individualCandidates(enemyTeamId));
};
const decideIntroStage = (observation, profile, rngState) => {
    if (profile.stage < 1 || profile.stage > 6)
        return null;
    if (profile.stage === 6)
        return decideStageSix(observation, profile, rngState);
    if (profile.stage === 5)
        return decideStageFive(observation, profile, rngState);
    if (profile.stage === 4)
        return decideStageFour(observation, profile, rngState);
    if (profile.stage === 3)
        return decideStageThree(observation, profile, rngState);
    const [firstId, secondId] = (0, engine_1.teamCharacterIds)(observation.teamId);
    const characters = [observation.characters[firstId], observation.characters[secondId]];
    if (profile.stage === 1) {
        const random = randomMovementPair(observation, characters, rngState);
        return {
            intent: { kind: "individual", actions: random.actions },
            nextRngState: random.nextRngState,
            nodesVisited: 2,
            profileStage: profile.stage,
        };
    }
    const budget = { limit: profile.maxNodes, used: 0 };
    const first = stageTwoAction(observation, characters[0], rngState, budget);
    const second = stageTwoAction(observation, characters[1], first.nextRngState, budget);
    return {
        intent: { kind: "individual", actions: [first.action, second.action] },
        nextRngState: second.nextRngState,
        nodesVisited: budget.used,
        profileStage: profile.stage,
    };
};
const countReachableSafeCells = (observation, start, danger, horizon, budget) => {
    const queue = [{ position: start, step: 0 }];
    const visitedTimes = new Set([`0:${start.row},${start.col}`]);
    const safeCells = new Set([(0, engine_1.positionIndex)(start, observation.width)]);
    while (queue.length > 0 && budget.used < budget.limit) {
        const current = queue.shift();
        if (current === undefined || current.step >= horizon || !(0, danger_1.consumeNode)(budget))
            continue;
        for (const move of DIRECTIONS) {
            const position = {
                row: current.position.row + DELTA[move].row,
                col: current.position.col + DELTA[move].col,
            };
            if (position.row < 0 || position.col < 0 || position.row >= observation.height || position.col >= observation.width)
                continue;
            const cell = (0, engine_1.positionIndex)(position, observation.width);
            if (observation.terrain[cell] !== "FLOOR")
                continue;
            const reentersNewMagic = position.row === start.row &&
                position.col === start.col &&
                (current.position.row !== start.row || current.position.col !== start.col);
            if (reentersNewMagic)
                continue;
            if (move !== "NONE" && observation.magics.some((magic) => magic.position.row === position.row && magic.position.col === position.col))
                continue;
            const step = current.step + 1;
            const dangerTurn = danger[cell] ?? 0;
            if (dangerTurn !== 0 && dangerTurn <= observation.turn + step)
                continue;
            const key = `${step}:${position.row},${position.col}`;
            if (visitedTimes.has(key))
                continue;
            visitedTimes.add(key);
            safeCells.add(cell);
            queue.push({ position, step });
        }
    }
    return safeCells.size;
};
exports.countReachableSafeCells = countReachableSafeCells;
const hasEscapeFromPlacement = (observation, start, power, budget) => {
    const detonateTurn = observation.turn + 9;
    const closure = (0, engine_1.collectBlastClosure)(observation.terrain, observation.width, observation.height, [{
            id: Number.MAX_SAFE_INTEGER,
            ownerId: (0, engine_1.teamCharacterIds)(observation.teamId)[0],
            position: start,
            power,
            placedTurn: observation.turn + 1,
            detonateTurn,
        }], detonateTurn);
    const lethal = new Set(closure.blastCells.map((position) => (0, engine_1.positionIndex)(position, observation.width)));
    const queue = [{ position: start, step: 0 }];
    const visited = new Set([`0:${start.row},${start.col}`]);
    while (queue.length > 0 && budget.used < budget.limit) {
        const current = queue.shift();
        if (current === undefined || !(0, danger_1.consumeNode)(budget))
            continue;
        if (current.step === 8) {
            if (!lethal.has((0, engine_1.positionIndex)(current.position, observation.width)))
                return true;
            continue;
        }
        for (const move of DIRECTIONS) {
            const position = {
                row: current.position.row + DELTA[move].row,
                col: current.position.col + DELTA[move].col,
            };
            if (position.row < 0 || position.col < 0 || position.row >= observation.height || position.col >= observation.width)
                continue;
            const cell = (0, engine_1.positionIndex)(position, observation.width);
            if (observation.terrain[cell] !== "FLOOR")
                continue;
            if (move !== "NONE" && observation.magics.some((magic) => magic.position.row === position.row && magic.position.col === position.col))
                continue;
            const step = current.step + 1;
            const key = `${step}:${position.row},${position.col}`;
            if (visited.has(key))
                continue;
            visited.add(key);
            queue.push({ position, step });
        }
    }
    return false;
};
exports.hasEscapeFromPlacement = hasEscapeFromPlacement;
const manhattan = (left, right) => Math.abs(left.row - right.row) + Math.abs(left.col - right.col);
const softBlocksInRange = (observation, position, power) => {
    let count = 0;
    for (const direction of DIRECTIONS.slice(1)) {
        for (let distance = 1; distance <= power; distance += 1) {
            const target = {
                row: position.row + DELTA[direction].row * distance,
                col: position.col + DELTA[direction].col * distance,
            };
            if (target.row < 0 || target.col < 0 || target.row >= observation.height || target.col >= observation.width)
                break;
            const terrain = observation.terrain[(0, engine_1.positionIndex)(target, observation.width)];
            if (terrain === "HARD")
                break;
            if (terrain === "SOFT") {
                count += 1;
                break;
            }
        }
    }
    return count;
};
const evaluatePair = (observation, characters, actions, danger, profile, budget) => {
    const opponents = observation.characters.filter((character) => character.teamId !== observation.teamId && character.alive);
    let score = 0;
    actions.forEach((action, index) => {
        const character = characters[index];
        const target = targetFor(character, action.move);
        const cell = (0, engine_1.positionIndex)(target, observation.width);
        const dangerTurn = danger[cell] ?? 0;
        if (dangerTurn !== 0 && dangerTurn <= observation.turn + 1)
            score -= profile.survivalWeight;
        score += (0, exports.countReachableSafeCells)(observation, target, danger, profile.dangerHorizon, budget) * profile.mobilityWeight;
        if (observation.visibleItems[cell] !== null)
            score += profile.itemWeight;
        if (action.placeMagic) {
            score += softBlocksInRange(observation, target, character.power) * profile.softBlockWeight;
            if (!(0, exports.hasEscapeFromPlacement)(observation, target, character.power, budget))
                score -= profile.survivalWeight;
        }
        if (opponents.length > 0) {
            const distance = Math.min(...opponents.map((opponent) => manhattan(target, opponent.position)));
            score -= distance * profile.attackWeight;
        }
    });
    if (characters.some((character) => !character.alive))
        score -= profile.survivalWeight * 10;
    return score;
};
const decideTeam = (observation, profile, rngState, chainPlan) => {
    if (profile.stage === 10)
        return (0, stage_ten_1.decideStageTen)(observation, profile, rngState, chainPlan);
    if (profile.stage === 9)
        return (0, stage_nine_1.decideStageNine)(observation, profile, rngState, chainPlan);
    if (profile.stage === 8)
        return (0, stage_eight_1.decideStageEight)(observation, profile, rngState, chainPlan);
    if (profile.stage === 7)
        return (0, stage_seven_1.decideStageSeven)(observation, profile, rngState, chainPlan);
    const introDecision = decideIntroStage(observation, profile, rngState);
    if (introDecision !== null)
        return introDecision;
    const nextRngState = (0, engine_1.nextXorshift32)(rngState);
    const budget = { limit: profile.maxNodes, used: 0 };
    const [firstId, secondId] = (0, engine_1.teamCharacterIds)(observation.teamId);
    const characters = [observation.characters[firstId], observation.characters[secondId]];
    const openingTrap = observation.magics.filter((magic) => magic.ownerId === firstId || magic.ownerId === secondId).length >= 2;
    if (observation.turn < 9) {
        // Lower profiles often pursue immediate soft destruction without planning an escape.
        const placeOpeningTrap = observation.turn === 0 && nextRngState % 10000 < profile.openingRiskBasisPoints;
        const openingAction = {
            move: "NONE",
            placeMagic: placeOpeningTrap && !openingTrap,
        };
        return {
            intent: { kind: "individual", actions: [openingAction, openingAction] },
            nextRngState,
            nodesVisited: 1,
            profileStage: profile.stage,
        };
    }
    const firstActions = (0, exports.legalActionsForCharacter)(observation, characters[0]);
    const secondActions = (0, exports.legalActionsForCharacter)(observation, characters[1]);
    const candidates = [];
    for (const first of firstActions)
        for (const second of secondActions)
            candidates.push([first, second]);
    const offset = candidates.length === 0 ? 0 : nextRngState % candidates.length;
    let best = [
        { move: "NONE", placeMagic: false },
        { move: "NONE", placeMagic: false },
    ];
    let bestScore = Number.NEGATIVE_INFINITY;
    const danger = (0, danger_1.buildDangerMap)(observation, profile.dangerHorizon, budget);
    const limit = Math.min(candidates.length, profile.candidateLimit);
    for (let index = 0; index < limit && budget.used < budget.limit; index += 1) {
        if (!(0, danger_1.consumeNode)(budget))
            break;
        const candidate = candidates[(offset + index) % candidates.length];
        if (candidate === undefined)
            break;
        const score = evaluatePair(observation, characters, candidate, danger, profile, budget);
        if (score > bestScore) {
            best = candidate;
            bestScore = score;
        }
    }
    return {
        intent: { kind: "individual", actions: best },
        nextRngState,
        nodesVisited: budget.used,
        profileStage: profile.stage,
    };
};
exports.decideTeam = decideTeam;

},{"@voldecade/engine":3,"./bitboard-survival":2,"./danger":21,"./stage-ten":23,"./stage-nine":24,"./stage-eight":27,"./stage-seven":28}],
23:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decideStageTen = exports.buildEnclosurePlans = exports.findEnclosureLayouts = exports.raceWinningItemCells = exports.findCornerWaitingPositions = exports.findChainTrapTemplates = void 0;
const engine_1 = require("@voldecade/engine");
const stage_nine_1 = require("./stage-nine");
const bitboard_survival_1 = require("./bitboard-survival");
var stage_nine_2 = require("./stage-nine");
Object.defineProperty(exports, "findChainTrapTemplates", { enumerable: true, get: function () { return stage_nine_2.findChainTrapTemplates; } });
Object.defineProperty(exports, "findCornerWaitingPositions", { enumerable: true, get: function () { return stage_nine_2.findCornerWaitingPositions; } });
Object.defineProperty(exports, "raceWinningItemCells", { enumerable: true, get: function () { return stage_nine_2.raceWinningItemCells; } });
const moves = [["UP", -1, 0], ["RIGHT", 0, 1], ["DOWN", 1, 0], ["LEFT", 0, -1]];
const key = (m) => [m.ownerId, m.placedTurn, m.position.row, m.position.col, String(m.detonateTurn)].join(":");
const idle = () => ({ move: "NONE", placeMagic: false });
const cellOf = (o, id) => (0, engine_1.positionIndex)(o.characters[id].position, o.width);
const paths = (o, start, blocked = new Set(o.magics.map(m => (0, engine_1.positionIndex)(m.position, o.width)))) => {
    const found = new Map([[start, []]]), queue = [start];
    for (let i = 0; i < queue.length; i++) {
        const cell = queue[i];
        for (const [move, dr, dc] of moves) {
            const r = Math.floor(cell / o.width) + dr, c = cell % o.width + dc, next = r * o.width + c;
            if (r < 0 || c < 0 || r >= o.height || c >= o.width || found.has(next)
                || blocked.has(next) || o.terrain[next] !== "FLOOR")
                continue;
            found.set(next, [...found.get(cell), move]);
            queue.push(next);
        }
    }
    return found;
};
/** Wall-supported L/U boundaries and short exits, independently of the friendly positions. */
const findEnclosureLayouts = (o) => {
    const rows = Array.from({ length: o.height }, (_, i) => i).filter(i => i === 0 || i === o.height - 1 || i % 2 === 1);
    const cols = Array.from({ length: o.width }, (_, i) => i).filter(i => i === 0 || i === o.width - 1 || i % 2 === 1);
    const layouts = [], seen = new Set();
    for (const top of rows)
        for (const bottom of rows) {
            if (bottom - top < 2 || bottom - top > 8)
                continue;
            for (const left of cols)
                for (const right of cols) {
                    if (right - left < 2 || right - left > 8)
                        continue;
                    const sites = [], region = [];
                    let soft = false;
                    for (let r = top; r <= bottom; r++)
                        for (let c = left; c <= right; c++) {
                            const cell = r * o.width + c;
                            if (o.terrain[cell] === "SOFT")
                                soft = true;
                            if (o.terrain[cell] !== "FLOOR")
                                continue;
                            if ((r === top || r === bottom) && (c === left || c === right))
                                continue;
                            if (r === top || r === bottom || c === left || c === right) {
                                const inner = r === top ? cell + o.width : r === bottom ? cell - o.width : c === left ? cell + 1 : cell - 1;
                                if (o.terrain[inner] === "FLOOR")
                                    sites.push(cell);
                            }
                            else
                                region.push(cell);
                        }
                    if (soft || !region.length || sites.length < 2 || sites.length > 6)
                        continue;
                    const stamp = sites.join(",");
                    if (!seen.has(stamp)) {
                        seen.add(stamp);
                        layouts.push({ sites, region });
                    }
                }
        }
    return layouts;
};
exports.findEnclosureLayouts = findEnclosureLayouts;
/** Separate routes and assignments; the final spells are placed simultaneously. */
const buildEnclosurePlans = (o, layout) => {
    const ids = (0, engine_1.teamCharacterIds)(o.teamId);
    const existing = o.magics.filter(m => layout.sites.includes((0, engine_1.positionIndex)(m.position, o.width)));
    const missing = layout.sites.filter(cell => !existing.some(m => (0, engine_1.positionIndex)(m.position, o.width) === cell));
    if (!missing.length || missing.length > 6)
        return [];
    const available = ids.map(id => o.characters[id].capacity - o.magics.filter(m => m.ownerId === id).length);
    const candidates = [];
    // A route depends on position and blocked cells, not on who owns its targets.
    // Share searches across assignments and the two visiting orders in this call.
    const routeCache = new Map();
    const seenPlans = new Set();
    for (let mask = 0; mask < 1 << missing.length; mask++) {
        const assigned = ids.map((_, i) => missing.filter((__, j) => ((mask >> j) & 1) === i));
        if (assigned.some((cells, i) => cells.length > available[i]))
            continue;
        for (const farFirst of [false, true]) {
            const routes = [[], []], synthetic = [...existing];
            let valid = true;
            for (let i = 0; i < 2; i++) {
                let cell = cellOf(o, ids[i]);
                const todo = [...assigned[i]], blocked = new Set(o.magics.map(m => (0, engine_1.positionIndex)(m.position, o.width)));
                while (todo.length) {
                    const stamp = `${cell}:${[...blocked].sort((a, b) => a - b).join(',')}`;
                    const access = routeCache.get(stamp) ?? paths(o, cell, blocked);
                    routeCache.set(stamp, access);
                    todo.sort((a, b) => (farFirst ? -1 : 1) * ((access.get(a)?.length ?? 1000) - (access.get(b)?.length ?? 1000)) || a - b);
                    const target = todo.shift(), route = access.get(target);
                    if (!route) {
                        valid = false;
                        break;
                    }
                    const actions = route.map(move => ({ move, placeMagic: false }));
                    if (!actions.length)
                        actions.push(idle());
                    const infinite = todo.length > 0;
                    actions[actions.length - 1] = { ...actions[actions.length - 1], placeMagic: true, fuse: infinite ? "INFINITE" : "EIGHT_TURNS" };
                    routes[i].push(...actions);
                    synthetic.push({ id: 1000000 + synthetic.length, ownerId: ids[i], position: { row: Math.floor(target / o.width), col: target % o.width },
                        power: o.characters[ids[i]].power, placedTurn: o.turn, detonateTurn: infinite ? null : o.turn + 8 });
                    blocked.add(target);
                    cell = target;
                }
            }
            const length = Math.max(...routes.map(r => r.length));
            if (!valid || length > 16 || !synthetic.some(m => m.detonateTurn === null))
                continue;
            const blast = (0, engine_1.collectBlastClosure)(o.terrain, o.width, o.height, synthetic, o.turn + 8);
            const covered = new Set(blast.blastCells.map(p => (0, engine_1.positionIndex)(p, o.width)));
            if (layout.region.some(cell => !covered.has(cell)))
                continue;
            for (const route of routes)
                if (route.length && route.length < length) {
                    const last = route[route.length - 1];
                    route[route.length - 1] = { move: last.move, placeMagic: false };
                    while (route.length < length - 1)
                        route.push(idle());
                    route.push({ move: "NONE", placeMagic: true, fuse: "EIGHT_TURNS" });
                }
            const plan = { nextTurn: o.turn, region: layout.region, requiredMagics: existing.map(key),
                steps: Array.from({ length }, (_, i) => ({ kind: "individual", actions: [routes[0][i] ?? idle(), routes[1][i] ?? idle()] })) };
            const stamp = JSON.stringify(plan.steps);
            if (!seenPlans.has(stamp)) {
                seenPlans.add(stamp);
                candidates.push(plan);
            }
        }
    }
    // Prefer straight construction among equally short plans. Approach moves before
    // the first placement and idle steps to synchronize ignition are not bends.
    const bends = (plan) => {
        let count = 0;
        for (const i of [0, 1]) {
            let building = false, direction;
            for (const step of plan.steps) {
                const action = step.actions[i];
                if (building && action.move !== 'NONE') {
                    if (direction && direction !== action.move)
                        count++;
                    direction = action.move;
                }
                if (action.placeMagic)
                    building = true;
            }
        }
        return count;
    };
    return candidates.sort((a, b) => a.steps.length - b.steps.length || bends(a) - bends(b)).slice(0, 12);
};
exports.buildEnclosurePlans = buildEnclosurePlans;
const decideStageTen = (o, profile, rng, saved) => {
    const budget = new stage_nine_1.Budget(profile.maxNodes), nextRngState = (0, engine_1.nextXorshift32)(rng);
    const base = () => ({ nextRngState, nodesVisited: budget.used, profileStage: 10 });
    const priorityItems = (0, stage_nine_1.raceWinningItemCells)(o);
    const remaining = o.magics.filter(m => saved?.requiredMagics.includes(key(m)));
    const cleanupMagics = remaining.filter(m => m.detonateTurn === null && o.characters[m.ownerId].teamId === o.teamId);
    const intact = saved?.nextTurn === o.turn && saved.requiredMagics.every(k => remaining.some(m => key(m) === k));
    if (saved && intact && !saved.cleanupOnly && !saved.steps.length && o.turn < (saved.detonateTurn ?? 0)) {
        const intent = (0, stage_nine_1.fallback)(o, [], budget, rng, { priorityItems, avoidRegion: saved.region });
        return { ...base(), intent, chainPlan: { ...saved, nextTurn: o.turn + 1 } };
    }
    const enemyCells = o.characters.filter(c => c.teamId !== o.teamId && c.alive).map(c => (0, engine_1.positionIndex)(c.position, o.width));
    const execute = (plan) => {
        if (!plan.steps.length || !enemyCells.some(cell => plan.region.includes(cell)))
            return undefined;
        const forecast = (0, stage_nine_1.forecastPlan)(o, plan, budget);
        if (!forecast || forecast.deaths < 1 || !budget.take(plan.steps.length + 8))
            return undefined;
        const alreadyDoomed = (0, bitboard_survival_1.getTeamSurvivalForTurnsBitboard)({ ...o, teamId: o.teamId === 0 ? 1 : 0 }, plan.steps.length + 8).filter(alive => !alive).length;
        if (forecast.deaths <= alreadyDoomed || !(0, stage_nine_1.safeAgainstResponses)(o, plan.steps[0], budget))
            return undefined;
        const previous = new Set(o.magics.map(key));
        const added = forecast.first.magics.filter(m => !previous.has(key(m)) && o.characters[m.ownerId].teamId === o.teamId);
        return { ...base(), intent: plan.steps[0], chainPlan: { ...plan, steps: plan.steps.slice(1), nextTurn: o.turn + 1,
                requiredMagics: [...plan.requiredMagics, ...added.map(key)], detonateTurn: forecast.detonateTurn } };
    };
    if (saved && intact && !saved.cleanupOnly && !priorityItems.length) {
        const continued = execute(saved);
        if (continued)
            return continued;
    }
    const access = (0, engine_1.teamCharacterIds)(o.teamId).map(id => paths(o, cellOf(o, id)));
    const distance = (cell) => Math.min(...access.map(p => p.get(cell)?.length ?? 1000));
    const layouts = [...(0, exports.findEnclosureLayouts)(o)].sort((a, b) => Number(b.region.some(c => enemyCells.includes(c))) - Number(a.region.some(c => enemyCells.includes(c)))
        || a.sites.reduce((s, c) => s + distance(c), 0) - b.sites.reduce((s, c) => s + distance(c), 0));
    if (!priorityItems.length && !saved?.cleanupOnly) {
        for (const layout of layouts.slice(0, 16)) {
            if (!layout.region.some(c => enemyCells.includes(c)))
                continue;
            for (const plan of (0, exports.buildEnclosurePlans)(o, layout)) {
                if (budget.used > profile.maxNodes - 4000)
                    break;
                const candidate = { ...plan, requiredMagics: [...new Set([...plan.requiredMagics, ...cleanupMagics.map(key)])] };
                const choice = execute(candidate);
                if (choice)
                    return choice;
            }
        }
    }
    let waitingCells;
    if (!o.terrain.includes("SOFT") && !priorityItems.length && !cleanupMagics.length) {
        const options = new Map();
        for (const layout of layouts.slice(0, 12)) {
            const targets = access.map(p => [...layout.sites].filter(c => p.has(c)).sort((a, b) => p.get(a).length - p.get(b).length || a - b));
            if (targets.some(cells => !cells.length))
                continue;
            const first = targets[0][0], second = targets[1].find(c => c !== first) ?? targets[1][0];
            const cells = [first, second], ids = (0, engine_1.teamCharacterIds)(o.teamId);
            const staged = { ...o, characters: o.characters.map(c => {
                    const i = ids.indexOf(c.id);
                    return i < 0 ? c : { ...c, position: { row: Math.floor(cells[i] / o.width), col: cells[i] % o.width } };
                }) };
            const preparation = (0, exports.buildEnclosurePlans)(staged, layout)[0];
            if (!preparation)
                continue; // Do not wait for a layout the current capacity/power cannot build.
            const cost = access[0].get(first).length + access[1].get(second).length + preparation.steps.length * 2
                - (layout.region.some(c => enemyCells.includes(c)) ? 20 : 0);
            const stamp = cells.join(","), previous = options.get(stamp);
            options.set(stamp, { cells, cost: Math.min(cost, previous?.cost ?? cost), opportunities: (previous?.opportunities ?? 0) + 1 });
        }
        waitingCells = [...options.values()].sort((a, b) => (a.cost - a.opportunities) - (b.cost - b.opportunities)
            || a.cells[0] - b.cells[0] || a.cells[1] - b.cells[1])[0]?.cells;
    }
    const intent = (0, stage_nine_1.fallback)(o, [], budget, rng, { priorityItems, cleanupMagics,
        ...(waitingCells ? { waitingCells } : {}), ...(saved ? { avoidRegion: saved.region } : {}) });
    return { ...base(), intent, ...(cleanupMagics.length ? { chainPlan: { nextTurn: o.turn + 1, steps: [],
                region: saved?.region ?? [], requiredMagics: cleanupMagics.map(key), cleanupOnly: true } } : {}) };
};
exports.decideStageTen = decideStageTen;

},{"@voldecade/engine":3,"./stage-nine":24,"./bitboard-survival":2}],
24:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decideStageNine = exports.fallback = exports.raceWinningItemCells = exports.safeAgainstResponses = exports.forecastPlan = exports.findCornerWaitingPositions = exports.findChainTrapTemplates = exports.Budget = void 0;
const engine_1 = require("@voldecade/engine");
const bitboard_survival_1 = require("./bitboard-survival");
const observation_1 = require("./observation");
const simulation_1 = require("./simulation");
const MOVES = ["NONE", "UP", "RIGHT", "DOWN", "LEFT"];
const DELTAS = { NONE: [0, 0], UP: [-1, 0], RIGHT: [0, 1], DOWN: [1, 0], LEFT: [0, -1] };
const idle = () => ({ move: "NONE", placeMagic: false });
const intent = (actions) => ({ kind: "individual", actions });
const cellFor = (o, id) => (0, engine_1.positionIndex)(o.characters[id].position, o.width);
const positionFor = (o, cell) => ({ row: Math.floor(cell / o.width), col: cell % o.width });
const adjacent = (o, cell, direction) => {
    const row = Math.floor(cell / o.width) + DELTAS[direction][0];
    const col = cell % o.width + DELTAS[direction][1];
    return row < 0 || col < 0 || row >= o.height || col >= o.width ? null : row * o.width + col;
};
const magicKey = (magic) => `${magic.ownerId}:${magic.placedTurn}:${magic.position.row}:${magic.position.col}:${magic.detonateTurn}`;
const remaining = (o, id) => o.characters[id].capacity - o.magics.filter((magic) => magic.ownerId === id).length;
const hasTemplateResources = (o, template) => (0, engine_1.teamCharacterIds)(o.teamId).every((id, i) => o.characters[id].alive
    && remaining(o, id) >= template.requiredCapacity[i]
    && o.characters[id].power >= template.requiredPower[i]);
const enemyId = (o) => o.teamId === 0 ? 1 : 0;
const spellCells = (o) => new Set(o.magics.map((magic) => (0, engine_1.positionIndex)(magic.position, o.width)));
/** Deterministic limit on simulated states/forecast turns, never a wall-clock limit. */
class Budget {
    constructor(limit) {
        this.limit = limit;
        this.used = 0;
    }
    take(count = 1) {
        if (this.used + count > this.limit)
            return false;
        this.used += count;
        return true;
    }
}
exports.Budget = Budget;
const distances = (o, start, blocked = spellCells(o)) => {
    const paths = new Map([[start, []]]);
    const queue = [start];
    for (let i = 0; i < queue.length; i += 1) {
        const cell = queue[i];
        for (const move of MOVES.slice(1)) {
            const next = adjacent(o, cell, move);
            if (next === null || paths.has(next) || blocked.has(next) || o.terrain[next] !== "FLOOR")
                continue;
            paths.set(next, [...paths.get(cell), move]);
            queue.push(next);
        }
    }
    return paths;
};
const syntheticMagics = (o, sites, powers) => {
    const ids = (0, engine_1.teamCharacterIds)(o.teamId);
    const magics = [];
    sites.forEach((arm, index) => arm.forEach((cell, at) => magics.push({
        id: 1000000 + magics.length, ownerId: ids[index],
        position: positionFor(o, cell), power: powers[index], placedTurn: o.turn,
        detonateTurn: at === arm.length - 1 ? o.turn + 8 : null,
    })));
    return magics;
};
/** Find two perpendicular construction lanes enclosing an enemy floor component. */
const findChainTrapTemplates = (o) => {
    const ids = (0, engine_1.teamCharacterIds)(o.teamId);
    const enemies = o.characters.filter((c) => c.teamId !== o.teamId && c.alive);
    const occupied = spellCells(o);
    const access = ids.map((id) => distances(o, cellFor(o, id)));
    const templates = [];
    for (let anchor = 0; anchor < o.terrain.length; anchor += 1) {
        if (o.terrain[anchor] !== "FLOOR" || occupied.has(anchor) || access.some((paths) => !paths.has(anchor)))
            continue;
        for (const horizontal of ["RIGHT", "LEFT"])
            for (const vertical of ["DOWN", "UP"]) {
                const directions = [horizontal, vertical];
                const lanes = directions.map((direction) => {
                    const lane = [];
                    let next = adjacent(o, anchor, direction);
                    while (next !== null && o.terrain[next] === "FLOOR" && !occupied.has(next)) {
                        lane.push(next);
                        next = adjacent(o, next, direction);
                    }
                    return lane;
                });
                if (lanes.some((lane) => lane.length < 2 || lane.length > 10))
                    continue;
                const sites = lanes.map((lane) => lane.filter((_, i) => i % 2 === 1 || i === lane.length - 1));
                if (sites[0].length + sites[1].length < 3)
                    continue; // At least one infinite relay, plus two timed endpoints.
                const blocked = new Set([...occupied, ...sites[0], ...sites[1]]);
                const regions = enemies.map((enemy) => [...distances(o, (0, engine_1.positionIndex)(enemy.position, o.width), blocked).keys()]);
                // A target must be separated from the staging cell by walls and the planned placements.
                const region = regions.filter((cells) => !cells.includes(anchor)).sort((a, b) => b.length - a.length)[0];
                if (region === undefined || region.length === 0)
                    continue;
                let requiredPower = null;
                for (let extra = 0; extra <= 4; extra += 1) {
                    const powers = [Math.max(2, o.characters[ids[0]].power + extra), Math.max(2, o.characters[ids[1]].power + extra)];
                    const magics = syntheticMagics(o, sites, powers);
                    const blast = (0, engine_1.collectBlastClosure)(o.terrain, o.width, o.height, magics, o.turn + 8);
                    const covered = new Set(blast.blastCells.map((p) => (0, engine_1.positionIndex)(p, o.width)));
                    if (blast.triggeredMagicIds.length === magics.length && region.every((cell) => covered.has(cell))) {
                        requiredPower = powers;
                        break;
                    }
                }
                if (requiredPower === null)
                    continue;
                const requiredCapacity = [sites[0].length, sites[1].length];
                const travel = Math.max(...access.map((paths) => paths.get(anchor).length));
                const length = Math.max(lanes[0]?.length ?? 0, lanes[1]?.length ?? 0);
                if (travel + length > 24)
                    continue;
                const missing = ids.reduce((sum, id, i) => sum + Math.max(0, requiredCapacity[i] - remaining(o, id))
                    + Math.max(0, (requiredPower?.[i] ?? 0) - o.characters[id].power), 0);
                templates.push({ anchor, directions, lengths: [lanes[0]?.length ?? 0, lanes[1]?.length ?? 0], sites, region,
                    requiredCapacity, requiredPower, cost: missing * 8 + travel + length - Math.min(region.length, 20) * 0.1 });
            }
    }
    return templates.sort((a, b) => a.cost - b.cost || a.anchor - b.anchor).slice(0, 12);
};
exports.findChainTrapTemplates = findChainTrapTemplates;
/** Four corner nets, with both assignments of the horizontal and vertical arms. */
const findCornerWaitingPositions = (o) => {
    if (o.width < 11 || o.height < 11)
        return [];
    const ids = (0, engine_1.teamCharacterIds)(o.teamId);
    const access = ids.map((id) => distances(o, cellFor(o, id)));
    const results = [];
    for (const top of [true, false])
        for (const left of [true, false]) {
            const row = top ? 5 : o.height - 6;
            const col = left ? 5 : o.width - 6;
            const anchor = row * o.width + col;
            const horizontal = left ? "LEFT" : "RIGHT";
            const vertical = top ? "UP" : "DOWN";
            for (const swapped of [false, true]) {
                const directions = (swapped ? [vertical, horizontal] : [horizontal, vertical]);
                const lanes = directions.map((direction) => {
                    const lane = [];
                    let cell = anchor;
                    for (let step = 0; step < 4; step += 1) {
                        cell = cell === null ? null : adjacent(o, cell, direction);
                        if (cell === null || o.terrain[cell] !== "FLOOR")
                            return [];
                        lane.push(cell);
                    }
                    return lane;
                });
                if (o.terrain[anchor] !== "FLOOR" || lanes.some((lane) => lane.length !== 4))
                    continue;
                const cells = lanes.map((lane) => lane[0]);
                if (cells.some((cell, i) => !access[i]?.has(cell)))
                    continue;
                const sites = lanes.map((lane) => [lane[1], lane[3]]);
                const corner = (top ? 1 : o.height - 2) * o.width + (left ? 1 : o.width - 2);
                const region = [...distances(o, corner, new Set(sites.flat())).keys()];
                if (region.includes(anchor))
                    continue;
                const powers = [4, 4];
                const synthetic = syntheticMagics(o, sites, powers);
                const blast = (0, engine_1.collectBlastClosure)(o.terrain, o.width, o.height, synthetic, o.turn + 8);
                const covered = new Set(blast.blastCells.map((position) => (0, engine_1.positionIndex)(position, o.width)));
                if (blast.triggeredMagicIds.length !== synthetic.length || region.some((cell) => !covered.has(cell)))
                    continue;
                results.push({ cells, distance: cells.reduce((sum, cell, i) => sum + (access[i]?.get(cell)?.length ?? 0), 0),
                    template: { anchor, directions, lengths: [4, 4], sites, region,
                        requiredCapacity: [2, 2], requiredPower: powers } });
            }
        }
    return results.sort((a, b) => a.distance - b.distance || a.cells[0] - b.cells[0] || a.cells[1] - b.cells[1]);
};
exports.findCornerWaitingPositions = findCornerWaitingPositions;
const buildSteps = (o, template, staged = false) => {
    const ids = (0, engine_1.teamCharacterIds)(o.teamId);
    if (!hasTemplateResources(o, template))
        return null;
    const paths = ids.map((id) => staged ? [] : distances(o, cellFor(o, id)).get(template.anchor));
    if (paths.some((path) => path === undefined))
        return null;
    const steps = [];
    const travel = Math.max(...paths.map((path) => path?.length ?? 0));
    for (let i = 0; i < travel; i += 1) {
        steps.push(intent(paths.map((path) => ({ move: path?.[i] ?? "NONE", placeMagic: false }))));
    }
    const buildLength = Math.max(...template.lengths);
    for (let step = staged ? 2 : 1; step <= buildLength; step += 1) {
        steps.push(intent(ids.map((_, i) => {
            const length = template.lengths[i];
            if (step > length)
                return step === buildLength
                    ? { move: "NONE", placeMagic: true, fuse: "EIGHT_TURNS" }
                    : idle();
            if (step === length)
                return { move: template.directions[i],
                    placeMagic: length === buildLength,
                    ...(length === buildLength ? { fuse: "EIGHT_TURNS" } : {}),
                };
            const placeMagic = step % 2 === 0;
            return { move: template.directions[i], placeMagic,
                ...(placeMagic ? { fuse: "INFINITE" } : {}) };
        })));
    }
    return steps;
};
const forecastPlan = (o, plan, budget) => {
    if (plan.steps.length === 0 || !budget.take(plan.steps.length * 2 + 16))
        return null;
    const ids = (0, engine_1.teamCharacterIds)(o.teamId);
    let current = o;
    let first = o;
    const scheduled = [];
    for (const [step, action] of plan.steps.entries()) {
        const resolved = (0, simulation_1.simulateTurn)(current, action);
        const next = (0, observation_1.toObservation)(resolved.state, o.teamId);
        if (resolved.events.some((event) => event.kind === "MOVE_BLOCKED" && ids.includes(event.characterId)))
            return null;
        if (ids.some((id, i) => !next.characters[id].alive || (action.actions[i]?.placeMagic &&
            (!resolved.resolvedActions[id].placeMagic || resolved.resolvedActions[id].fuse !== action.actions[i]?.fuse))))
            return null;
        for (const event of resolved.events)
            if (event.kind === "MAGIC_PLACED" && ids.includes(event.ownerId)) {
                scheduled.push({ id: event.magicId, ownerId: event.ownerId, position: event.position,
                    power: next.characters[event.ownerId].power, placedTurn: next.turn,
                    detonateTurn: resolved.resolvedActions[event.ownerId].fuse === "INFINITE" ? null : next.turn + 8 });
            }
        if (step === 0)
            first = next;
        current = next;
    }
    if (!(0, bitboard_survival_1.canTeamSurviveForTurnsBitboard)(current, 8))
        return null;
    const plannedExisting = o.magics.filter((magic) => plan.requiredMagics.includes(magicKey(magic)));
    const planned = [...plannedExisting, ...scheduled];
    const detonateTurn = Math.max(...planned.map((magic) => magic.detonateTurn ?? Number.NEGATIVE_INFINITY));
    if (!Number.isFinite(detonateTurn) || detonateTurn > current.turn + 8)
        return null;
    let future = current;
    const triggered = new Set();
    for (let step = current.turn; step < detonateTurn; step += 1) {
        const resolved = (0, simulation_1.simulateTurn)(future, intent([idle(), idle()]));
        resolved.events.forEach((event) => { if (event.kind === "MAGIC_TRIGGERED")
            triggered.add(event.magicId); });
        future = (0, observation_1.toObservation)(resolved.state, o.teamId);
        if (resolved.state.outcome.kind !== "ONGOING")
            break;
    }
    if (planned.some((magic) => !triggered.has(magic.id)))
        return null;
    const enemySurvival = (0, bitboard_survival_1.getTeamSurvivalForTurnsBitboard)({ ...o, teamId: enemyId(o) }, plan.steps.length + 8, scheduled);
    return { deaths: enemySurvival.filter((alive) => !alive).length, first, detonateTurn };
};
exports.forecastPlan = forecastPlan;
const actionsFor = (o, id, includeInfinite) => {
    if (!o.characters[id].alive)
        return [idle()];
    const occupied = spellCells(o);
    const actions = [];
    for (const move of MOVES) {
        const next = adjacent(o, cellFor(o, id), move);
        if (next === null || (move !== "NONE" && (o.terrain[next] !== "FLOOR" || occupied.has(next))))
            continue;
        actions.push({ move, placeMagic: false });
        const slots = remaining(o, id) + (o.visibleItems[next] === "CAPACITY" ? 1 : 0);
        if (slots > 0)
            actions.push({ move, placeMagic: true, fuse: "EIGHT_TURNS" });
        if (slots > 1 && includeInfinite)
            actions.push({ move, placeMagic: true, fuse: "INFINITE" });
    }
    return actions;
};
const allResponses = (o) => {
    const ids = (0, engine_1.teamCharacterIds)(enemyId(o));
    return actionsFor(o, ids[0], true).flatMap((a) => actionsFor(o, ids[1], true).map((b) => intent([a, b])));
};
// Recheck the first action against every currently legal opposing action, including early chain triggers.
const safeAgainstResponses = (o, action, budget) => {
    for (const enemy of allResponses(o)) {
        if (!budget.take(9))
            return false;
        if (!(0, bitboard_survival_1.canTeamSurviveForTurnsBitboard)((0, observation_1.toObservation)((0, simulation_1.simulateTurn)(o, action, enemy).state, o.teamId), 8))
            return false;
    }
    return true;
};
exports.safeAgainstResponses = safeAgainstResponses;
const itemDistance = (o, paths, cell) => {
    if (o.terrain[cell] === "FLOOR")
        return paths.get(cell)?.length ?? Number.POSITIVE_INFINITY;
    if (o.terrain[cell] !== "SOFT")
        return Number.POSITIVE_INFINITY;
    let distance = Number.POSITIVE_INFINITY;
    for (const move of MOVES.slice(1)) {
        const neighbor = adjacent(o, cell, move);
        if (neighbor !== null)
            distance = Math.min(distance, paths.get(neighbor)?.length ?? Number.POSITIVE_INFINITY);
    }
    return distance + 8;
};
/** Known items our team can reach strictly before the opposing team. */
const raceWinningItemCells = (o) => {
    const own = (0, engine_1.teamCharacterIds)(o.teamId).filter((id) => o.characters[id].alive)
        .map((id) => distances(o, cellFor(o, id)));
    const enemy = (0, engine_1.teamCharacterIds)(enemyId(o)).filter((id) => o.characters[id].alive)
        .map((id) => distances(o, cellFor(o, id)));
    const nearest = (maps, cell) => Math.min(...maps.map((paths) => itemDistance(o, paths, cell)));
    return o.visibleItems.flatMap((visible, cell) => (visible ?? o.blockItems[cell]) !== null
        && nearest(own, cell) < nearest(enemy, cell) ? [cell] : []);
};
exports.raceWinningItemCells = raceWinningItemCells;
const projectedBlast = (o, id, cell) => {
    const placed = { id: 2000000 + id, ownerId: id, position: positionFor(o, cell),
        power: o.characters[id].power, placedTurn: o.turn, detonateTurn: o.turn };
    return (0, engine_1.collectBlastClosure)(o.terrain, o.width, o.height, [...o.magics, placed], o.turn);
};
const fallback = (o, templates, budget, rng, options = {}) => {
    const ids = (0, engine_1.teamCharacterIds)(o.teamId);
    const priorityItems = options.priorityItems ?? [];
    const cleanupMagics = options.cleanupMagics ?? [];
    const cleanupIds = new Set(cleanupMagics.map((magic) => magic.id));
    const avoidRegion = new Set(options.avoidRegion ?? []);
    // Resource targets are selected per character from visible items and known soft-block contents.
    const goals = ids.map((id, i) => {
        if (options.waitingCells !== undefined)
            return distances(o, options.waitingCells[i]);
        const needCapacity = remaining(o, id) < (templates[0]?.requiredCapacity[i] ?? 2);
        const needPower = o.characters[id].power < (templates[0]?.requiredPower[i] ?? 4);
        const paths = distances(o, cellFor(o, id));
        const targets = [];
        if (priorityItems.length > 0) {
            priorityItems.forEach((cell) => {
                if (o.terrain[cell] === "FLOOR" && paths.has(cell))
                    targets.push({ cell, cost: paths.get(cell)?.length ?? 0 });
                if (o.terrain[cell] === "SOFT")
                    for (const move of MOVES.slice(1)) {
                        const neighbor = adjacent(o, cell, move);
                        if (neighbor !== null && paths.has(neighbor))
                            targets.push({ cell: neighbor, cost: (paths.get(neighbor)?.length ?? 0) + 8 });
                    }
            });
        }
        else if (cleanupMagics.length > 0) {
            o.terrain.forEach((terrain, cell) => {
                if (terrain === "FLOOR" && paths.has(cell)
                    && projectedBlast(o, id, cell).triggeredMagicIds.some((magicId) => cleanupIds.has(magicId))) {
                    targets.push({ cell, cost: paths.get(cell)?.length ?? 0 });
                }
            });
        }
        else {
            o.terrain.forEach((terrain, cell) => {
                const item = o.visibleItems[cell] ?? o.blockItems[cell];
                const wanted = item === "CAPACITY" ? needCapacity : item === "POWER" && needPower;
                if (item !== null && wanted) {
                    if (terrain === "FLOOR" && paths.has(cell))
                        targets.push({ cell, cost: (paths.get(cell)?.length ?? 0) });
                    if (terrain === "SOFT")
                        for (const move of MOVES.slice(1)) {
                            const neighbor = adjacent(o, cell, move);
                            if (neighbor !== null && paths.has(neighbor))
                                targets.push({ cell: neighbor, cost: (paths.get(neighbor)?.length ?? 0) + 4 });
                        }
                }
            });
        }
        if (targets.length === 0 && priorityItems.length === 0 && cleanupMagics.length === 0) {
            o.terrain.forEach((terrain, cell) => {
                if (terrain === "FLOOR" && paths.has(cell) && projectedBlast(o, id, cell).destroyedSoftCells.length > 0) {
                    targets.push({ cell, cost: paths.get(cell)?.length ?? 0 });
                }
            });
        }
        if (targets.length === 0) {
            for (const enemy of o.characters.filter((c) => c.teamId !== o.teamId && c.alive)) {
                const cell = (0, engine_1.positionIndex)(enemy.position, o.width);
                if (paths.has(cell))
                    targets.push({ cell, cost: paths.get(cell)?.length ?? 0 });
            }
        }
        targets.sort((a, b) => a.cost - b.cost || a.cell - b.cell);
        const target = targets[0]?.cell;
        return target === undefined ? new Map() : distances(o, target);
    });
    const choices = [];
    for (const a of actionsFor(o, ids[0], false))
        for (const b of actionsFor(o, ids[1], false)) {
            if (!budget.take(17))
                continue;
            const action = intent([a, b]);
            const next = (0, observation_1.toObservation)((0, simulation_1.simulateTurn)(o, action).state, o.teamId);
            if (ids.some((id) => !avoidRegion.has(cellFor(o, id)) && avoidRegion.has(cellFor(next, id))))
                continue;
            const survivors = (0, bitboard_survival_1.getTeamSurvivalForTurnsBitboard)(next, 8).filter(Boolean).length;
            const enemySurvivors = (0, bitboard_survival_1.getTeamSurvivalForTurnsBitboard)({ ...next, teamId: enemyId(o) }, 8).filter(Boolean).length;
            const collectedPriority = priorityItems.filter((cell) => o.visibleItems[cell] !== null && next.visibleItems[cell] === null).length;
            const priorityDistance = Math.min(...priorityItems.flatMap((cell) => ids.map((id) => itemDistance(next, distances(next, cellFor(next, id)), cell))));
            let score = survivors * 1000000 - (options.waitingCells === undefined ? enemySurvivors * 1000 : 0) + collectedPriority * 200000;
            if (Number.isFinite(priorityDistance))
                score -= priorityDistance * 2000;
            ids.forEach((id, i) => {
                score -= Math.min(goals[i]?.get(cellFor(next, id))?.length ?? 1000, 1000);
                if (options.waitingCells !== undefined && action.actions[i]?.placeMagic)
                    score -= 10000;
                score += (next.characters[id].capacity - o.characters[id].capacity + next.characters[id].power - o.characters[id].power) * 12;
                if (action.actions[i]?.placeMagic) {
                    const placed = next.magics.find((magic) => magic.ownerId === id && magic.placedTurn === next.turn);
                    if (placed !== undefined) {
                        const blast = (0, engine_1.collectBlastClosure)(next.terrain, next.width, next.height, next.magics.map((magic) => magic.id === placed.id ? { ...magic, detonateTurn: next.turn } : magic), next.turn);
                        score += blast.triggeredMagicIds.filter((magicId) => cleanupIds.has(magicId)).length * 50000;
                        score += blast.destroyedSoftCells.filter((p) => priorityItems.includes((0, engine_1.positionIndex)(p, o.width))).length * 200000;
                        score += blast.destroyedSoftCells.reduce((sum, p) => sum + (o.blockItems[(0, engine_1.positionIndex)(p, o.width)] === null ? 500 : 2000), 0);
                        score -= 2;
                    }
                }
            });
            rng = (0, engine_1.nextXorshift32)(rng);
            choices.push({ action, score: score + rng / 0x100000000 * 0.01 });
        }
    choices.sort((a, b) => b.score - a.score);
    // A dangerous high-scoring attack must not hide a safe retreat farther down
    // the ranking. Failed checks stop at their first counterexample, leaving
    // budget to examine subsequent candidates.
    for (const choice of choices) {
        if (budget.used + 9 > budget.limit)
            break;
        if ((0, exports.safeAgainstResponses)(o, choice.action, budget))
            return choice.action;
    }
    return choices[0]?.action ?? intent([idle(), idle()]);
};
exports.fallback = fallback;
const decideStageNine = (observation, profile, rngState, savedPlan) => {
    const budget = new Budget(profile.maxNodes);
    const nextRngState = (0, engine_1.nextXorshift32)(rngState);
    let plan;
    let forecast = null;
    const existing = new Set(observation.magics.map(magicKey));
    const existingIds = new Set(observation.magics.map((magic) => magic.id));
    const priorityItems = (0, exports.raceWinningItemCells)(observation);
    const enemyCells = observation.characters.filter((c) => c.teamId !== observation.teamId && c.alive)
        .map((c) => (0, engine_1.positionIndex)(c.position, observation.width));
    const savedRequired = savedPlan === undefined ? [] : observation.magics.filter((magic) => savedPlan.requiredMagics.includes(magicKey(magic)));
    const cleanupMagics = savedPlan === undefined ? [] : savedRequired.filter((magic) => magic.detonateTurn === null);
    const savedIntact = savedPlan !== undefined && savedPlan.nextTurn === observation.turn
        && savedPlan.requiredMagics.every((key) => existing.has(key));
    if (savedPlan?.cleanupOnly === true && savedPlan.nextTurn === observation.turn && cleanupMagics.length > 0) {
        const action = (0, exports.fallback)(observation, [], budget, rngState, { priorityItems, cleanupMagics, avoidRegion: savedPlan.region });
        return { intent: action, nextRngState, nodesVisited: budget.used, profileStage: 9,
            chainPlan: { ...savedPlan, nextTurn: observation.turn + 1,
                requiredMagics: cleanupMagics.map(magicKey) } };
    }
    if (savedPlan !== undefined && savedIntact && savedPlan.steps.length === 0
        && savedPlan.detonateTurn !== undefined && observation.turn < savedPlan.detonateTurn) {
        const action = (0, exports.fallback)(observation, [], budget, rngState, { priorityItems, avoidRegion: savedPlan.region });
        return { intent: action, nextRngState, nodesVisited: budget.used, profileStage: 9,
            chainPlan: { ...savedPlan, nextTurn: observation.turn + 1 } };
    }
    if (priorityItems.length === 0 && savedPlan !== undefined && savedIntact && savedPlan.steps.length > 0
        && enemyCells.some((cell) => savedPlan.region.includes(cell))) {
        forecast = (0, exports.forecastPlan)(observation, savedPlan, budget);
        if (forecast !== null)
            plan = savedPlan;
    }
    let templates = [];
    const waiting = plan === undefined && priorityItems.length === 0 && cleanupMagics.length === 0
        && !observation.terrain.includes("SOFT") ? (0, exports.findCornerWaitingPositions)(observation)
        .find((candidate) => hasTemplateResources(observation, candidate.template)) : undefined;
    if (waiting !== undefined && waiting.distance === 0
        && enemyCells.some((cell) => waiting.template.region.includes(cell))) {
        const steps = buildSteps(observation, waiting.template, true);
        if (steps !== null) {
            const candidate = { steps, region: waiting.template.region, nextTurn: observation.turn, requiredMagics: [] };
            forecast = (0, exports.forecastPlan)(observation, candidate, budget);
            if (forecast !== null)
                plan = candidate;
        }
    }
    if (plan === undefined && priorityItems.length === 0 && waiting === undefined && cleanupMagics.length === 0) {
        templates = (0, exports.findChainTrapTemplates)(observation);
        let bestScore = Number.NEGATIVE_INFINITY;
        for (const template of templates.slice(0, 6)) {
            const steps = buildSteps(observation, template);
            if (steps === null)
                continue;
            const candidate = { steps, region: template.region, nextTurn: observation.turn, requiredMagics: [] };
            const prediction = (0, exports.forecastPlan)(observation, candidate, budget);
            const score = prediction === null ? Number.NEGATIVE_INFINITY : prediction.deaths * 1000 - steps.length;
            if (prediction !== null && score > bestScore) {
                bestScore = score;
                plan = candidate;
                forecast = prediction;
            }
        }
    }
    const first = plan?.steps[0];
    if (plan !== undefined && first !== undefined && forecast !== null && (0, exports.safeAgainstResponses)(observation, first, budget)) {
        const steps = plan.steps.slice(1);
        const requiredMagics = [
            ...plan.requiredMagics.filter((key) => existing.has(key)),
            ...forecast.first.magics.filter((magic) => !existingIds.has(magic.id)
                && observation.characters[magic.ownerId].teamId === observation.teamId).map(magicKey),
        ];
        return { intent: first, nextRngState, nodesVisited: budget.used, profileStage: 9,
            chainPlan: { ...plan, steps, nextTurn: observation.turn + 1, requiredMagics, detonateTurn: forecast.detonateTurn } };
    }
    const action = (0, exports.fallback)(observation, templates, budget, rngState, {
        priorityItems,
        cleanupMagics,
        ...(waiting === undefined ? {} : { waitingCells: waiting.cells }),
        ...(savedPlan === undefined ? {} : { avoidRegion: savedPlan.region }),
    });
    return { intent: action, nextRngState, nodesVisited: budget.used, profileStage: 9,
        ...(cleanupMagics.length === 0 ? {} : { chainPlan: {
                nextTurn: observation.turn + 1, steps: [], region: savedPlan?.region ?? [],
                requiredMagics: cleanupMagics.map(magicKey), cleanupOnly: true,
            } }),
    };
};
exports.decideStageNine = decideStageNine;

},{"@voldecade/engine":3,"./bitboard-survival":2,"./observation":25,"./simulation":26}],
25:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toObservation = void 0;
const cloneCharacter = (character) => ({
    ...character,
    position: { ...character.position },
});
const toObservation = (state, teamId) => ({
    teamId,
    turn: state.turn,
    width: state.width,
    height: state.height,
    terrain: [...state.terrain],
    blockItems: [...state.hiddenItems],
    visibleItems: [...state.visibleItems],
    characters: state.characters.map(cloneCharacter),
    magics: state.magics.map((magic) => ({ ...magic, position: { ...magic.position } })),
});
exports.toObservation = toObservation;

},{}],
26:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.simulateTurn = exports.IDLE_INTENT = void 0;
const engine_1 = require("@voldecade/engine");
exports.IDLE_INTENT = { kind: "individual", actions: [
        { move: "NONE", placeMagic: false }, { move: "NONE", placeMagic: false },
    ] };
/** A single simultaneous turn using public information and the engine's rules. */
const simulateTurn = (observation, friendly, enemy = exports.IDLE_INTENT) => {
    const state = {
        schemaVersion: engine_1.SCHEMA_VERSION, rulesetId: engine_1.RULESET_V2.id, mode: "VERSUS",
        turn: observation.turn, width: observation.width, height: observation.height,
        terrain: observation.terrain, hiddenItems: observation.blockItems, visibleItems: observation.visibleItems,
        characters: observation.characters, magics: observation.magics,
        nextMagicId: Math.max(0, ...observation.magics.map((magic) => magic.id)) + 1,
        lastBlastCells: [], rngStates: { map: 1, items: 1, ai: [1, 1] }, outcome: { kind: "ONGOING" },
    };
    return (0, engine_1.resolveTurn)(state, observation.teamId === 0 ? [friendly, enemy] : [enemy, friendly]);
};
exports.simulateTurn = simulateTurn;

},{"@voldecade/engine":3}],
27:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decideStageEight = exports.findPincers = void 0;
const engine_1 = require("@voldecade/engine");
const stage_nine_1 = require("./stage-nine");
const directions = [['UP', -1, 0], ['RIGHT', 0, 1], ['DOWN', 1, 0], ['LEFT', 0, -1]];
const key = (m) => `${m.ownerId}:${m.placedTurn}:${m.position.row}:${m.position.col}:${m.detonateTurn}`;
// Approach from outside the target corridor so both characters visibly flank it.
const paths = (o, start, blocked) => {
    const found = new Map([[start, []]]), queue = [start];
    for (let i = 0; i < queue.length; i++) {
        const cell = queue[i];
        for (const [move, dr, dc] of directions) {
            const r = Math.floor(cell / o.width) + dr, c = cell % o.width + dc, next = r * o.width + c;
            if (r < 0 || c < 0 || r >= o.height || c >= o.width || blocked.has(next)
                || o.terrain[next] !== 'FLOOR' || found.has(next))
                continue;
            found.set(next, [...found.get(cell), move]);
            queue.push(next);
        }
    }
    return found;
};
const findPincers = (o) => {
    const ids = (0, engine_1.teamCharacterIds)(o.teamId), enemies = o.characters.filter(c => c.alive && c.teamId !== o.teamId);
    const occupied = new Set(o.magics.map(m => (0, engine_1.positionIndex)(m.position, o.width)));
    const floor = (r, c) => r >= 0 && c >= 0 && r < o.height && c < o.width && o.terrain[r * o.width + c] === 'FLOOR';
    const hard = (r, c) => r < 0 || c < 0 || r >= o.height || c >= o.width || o.terrain[r * o.width + c] === 'HARD';
    const candidates = [];
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const narrow = (r, c) => floor(r, c) && hard(r + dc, c + dr) && hard(r - dc, c - dr);
        for (let r = 0; r < o.height; r++)
            for (let c = 0; c < o.width; c++) {
                if (!narrow(r, c) || narrow(r - dr, c - dc))
                    continue;
                const region = [];
                let rr = r, cc = c;
                while (narrow(rr, cc)) {
                    region.push(rr * o.width + cc);
                    rr += dr;
                    cc += dc;
                }
                if (!floor(r - dr, c - dc) || !floor(rr, cc) || !enemies.some(e => region.includes((0, engine_1.positionIndex)(e.position, o.width))))
                    continue;
                const ends = [(r - dr) * o.width + c - dc, rr * o.width + cc];
                if (ends.some(e => occupied.has(e)))
                    continue;
                if (region.length > ids.reduce((sum, id) => sum + o.characters[id].power, 0))
                    continue;
                const blocked = new Set([...occupied, ...region]);
                const access = ids.map(id => paths(o, (0, engine_1.positionIndex)(o.characters[id].position, o.width), blocked));
                for (const swapped of [false, true]) {
                    const assigned = (swapped ? [ends[1], ends[0]] : ends);
                    const routes = access.map((p, i) => p.get(assigned[i]));
                    if (routes.some(p => !p) || ids.some(id => !o.characters[id].alive || o.characters[id].capacity <= o.magics.filter(m => m.ownerId === id).length))
                        continue;
                    const length = Math.max(1, ...routes.map(p => p.length));
                    if (length > 16)
                        continue;
                    const steps = Array.from({ length }, (_, i) => ({ kind: 'individual', actions: [0, 1].map(j => ({
                            move: routes[j][i] ?? 'NONE', placeMagic: i === length - 1,
                            ...(i === length - 1 ? { fuse: 'EIGHT_TURNS' } : {}),
                        })) }));
                    candidates.push({ ends: assigned, region, steps });
                }
            }
    }
    return candidates.sort((a, b) => a.steps.length - b.steps.length || a.ends[0] - b.ends[0]);
};
exports.findPincers = findPincers;
const decideStageEight = (o, profile, rng, saved) => {
    const budget = new stage_nine_1.Budget(profile.maxNodes), nextRngState = (0, engine_1.nextXorshift32)(rng);
    const result = (intent, chainPlan) => ({ intent, nextRngState,
        nodesVisited: budget.used, profileStage: 8, ...(chainPlan ? { chainPlan } : {}) });
    const intact = saved && saved.nextTurn === o.turn && saved.requiredMagics.every(k => o.magics.some(m => key(m) === k));
    if (intact && !saved.steps.length && o.turn < (saved.detonateTurn ?? 0)) {
        return result((0, stage_nine_1.fallback)(o, [], budget, rng, { avoidRegion: saved.region }), { ...saved, nextTurn: o.turn + 1 });
    }
    const execute = (plan) => {
        if (!plan.steps.length || !o.characters.some(c => c.alive && c.teamId !== o.teamId && plan.region.includes((0, engine_1.positionIndex)(c.position, o.width))))
            return;
        const forecast = (0, stage_nine_1.forecastPlan)(o, plan, budget);
        // Once both exits are ready, permit a dodgeable attack: the opponent can
        // escape during the placement turn. Longer commitments require a kill forecast.
        if (!forecast || (!forecast.deaths && plan.steps.length > 1) || !(0, stage_nine_1.safeAgainstResponses)(o, plan.steps[0], budget))
            return;
        const existing = new Set(o.magics.map(key));
        return result(plan.steps[0], { ...plan, steps: plan.steps.slice(1), nextTurn: o.turn + 1,
            detonateTurn: forecast.detonateTurn, requiredMagics: [...plan.requiredMagics,
                ...forecast.first.magics.filter(m => !existing.has(key(m)) && o.characters[m.ownerId].teamId === o.teamId).map(key)] });
    };
    if (intact) {
        const continued = execute(saved);
        if (continued)
            return continued;
    }
    const pincers = (0, exports.findPincers)(o);
    for (const pincer of pincers.slice(0, 8)) {
        if (budget.used > profile.maxNodes - 4000)
            break;
        const choice = execute({ nextTurn: o.turn, steps: pincer.steps, region: pincer.region, requiredMagics: [] });
        if (choice)
            return choice;
    }
    const priorityItems = (0, stage_nine_1.raceWinningItemCells)(o), pincer = pincers[0];
    // Move toward opposite exits without spending magic until the trap is verified.
    if (pincer && !priorityItems.length) {
        const first = pincer.steps[0];
        const approach = { kind: 'individual', actions: first.actions.map(a => ({ move: a.move, placeMagic: false })) };
        if ((0, stage_nine_1.safeAgainstResponses)(o, approach, budget))
            return result(approach);
    }
    return result((0, stage_nine_1.fallback)(o, [], budget, rng, { priorityItems }));
};
exports.decideStageEight = decideStageEight;

},{"@voldecade/engine":3,"./stage-nine":24}],
28:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decideStageSeven = void 0;
const engine_1 = require("@voldecade/engine");
const observation_1 = require("./observation");
const stage_nine_1 = require("./stage-nine");
const bitboard_survival_1 = require("./bitboard-survival");
const simulation_1 = require("./simulation");
const moves = [['NONE', 0, 0], ['UP', -1, 0], ['RIGHT', 0, 1], ['DOWN', 1, 0], ['LEFT', 0, -1]];
const cellOf = (o, id) => (0, engine_1.positionIndex)(o.characters[id].position, o.width);
const samePositionCell = (a, b) => a.position.row === b.position.row && a.position.col === b.position.col;
const neighbors = (o, cell) => moves.slice(1).flatMap(([, dr, dc]) => {
    const r = Math.floor(cell / o.width) + dr, c = cell % o.width + dc;
    return r >= 0 && c >= 0 && r < o.height && c < o.width && o.terrain[r * o.width + c] === 'FLOOR' ? [r * o.width + c] : [];
});
const distances = (o, start) => {
    const ds = new Map([[start, 0]]), queue = [start], blocked = new Set(o.magics.map(m => (0, engine_1.positionIndex)(m.position, o.width)));
    for (let i = 0; i < queue.length; i++)
        for (const next of neighbors(o, queue[i]))
            if (!ds.has(next) && !blocked.has(next)) {
                ds.set(next, ds.get(queue[i]) + 1);
                queue.push(next);
            }
    return ds;
};
const actions = (o, id) => {
    const c = o.characters[id], cell = cellOf(o, id), blocked = new Set(o.magics.map(m => (0, engine_1.positionIndex)(m.position, o.width)));
    const remaining = c.capacity - o.magics.filter(m => m.ownerId === id).length;
    return moves.flatMap(([move, dr, dc]) => {
        const target = (c.position.row + dr) * o.width + c.position.col + dc;
        if (move !== 'NONE' && (!neighbors(o, cell).includes(target) || blocked.has(target)))
            return [];
        const result = [{ move, placeMagic: false }];
        if (remaining > 0)
            result.push({ move, placeMagic: true, fuse: 'EIGHT_TURNS' });
        return result;
    });
};
/** Pressure play: prefer cohesion during collection, split when it buys space or an attack. */
const decideStageSeven = (o, profile, rng, saved) => {
    const budget = new stage_nine_1.Budget(profile.maxNodes), ids = (0, engine_1.teamCharacterIds)(o.teamId), enemy = o.teamId === 0 ? 1 : 0;
    const enemyIds = (0, engine_1.teamCharacterIds)(enemy), nextRngState = (0, engine_1.nextXorshift32)(rng);
    const memory = saved?.nextTurn === o.turn ? saved.human : undefined;
    const quietTurns = o.magics.some(m => m.placedTurn === o.turn) ? 0 : (memory?.quietTurns ?? 0) + 1;
    const recent = memory?.recentCells ?? [];
    const ownPaths = ids.map(id => distances(o, cellOf(o, id)));
    const enemyPaths = enemyIds.map(id => distances(o, cellOf(o, id)));
    const resources = o.terrain.some(t => t === 'SOFT') || o.visibleItems.some(Boolean);
    const targets = ids.map((id, i) => {
        const entries = [];
        o.terrain.forEach((t, cell) => {
            const item = o.visibleItems[cell] ?? o.blockItems[cell];
            if (item === null)
                return;
            const sites = t === 'SOFT' ? neighbors(o, cell) : [cell];
            const enemyDistance = Math.min(...sites.flatMap(s => enemyPaths.map(p => p.get(s) ?? 1000)));
            for (const site of sites) {
                const d = ownPaths[i].get(site);
                if (d === undefined)
                    continue;
                const useful = item === 'CAPACITY' ? Math.max(1, 5 - o.characters[id].capacity) : Math.max(1, 6 - o.characters[id].power);
                entries.push({ cell: site, value: d + (t === 'SOFT' ? 5 : 0) - useful * 2 + (d > enemyDistance ? 4 : 0) });
            }
        });
        entries.sort((a, b) => a.value - b.value || a.cell - b.cell);
        return entries[0]?.cell;
    });
    const targetPaths = targets.map(t => t === undefined ? undefined : distances(o, t));
    const enemyBase = (0, bitboard_survival_1.getTeamReachableCountsForTurnsBitboard)({ ...o, teamId: enemy }, 9);
    const alreadyDestroyed = new Set((0, engine_1.collectBlastClosure)(o.terrain, o.width, o.height, o.magics, o.turn + 9).destroyedSoftCells.map(p => (0, engine_1.positionIndex)(p, o.width)));
    const choices = [];
    for (const first of actions(o, ids[0]))
        for (const second of actions(o, ids[1])) {
            if (!budget.take(20))
                continue;
            const intent = { kind: 'individual', actions: [first, second] };
            const result = (0, simulation_1.simulateTurn)(o, intent), next = (0, observation_1.toObservation)(result.state, o.teamId);
            const own = (0, bitboard_survival_1.getTeamReachableCountsForTurnsBitboard)(next, 8);
            const opposing = (0, bitboard_survival_1.getTeamReachableCountsForTurnsBitboard)({ ...next, teamId: enemy }, 8);
            let score = own.filter(Boolean).length * 10000000 - opposing.filter(v => v > 0).length * 1000000;
            score += Math.min(...own) * 3;
            const placed = next.magics.filter(m => m.placedTurn === next.turn && ids.includes(m.ownerId));
            const closure = placed.length ? (0, engine_1.collectBlastClosure)(next.terrain, next.width, next.height, next.magics, next.turn + 8) : undefined;
            const soft = closure?.destroyedSoftCells ?? [];
            score += soft.reduce((sum, p) => sum + (alreadyDestroyed.has((0, engine_1.positionIndex)(p, o.width)) ? 0 : o.blockItems[(0, engine_1.positionIndex)(p, o.width)] !== null ? 180 : 60), 0);
            const baseMin = Math.min(...enemyBase), remaining = Math.min(...opposing);
            // Reducing the opponent's actual timed escape set is valuable before a kill exists.
            score += (baseMin - remaining) * (resources ? 6 : 24);
            ids.forEach((id, i) => {
                const cell = cellOf(next, id), c = next.characters[id];
                score += (c.power - o.characters[id].power + c.capacity - o.characters[id].capacity) * 500;
                if (resources && targetPaths[i])
                    score -= Math.min(targetPaths[i].get(cell) ?? 100, 100) * 20;
                else
                    score -= Math.min(...enemyPaths.map(p => p.get(cell) ?? 100)) * 8;
                // Avoid a deterministic orbit after prolonged inactivity without sacrificing survival.
                if (quietTurns >= 12)
                    score -= recent.filter(x => x === cell).length * 3;
            });
            const separation = Math.abs(next.characters[ids[0]].position.row - next.characters[ids[1]].position.row)
                + Math.abs(next.characters[ids[0]].position.col - next.characters[ids[1]].position.col);
            if (resources)
                score -= separation * 32;
            else if (placed.length)
                score += Math.min(separation, 4) * 6;
            // Keep ammunition unless a placement actually attacks or opens a resource route.
            score -= placed.length * 3;
            rng = (0, engine_1.nextXorshift32)(rng);
            score += rng / 0x100000000 * 0.1;
            choices.push({ intent, score });
        }
    choices.sort((a, b) => b.score - a.score);
    // An opponent can first approach an exit, then seal it on the following turn.
    // Include both enemies closing different exits, not just isolated single spells.
    const counters = enemyIds.flatMap(id => {
        const c = o.characters[id];
        if (!c.alive || c.capacity <= o.magics.filter(m => m.ownerId === id).length)
            return [];
        const reachable = enemyPaths[enemyIds.indexOf(id)];
        return [...reachable].filter(([, d]) => d <= 2).map(([cell]) => ({ id: 1000000 + id * 1000 + cell, ownerId: id,
            position: { row: Math.floor(cell / o.width), col: cell % o.width }, power: c.power, placedTurn: o.turn + 2, detonateTurn: o.turn + 10 }));
    });
    const proximity = (m) => Math.min(...ids.map(id => Math.abs(o.characters[id].position.row - m.position.row) + Math.abs(o.characters[id].position.col - m.position.col)));
    const pairs = counters.filter(m => m.ownerId === enemyIds[0]).flatMap(first => counters.filter(m => m.ownerId === enemyIds[1] && !samePositionCell(first, m)).map(second => [first, second]))
        .sort((a, b) => proximity(a[0]) + proximity(a[1]) - proximity(b[0]) - proximity(b[1])).slice(0, 24);
    const threats = [...pairs, ...counters.map(m => [m])];
    const shortlist = choices.slice(0, 12);
    const forecasts = shortlist.map(choice => ({ choice, next: (0, observation_1.toObservation)((0, simulation_1.simulateTurn)(o, choice.intent).state, o.teamId), worst: 2, space: Infinity }));
    // Each candidate sees the same threats. Reserve nodes for immediate responses.
    for (const threat of threats) {
        if (budget.used + forecasts.length * 9 > budget.limit - 4000)
            break;
        for (const forecast of forecasts) {
            budget.take(9);
            const counts = (0, bitboard_survival_1.getTeamReachableCountsForTurnsBitboard)(forecast.next, 9, threat);
            forecast.worst = Math.min(forecast.worst, counts.filter(Boolean).length);
            forecast.space = Math.min(forecast.space, ...counts);
        }
    }
    for (const { choice, worst, space } of forecasts)
        choice.score -= (2 - worst) * 4000000 - (Number.isFinite(space) ? space * 6 : 0);
    shortlist.sort((a, b) => b.score - a.score);
    const ordered = [...shortlist, ...choices.slice(12)];
    let selected = ordered[0]?.intent ?? { kind: 'individual', actions: [{ move: 'NONE', placeMagic: false }, { move: 'NONE', placeMagic: false }] };
    for (const choice of ordered) {
        if (budget.used + 9 > budget.limit)
            break;
        if ((0, stage_nine_1.safeAgainstResponses)(o, choice.intent, budget)) {
            selected = choice.intent;
            break;
        }
    }
    const sameCell = cellOf(o, ids[0]) === cellOf(o, ids[1]);
    const sameAction = JSON.stringify(selected.actions[0]) === JSON.stringify(selected.actions[1]);
    const resultIntent = sameCell && sameAction ? { kind: 'group', ...selected.actions[0] } : selected;
    return { intent: resultIntent, nextRngState, nodesVisited: budget.used, profileStage: 7,
        chainPlan: { nextTurn: o.turn + 1, steps: [], region: [], requiredMagics: [],
            human: { quietTurns, recentCells: [...recent, ...ids.map(id => cellOf(o, id))].slice(-16) } } };
};
exports.decideStageSeven = decideStageSeven;

},{"@voldecade/engine":3,"./observation":25,"./stage-nine":24,"./bitboard-survival":2,"./simulation":26}],
29:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAiProfile = exports.AI_PROFILES = exports.AI_VERSION = void 0;
const engine_1 = require("@voldecade/engine");
exports.AI_VERSION = engine_1.AI_VERSION;
const nodeLimits = [64, 128, 256, 512, 1000, 10000, 12000, 12000, 12000, 12000];
const candidateLimits = [4, 8, 12, 18, 26, 38, 52, 68, 100, 100];
const openingRisks = [9900, 8120, 6660, 5800, 4480, 3670, 2600, 2000, 100, 100];
const dangerHorizons = [1, 2, 2, 4, 4, 5, 6, 7, 8, 8];
exports.AI_PROFILES = Object.freeze(nodeLimits.map((maxNodes, index) => {
    const stage = index + 1;
    return Object.freeze({
        stage,
        maxNodes,
        candidateLimit: candidateLimits[index],
        dangerHorizon: dangerHorizons[index],
        survivalWeight: 3000,
        mobilityWeight: 8,
        itemWeight: 16,
        attackWeight: 5,
        softBlockWeight: 6,
        openingRiskBasisPoints: openingRisks[index],
    });
}));
const getAiProfile = (stage) => {
    if (!Number.isInteger(stage) || stage < 1 || stage > 10)
        throw new RangeError("AI stage must be from 1 to 10");
    return exports.AI_PROFILES[stage - 1];
};
exports.getAiProfile = getAiProfile;

},{"@voldecade/engine":3}]});
