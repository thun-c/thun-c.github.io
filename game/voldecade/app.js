(function(modules){const cache={};function load(id){if(cache[id])return cache[id].exports;const record=modules[id];if(!record)throw new Error("Missing module "+id);const module={exports:{}};cache[id]=module;record[0](module,module.exports,(name)=>load(record[1][name]));return module.exports;}load(0);})({0:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const replay_1 = require("@voldecade/replay");
const engine_1 = require("@voldecade/engine");
const game_session_1 = require("./game-session");
const keyboard_1 = require("./keyboard");
const ai_worker_client_1 = require("./ai-worker-client");
const persistence_1 = require("./persistence");
const replay_player_1 = require("./replay-player");
const settings_1 = require("./settings");
const character_sprites_1 = require("./character-sprites");
const sprite_assets_1 = require("./sprite-assets");
const magic_sprites_1 = require("./magic-sprites");
const board_layout_1 = require("./board-layout");
const view_1 = require("./view");
const ranking_1 = require("./ranking");
const online_ranking_1 = require("./online-ranking");
const audio_1 = require("./audio");
const board_assets_1 = require("./board-assets");
const onlineProgress = {
    ranking: "ランキングを読み込み中…",
    login: "ログイン中…",
    submit: "スコアを送信中…",
};
const REPLAY_VIDEO_FPS = 30;
const REPLAY_VIDEO_TURN_MS = 500;
const REPLAY_VIDEO_FRAMES_PER_TURN = REPLAY_VIDEO_FPS * REPLAY_VIDEO_TURN_MS / 1000;
const escapeHtml = (value) => String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const root = document.querySelector("#app");
if (root === null)
    throw new Error("#app is required");
const DEVELOPMENT_STAGE_CONTROL = "";
const DEVELOPMENT_BUILD = String("false") === "true";
class BrowserApp {
    constructor(element) {
        this.element = element;
        this.sprites = new character_sprites_1.CharacterSpriteLayer();
        this.magicSprites = new magic_sprites_1.MagicSpriteLayer();
        this.route = "home";
        this.session = null;
        this.warning = null;
        this.settings = (0, settings_1.loadSettings)(localStorage);
        this.store = new persistence_1.IndexedDbLocalStore();
        this.tutorialStep = localStorage.getItem("voldecade-tutorial-v1") === "done" ? 4 : 0;
        this.ai = new ai_worker_client_1.AiWorkerClient(new Worker("./ai-worker.js?v=37e3bb37dd1553f3"));
        this.audio = new audio_1.SoundManager();
        this.confirming = false;
        this.confirmationId = 0;
        this.developmentPractice = false;
        this.replayTimeline = null;
        this.replayRecords = [];
        this.replayListRenderId = 0;
        this.replayDeleteTarget = null;
        this.replayDeleting = false;
        this.replayFrame = 0;
        this.replayPlaying = false;
        this.replaySpeed = 1;
        this.replayTimer = null;
        this.replayExporting = false;
        this.replayExportUiVisible = false;
        this.replayExportProgress = "";
        this.replayExportNotice = null;
        this.replayVideoImages = new Map();
        this.stageTransitionState = null;
        this.stageTransitionTimer = null;
        this.rankingRecordedSeed = null;
        this.resultPopupOpen = false;
        this.resultPopupPending = false;
        this.resultPopupTimer = null;
        this.resultPersonalBest = false;
        this.completedReplay = null;
        this.resultSubmissionPending = false;
        this.submittedResultAccounts = new Set();
        this.shareVideo = null;
        this.onlineOperation = null;
        this.onlineNotice = null;
        this.onlineEntries = null;
        this.onlineRankingUpdatedAt = null;
        this.onlineRankingRefreshing = false;
        this.onlineRankingError = null;
        this.onlineName = "";
        this.onlineSlow = false;
        element.addEventListener("click", (event) => { void this.onClick(event); });
        document.addEventListener("keydown", (event) => this.onKeyDown(event));
        element.addEventListener("change", (event) => this.onChange(event));
        element.addEventListener("input", (event) => {
            if (event.target.matches("[data-replay-seek], #online-name"))
                this.onChange(event);
        });
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden && this.resultPopupPending)
                this.scheduleResultPopup();
            if (document.hidden) {
                this.pauseReplay();
                this.audio.pause();
            }
            if (this.route === "game" && this.session !== null && document.hidden) {
                this.session = (0, game_session_1.setSessionPaused)(this.session, true);
                this.render();
            }
        });
        void this.store.listReplays().catch(() => { });
        this.render();
    }
    async onClick(event) {
        if (this.onlineOperation !== null || this.replayExporting || this.replayDeleting)
            return;
        const button = event.target.closest("button");
        if (button === null || button.disabled)
            return;
        const route = button.dataset.route;
        if (route !== undefined) {
            this.dismissResultPopup();
            this.resultSubmissionPending = false;
            if (route !== "game" && route !== "replay")
                this.audio.stop();
            this.clearStageTransition();
            this.pauseReplay();
            this.warning = null;
            this.onlineNotice = null;
            this.route = route;
            this.replayDeleteTarget = null;
            if (route === "ranking")
                await this.loadOnlineRanking();
            else
                this.render();
            return;
        }
        const action = button.dataset.action;
        if (this.onlineRankingRefreshing && this.isOnlineRequestAction(action))
            return;
        if (this.stageTransitionState !== null)
            return;
        this.onlineNotice = null;
        if (action !== "verify-replay")
            this.warning = null;
        try {
            if (action === "new") {
                this.dismissResultPopup();
                this.completedReplay = null;
                this.resultPersonalBest = false;
                this.resultSubmissionPending = false;
                this.submittedResultAccounts.clear();
                this.clearShareVideo();
                this.clearStageTransition();
                this.confirmationId += 1;
                this.confirming = false;
                const stageSelector = this.element.querySelector("[data-development-stage]");
                const stageNumber = stageSelector === null ? 1 : Number(stageSelector.value);
                this.developmentPractice = stageSelector !== null;
                this.session = (0, game_session_1.createGameSession)(Date.now() >>> 0, stageNumber);
                this.audio.start();
                this.route = "game";
            }
            else if (action === "close-result-popup") {
                this.dismissResultPopup();
            }
            else if (action === "open-result-popup" && this.session !== null) {
                if (this.session.run.controller.state.outcome.kind === "ONGOING")
                    return;
                this.dismissResultPopup();
                this.resultPopupOpen = true;
                this.audio.stop();
            }
            else if (action === "share-result-video" && this.session !== null) {
                if (this.session.run.controller.state.outcome.kind === "ONGOING")
                    return;
                this.dismissResultPopup();
                this.audio.stop();
                this.pauseReplay();
                this.route = "share";
                this.render();
                if (this.shareVideo === null) {
                    this.replayTimeline = (0, replay_player_1.buildReplayTimeline)(this.completedReplay ?? (0, replay_1.encodeCampaignReplay)(this.session.run));
                    await this.exportReplayVideo(true);
                }
                return;
            }
            else if (action === "show-result" && this.session !== null) {
                if (this.session.run.controller.state.outcome.kind === "ONGOING")
                    throw new Error("ゲームはまだ終了していません");
                this.dismissResultPopup();
                this.audio.stop();
                this.route = "result";
            }
            else if (action === "submit-online" && this.session !== null) {
                if (this.developmentPractice || this.session.run.controller.state.outcome.kind === "ONGOING")
                    return;
                this.dismissResultPopup();
                this.audio.stop();
                this.route = "result";
                if ((0, online_ranking_1.getOnlineAuth)() === null) {
                    this.resultSubmissionPending = true;
                    this.route = "ranking";
                    await this.loadOnlineRanking("今回の記録を送信するには、新規登録またはログインしてください。");
                    return;
                }
                const accountName = (0, online_ranking_1.getOnlineAuth)().name;
                if (this.submittedResultAccounts.has(accountName)) {
                    this.render();
                    return;
                }
                const score = (0, engine_1.getCampaignScore)(this.session.run.controller);
                await this.runOnlineOperation("submit", async () => {
                    const result = await (0, online_ranking_1.submitOnlineScore)(score);
                    this.submittedResultAccounts.add(accountName);
                    return result.duplicate ? "このスコアはすでに登録されています。" : "オンラインランキングへ登録しました。";
                });
                return;
            }
            else if (action === "online-google-login") {
                const name = this.element.querySelector("#online-name")?.value ?? "";
                this.onlineName = name;
                await this.runOnlineOperation("login", async () => {
                    await (0, online_ranking_1.signInOnline)(name);
                    if (this.resultSubmissionPending && this.session !== null && this.session.run.controller.state.outcome.kind !== "ONGOING") {
                        this.resultSubmissionPending = false;
                        this.route = "result";
                        this.resultPopupOpen = true;
                    }
                    return "Googleアカウントでログインしました。今回の記録は結果画面から送信できます。";
                });
                return;
            }
            else if (action === "online-refresh") {
                await this.loadOnlineRanking(undefined, true);
                return;
            }
            else if (action === "online-logout") {
                (0, online_ranking_1.logoutOnline)();
                this.onlineNotice = { kind: "success", message: "ログアウトしました。" };
            }
            else if (action === "mode-toggle" && this.session !== null) {
                this.session = (0, game_session_1.changeControlMode)(this.session, this.session.input.control.mode === "GROUP" ? "INDIVIDUAL" : "GROUP");
            }
            else if ((button.dataset.direction !== undefined || button.dataset.magicDirection !== undefined) && this.session !== null) {
                const direction = (button.dataset.direction ?? button.dataset.magicDirection);
                if (!(0, game_session_1.isDirectionAvailable)(this.session, direction, button.dataset.magicDirection !== undefined))
                    return;
                this.session = (0, game_session_1.setDraftDirectionWithPlacement)(this.session, direction, button.dataset.magicDirection !== undefined);
                if ((0, game_session_1.quickDraftIsComplete)(this.session)) {
                    this.render();
                    await this.confirm();
                }
                else {
                    this.session = (0, game_session_1.selectNextUndraftedCharacter)(this.session);
                }
            }
            else if (action === "place" && this.session !== null) {
                this.session = (0, game_session_1.toggleDraftPlacement)(this.session);
            }
            else if (action === "fuse" && this.session !== null) {
                const draft = this.session.input.draft;
                const current = draft?.kind === "group"
                    ? draft.fuse
                    : draft?.kind === "individual"
                        ? draft.actions[this.session.input.control.selectedCharacterId === 0 ? 0 : 1].fuse
                        : "EIGHT_TURNS";
                this.session = (0, game_session_1.setDraftFuse)(this.session, current === "INFINITE" ? "EIGHT_TURNS" : "INFINITE");
            }
            else if (action === "resume" && this.session !== null) {
                this.session = (0, game_session_1.setSessionPaused)(this.session, false);
                this.audio.resume();
            }
            else if (action === "tutorial-next") {
                this.tutorialStep = Math.min(4, this.tutorialStep + 1);
                if (this.tutorialStep === 4)
                    localStorage.setItem("voldecade-tutorial-v1", "done");
            }
            else if (action === "verify-replay" && DEVELOPMENT_BUILD) {
                await this.importReplay();
            }
            else if (action === "export-replay" && DEVELOPMENT_BUILD) {
                await this.exportReplay(Number(button.dataset.index));
                return;
            }
            else if (action === "export-replay-video") {
                await this.exportReplayVideo();
                return;
            }
            else if (action === "load-replay") {
                await this.loadReplay(Number(button.dataset.index));
            }
            else if (action === "delete-replay" && this.route === "replays") {
                const record = this.replayRecords[Number(button.dataset.index)];
                if (record === undefined)
                    throw new Error("リプレイが見つかりません");
                this.replayDeleteTarget = record;
                this.route = "delete-replay";
            }
            else if (action === "confirm-delete-replay" && this.route === "delete-replay" && this.replayDeleteTarget !== null) {
                this.replayDeleting = true;
                this.render();
                try {
                    await this.store.deleteReplay(this.replayDeleteTarget.key);
                    this.replayDeleteTarget = null;
                    this.warning = "リプレイを削除しました。";
                    this.route = "replays";
                }
                finally {
                    this.replayDeleting = false;
                }
            }
            else if (action === "replay-play") {
                if (this.replayTimeline !== null && this.replayFrame === this.replayTimeline.frames.length - 1)
                    this.replayFrame = 0;
                this.replayPlaying = !this.replayPlaying;
                this.scheduleReplay();
            }
            else if (action === "replay-first") {
                this.setReplayFrame(0);
            }
            else if (action === "replay-last" && this.replayTimeline !== null) {
                this.setReplayFrame(this.replayTimeline.frames.length - 1);
            }
            else if (action === "replay-prev") {
                this.setReplayFrame(this.replayFrame - 1);
            }
            else if (action === "replay-next") {
                this.setReplayFrame(this.replayFrame + 1);
            }
            else if (action === "replay-stage-prev" && this.replayTimeline !== null) {
                this.setReplayFrame((0, replay_player_1.adjacentStageFrame)(this.replayTimeline, this.replayFrame, -1));
            }
            else if (action === "replay-stage-next" && this.replayTimeline !== null) {
                this.setReplayFrame((0, replay_player_1.adjacentStageFrame)(this.replayTimeline, this.replayFrame, 1));
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (action === "online-logout")
                this.onlineNotice = { kind: "error", message };
            else
                this.warning = message;
        }
        this.render();
    }
    onKeyDown(event) {
        if (this.onlineOperation !== null || this.replayExporting || this.replayDeleting)
            return;
        if (this.route !== "game" || this.session === null || this.tutorialStep < 4 || this.stageTransitionState !== null)
            return;
        if (this.session.run.controller.state.outcome.kind !== "ONGOING")
            return;
        if (event.repeat || event.ctrlKey || event.metaKey || event.altKey)
            return;
        const target = event.target;
        if (target instanceof HTMLElement) {
            if (target.matches("input, textarea, select") || target.isContentEditable)
                return;
        }
        const direction = (0, keyboard_1.directionForKeyboardEvent)(event);
        if (direction !== undefined) {
            if (!(0, game_session_1.isDirectionAvailable)(this.session, direction, event.shiftKey))
                return;
            if (event.shiftKey)
                this.session = (0, game_session_1.requestDraftPlacement)(this.session);
            this.session = (0, game_session_1.setDraftDirection)(this.session, direction);
            if ((0, game_session_1.quickDraftIsComplete)(this.session))
                void this.confirm().then(() => this.render());
            else
                this.session = (0, game_session_1.selectNextUndraftedCharacter)(this.session);
        }
        else if (event.key === "f" || event.key === "F") {
            const draft = this.session.input.draft;
            const current = draft?.kind === "group"
                ? draft.fuse
                : draft?.kind === "individual"
                    ? draft.actions[this.session.input.control.selectedCharacterId === 0 ? 0 : 1].fuse
                    : "EIGHT_TURNS";
            this.session = (0, game_session_1.setDraftFuse)(this.session, current === "INFINITE" ? "EIGHT_TURNS" : "INFINITE");
        }
        else
            return;
        event.preventDefault();
        this.render();
    }
    onChange(event) {
        if (this.onlineOperation !== null || this.replayExporting || this.replayDeleting)
            return;
        const input = event.target;
        if (input.id === "online-name") {
            this.onlineName = input.value;
            return;
        }
        if (input.matches("[data-replay-seek]") && this.replayTimeline !== null) {
            this.setReplayFrame(Number(input.value));
            this.render();
            return;
        }
        if (input.matches("[data-replay-speed]")) {
            this.replaySpeed = Number(input.value);
            this.scheduleReplay();
            this.render();
            return;
        }
        if (!input.matches("[data-setting]"))
            return;
        const key = input.dataset.setting;
        if (key === "volume")
            this.settings = { ...this.settings, volume: Number(input.value) };
        (0, settings_1.saveSettings)(localStorage, this.settings);
        this.audio.setVolume(this.settings.volume);
        this.applySettings();
    }
    async confirm() {
        if (this.session === null || this.confirming)
            return;
        const sessionAtRequest = this.session;
        const confirmationId = ++this.confirmationId;
        this.confirming = true;
        try {
            const decision = await this.ai.decide(sessionAtRequest.run.controller.state, sessionAtRequest.run.chainPlan);
            if (confirmationId !== this.confirmationId || this.session !== sessionAtRequest)
                return;
            const confirmed = (0, game_session_1.confirmDraftWithAiDecision)(sessionAtRequest, decision);
            this.session = confirmed.session;
            this.audio.playEvents(confirmed.session.events);
            if (confirmed.stageTransitionState !== undefined)
                this.deferStageSwitch(confirmed.stageTransitionState);
            if (this.session.run.controller.state.outcome.kind !== "ONGOING") {
                const replay = (0, replay_1.encodeCampaignReplay)(this.session.run);
                this.completedReplay = replay;
                this.resultPopupPending = !this.developmentPractice;
                if (!this.developmentPractice && this.rankingRecordedSeed !== this.session.run.controller.seedRoot) {
                    const score = (0, engine_1.getCampaignScore)(this.session.run.controller);
                    const previous = (0, ranking_1.loadLocalRanking)()[0];
                    this.resultPersonalBest = previous !== undefined && (0, ranking_1.compareCampaignScores)(score, previous.score) < 0;
                    try {
                        (0, ranking_1.recordLocalRanking)({ id: `${Date.now()}-${this.session.run.controller.seedRoot}`, createdAt: Date.now(), seed: this.session.run.controller.seedRoot, score });
                    }
                    catch { /* Results remain usable without local storage. */ }
                    this.rankingRecordedSeed = this.session.run.controller.seedRoot;
                }
                this.render();
                try {
                    await this.store.saveReplay(replay);
                }
                catch { /* campaign result remains usable */ }
            }
        }
        catch (error) {
            if (confirmationId === this.confirmationId)
                this.warning = error instanceof Error ? error.message : String(error);
        }
        finally {
            if (confirmationId === this.confirmationId)
                this.confirming = false;
        }
    }
    /** Keep the cleared stage visible until the victory motion has finished. */
    deferStageSwitch(state) {
        this.clearStageTransition();
        this.stageTransitionState = state;
        this.sprites.clear();
        this.magicSprites.clear();
        this.stageTransitionTimer = window.setTimeout(() => {
            this.stageTransitionTimer = null;
            this.stageTransitionState = null;
            this.render();
        }, (0, sprite_assets_1.spritesForCharacter)(0, state).winMs);
    }
    clearStageTransition() {
        if (this.stageTransitionTimer !== null)
            window.clearTimeout(this.stageTransitionTimer);
        this.stageTransitionTimer = null;
        this.stageTransitionState = null;
    }
    dismissResultPopup() {
        if (this.resultPopupTimer !== null)
            window.clearTimeout(this.resultPopupTimer);
        this.resultPopupTimer = null;
        this.resultPopupPending = false;
        this.resultPopupOpen = false;
    }
    scheduleResultPopup() {
        if (this.resultPopupTimer !== null)
            window.clearTimeout(this.resultPopupTimer);
        this.resultPopupTimer = null;
        if (!this.resultPopupPending || this.route !== "game" || this.session === null || document.hidden)
            return;
        const state = this.session.run.controller.state;
        if (state.outcome.kind === "ONGOING")
            return;
        const events = this.session.events;
        const durations = !(0, sprite_assets_1.characterSpritesEnabled)() ? [] : state.characters.map((character) => {
            const config = (0, sprite_assets_1.spritesForCharacter)(character.id, state);
            const moving = events.some(event => event.kind === "MOVED" && event.characterId === character.id) ? config.moveMs : 0;
            const placing = events.some(event => event.kind === "MAGIC_PLACED" && event.ownerId === character.id) ? config.setMs : 0;
            const winning = events.some(event => event.kind === "STAGE_CLEARED") && character.teamId === 0
                || state.characters.filter(c => c.teamId === character.teamId && c.alive).length > state.characters.filter(c => c.teamId !== character.teamId && c.alive).length;
            const ending = !character.alive ? (0, sprite_assets_1.motionDuration)(config, "lose", "f", (0, sprite_assets_1.spriteFrames)(character.id, "lose", "f", state).length)
                : winning ? config.winMs : 0;
            return moving + placing + ending;
        });
        this.resultPopupTimer = window.setTimeout(() => {
            this.resultPopupTimer = null;
            if (this.route !== "game" || !this.resultPopupPending || document.hidden)
                return;
            this.resultPopupPending = false;
            this.resultPopupOpen = true;
            this.audio.stop();
            // Keep the final board intact so its animations do not restart.
            this.renderResultPopup();
            this.updateOnlineRankingControls();
        }, Math.max(1000, ...durations));
    }
    clearShareVideo() {
        if (this.shareVideo !== null)
            URL.revokeObjectURL(this.shareVideo.url);
        this.shareVideo = null;
    }
    resultSubmitted() {
        const account = (0, online_ranking_1.getOnlineAuth)();
        return account !== null && this.submittedResultAccounts.has(account.name);
    }
    resultSubmitLabel() {
        return this.resultSubmitted() ? "ランキング登録済み" : this.onlineOperation === "submit" ? onlineProgress.submit
            : this.onlineRankingRefreshing ? "ランキング更新中…" : "この記録をランキングに登録";
    }
    resultSummary() {
        const score = (0, engine_1.getCampaignScore)(this.session.run.controller);
        return {
            title: score.clearedStages > 0 ? `${score.clearedStages}ステージクリア！` : "今回の記録",
            details: `${score.turnsToLastClear === null ? "クリアなし" : `最終クリアまで${score.turnsToLastClear}ターン`} ／ 撃墜差 ${score.killDifference >= 0 ? "+" : ""}${score.killDifference}`,
        };
    }
    renderResultPopup() {
        if (!this.resultPopupOpen || this.session === null || this.developmentPractice || this.session.run.controller.state.outcome.kind === "ONGOING"
            || !["game", "result"].includes(this.route) || this.onlineOperation !== null || this.replayExporting)
            return;
        if (this.element.querySelector("[data-result-popup]") !== null)
            return;
        const summary = this.resultSummary();
        this.element.insertAdjacentHTML("beforeend", `<dialog class="result-popup" data-result-popup aria-labelledby="result-popup-title" closedby="none">
      <button class="result-popup-close" data-action="close-result-popup" aria-label="記録のポップアップを閉じる">×</button>
      <h2 id="result-popup-title">${summary.title}</h2>
      ${this.resultPersonalBest ? '<p class="personal-best">この端末での自己ベスト更新！</p>' : ""}
      <p class="result-popup-score">${summary.details}</p>
      ${this.renderOnlineNotice()}
      <div class="result-popup-actions">
        <button class="primary" data-action="submit-online" ${this.resultSubmitted() || this.onlineRankingRefreshing ? "disabled" : "autofocus"}>${this.resultSubmitLabel()}</button>
        <button data-action="share-result-video">動画を作ってXで公開</button>
        <button data-action="new">もう一度遊ぶ</button>
      </div></dialog>`);
        const dialog = this.element.querySelector("[data-result-popup]");
        dialog?.addEventListener("cancel", event => event.preventDefault());
        dialog?.showModal();
    }
    renderShare() {
        const summary = this.session === null ? { title: "プレイ動画", details: "" } : this.resultSummary();
        const text = `VOLDECADEで${summary.title}\n${summary.details}\n#VOLDECADE`;
        const intent = "https://x.com/intent/tweet?text=" + encodeURIComponent(text);
        return `<main class="screen text-screen share-screen"><button data-route="result">← 今回の記録に戻る</button><h1>動画をXで公開</h1>
      <p>${summary.title} ${summary.details}</p>
      ${this.shareVideo === null ? `<p>ハイライト動画を作成して、ここで確認できます。</p>
        ${this.warning === null ? "" : `<p class="warning" role="alert">${escapeHtml(this.warning)}</p>`}
        <button data-action="share-result-video">動画を作成する</button>` : `<video class="share-video" controls playsinline preload="metadata" src="${escapeHtml(this.shareVideo.url)}" aria-label="投稿するハイライト動画"></video>
        <p>動画を保存し、Xの投稿画面で添付してください。投稿文は用意してあります。</p>
        ${this.shareVideo.mp4 ? "" : '<p class="warning">このブラウザではWebM形式になります。Xに動画を添付するには、保存後にMP4へ変換してください。</p>'}
        <div class="share-actions"><a class="button-link" href="${escapeHtml(this.shareVideo.url)}" download="${escapeHtml(this.shareVideo.filename)}">① 動画を保存</a>
          <a class="button-link primary" href="${escapeHtml(intent)}" target="_blank" rel="noopener noreferrer">② Xの投稿画面を開く</a></div>`}
      </main>`;
    }
    async importReplay() {
        const text = this.element.querySelector("#replay-json")?.value ?? "";
        const replay = JSON.parse(text);
        (0, replay_1.verifyCampaignReplay)(replay);
        await this.store.saveReplay(replay);
        this.openReplay(replay);
    }
    async loadReplay(index) {
        const record = this.replayRecords[index];
        if (record === undefined)
            throw new Error("リプレイが見つかりません");
        this.openReplay(record.replay);
    }
    async exportReplay(index) {
        const replay = this.replayRecords[index]?.replay;
        if (replay === undefined)
            throw new Error("リプレイが見つかりません");
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([JSON.stringify(replay, null, 2)], { type: "application/json" }));
        link.download = `voldecade-replay-${replay.seed}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
    }
    async exportReplayVideo(forSharing = false) {
        if (this.replayTimeline === null || this.replayExporting)
            return;
        if (typeof MediaRecorder === "undefined")
            throw new Error("このブラウザは動画書き出しに対応していません。");
        const timeline = this.replayTimeline;
        const highlight = (0, replay_player_1.selectReplayHighlight)(timeline);
        if (highlight === null)
            throw new Error("動画にできるターンがありません。");
        const { start, end } = highlight;
        const clipTurns = end - start + 1;
        const finalFrame = timeline.frames[end];
        const finalState = finalFrame.videoState ?? finalFrame.run.controller.state;
        const victoryMs = finalFrame.events.some((event) => event.kind === "STAGE_CLEARED")
            ? (0, sprite_assets_1.spritesForCharacter)(0, finalState).winMs : 0;
        const clipSeconds = Number((clipTurns / 2 + victoryMs / 1000).toFixed(2));
        const canvas = document.createElement("canvas");
        canvas.width = 720;
        canvas.height = 720;
        this.pauseReplay();
        this.replayExporting = true;
        this.replayExportProgress = "画像と音声を準備しています…";
        this.replayExportNotice = null;
        this.render();
        let stream = null;
        try {
            if (typeof canvas.captureStream !== "function")
                throw new Error("このブラウザは動画書き出しに対応していません。");
            if (timeline.frames.slice(start, end + 1).some((frame) => (frame.videoState ?? frame.run.controller.state).lastBlastCells.length > 0)) {
                await Promise.all(["fire_0.png", "fire_1.png"].map((file) => this.loadReplayVideoImage((0, magic_sprites_1.magicSpriteUrl)(file))));
            }
            // Finish loading the ending before recording so image requests cannot
            // stretch the victory motion beyond the game's configured duration.
            if (victoryMs > 0) {
                const endingUrls = finalState.characters.flatMap((character) => {
                    const motion = !character.alive ? "lose" : character.teamId === 0 ? "win" : "stand";
                    return (0, sprite_assets_1.spriteFrames)(character.id, motion, "f", finalState);
                });
                await Promise.all(endingUrls.map((url) => this.loadReplayVideoImage(url)));
            }
            if (!await this.audio.startAndWait())
                throw new Error("音声を準備できないため、動画を書き出せません。");
            stream = canvas.captureStream(30);
            const audioTrack = this.audio.captureAudioTrack();
            if (audioTrack === null)
                throw new Error("このブラウザは動画への音声収録に対応していません。");
            stream.addTrack(audioTrack);
            const mimeType = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm"]
                .find((type) => MediaRecorder.isTypeSupported(type));
            if (mimeType === undefined)
                throw new Error("このブラウザで利用できる動画形式がありません。");
            const chunks = [];
            const videoFacing = ["f", "f", "f", "f"];
            const applyFacingEvents = (events) => {
                for (const event of events) {
                    if (event.kind !== "MOVED")
                        continue;
                    videoFacing[event.characterId] = event.to.row < event.from.row
                        ? "b"
                        : event.to.row > event.from.row
                            ? "f"
                            : event.to.col < event.from.col ? "l" : "r";
                }
            };
            for (let index = 0; index < start; index += 1) {
                applyFacingEvents(timeline.frames[index].events);
                if (timeline.frames[index].events.some((event) => event.kind === "STAGE_STARTED"))
                    videoFacing.fill("f");
            }
            const recorded = new Promise((resolve, reject) => {
                const recorder = new MediaRecorder(stream, { mimeType });
                recorder.ondataavailable = (event) => { if (event.data.size > 0)
                    chunks.push(event.data); };
                recorder.onerror = () => reject(new Error("動画の書き出しに失敗しました。"));
                recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
                recorder.start();
                void (async () => {
                    try {
                        for (let index = start; index <= end; index += 1) {
                            this.updateReplayExportProgress(`動画を作成しています… ${index - start + 1} / ${clipTurns}ターン`);
                            const previous = index > 0 ? timeline.frames[index - 1] : timeline.frames[index];
                            applyFacingEvents(timeline.frames[index].events);
                            this.audio.playEvents(timeline.frames[index].events);
                            for (let subframe = 0; subframe < REPLAY_VIDEO_FRAMES_PER_TURN; subframe += 1) {
                                await this.drawReplayVideoFrame(canvas, previous, timeline.frames[index], subframe / REPLAY_VIDEO_FRAMES_PER_TURN, videoFacing, index, start, end);
                                await new Promise((resolve) => window.setTimeout(resolve, 1000 / REPLAY_VIDEO_FPS));
                            }
                        }
                        if (victoryMs > 0) {
                            this.updateReplayExportProgress("勝利モーションを収録しています…");
                            const endingStartedAt = performance.now();
                            const endingFrames = Math.ceil(victoryMs * REPLAY_VIDEO_FPS / 1000);
                            for (let index = 0; index < endingFrames; index += 1) {
                                const elapsedMs = index * 1000 / REPLAY_VIDEO_FPS;
                                await this.drawReplayVideoFrame(canvas, finalFrame, finalFrame, 1, videoFacing, end, start, end, elapsedMs);
                                const nextAt = endingStartedAt + Math.min(victoryMs, (index + 1) * 1000 / REPLAY_VIDEO_FPS);
                                await new Promise((resolve) => window.setTimeout(resolve, Math.max(0, nextAt - performance.now())));
                            }
                        }
                        this.updateReplayExportProgress("動画ファイルを仕上げています…");
                        recorder.stop();
                    }
                    catch (error) {
                        try {
                            recorder.stop();
                        }
                        catch { /* already stopped */ }
                        reject(error);
                    }
                })();
            });
            const blob = await recorded;
            const extension = mimeType.includes("mp4") ? "mp4" : "webm";
            const url = URL.createObjectURL(blob);
            const filename = `voldecade-highlight-${timeline.replay.seed}-${start}-${end}.${extension}`;
            if (forSharing) {
                this.clearShareVideo();
                this.shareVideo = { url, filename, mp4: extension === "mp4" };
            }
            else {
                const link = document.createElement("a");
                link.href = url;
                link.download = filename;
                link.click();
                window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
            this.replayExportNotice = extension === "mp4"
                ? `${clipTurns}ターン${victoryMs > 0 ? "＋勝利モーション" : ""}（約${clipSeconds}秒）の動画を書き出しました。`
                : `${clipTurns}ターン${victoryMs > 0 ? "＋勝利モーション" : ""}（約${clipSeconds}秒）のWebM動画を書き出しました。X投稿用にはMP4へ変換してください。`;
        }
        catch (error) {
            this.replayExportNotice = `動画の作成に失敗しました。${error instanceof Error ? error.message : String(error)}`;
            throw error;
        }
        finally {
            stream?.getTracks().forEach((track) => track.stop());
            this.replayExporting = false;
            if (forSharing)
                this.audio.stop();
            this.render();
        }
    }
    updateReplayExportProgress(message) {
        this.replayExportProgress = message;
        const progress = this.element.querySelector("[data-replay-export-progress]");
        if (progress !== null)
            progress.textContent = message;
    }
    loadReplayVideoImage(url) {
        const cached = this.replayVideoImages.get(url);
        if (cached !== undefined)
            return cached;
        const image = new Image();
        const loaded = new Promise((resolve) => {
            image.onload = () => resolve(image);
            image.onerror = () => resolve(null);
            image.src = url;
        });
        this.replayVideoImages.set(url, loaded);
        return loaded;
    }
    async drawReplayVideoFrame(canvas, previousFrame, frame, progress, facing, frameIndex, start, end, victoryElapsedMs) {
        const state = frame.videoState ?? frame.run.controller.state;
        // After a clear, the next action begins on the new stage's initial board.
        const previousState = previousFrame.run.controller.state;
        const sameStage = state.stageSeed === previousState.stageSeed && state.width === previousState.width && state.height === previousState.height;
        const renderState = sameStage && victoryElapsedMs === undefined
            ? {
                ...state,
                characters: state.characters.map((character) => {
                    const previous = previousState.characters.find((candidate) => candidate.id === character.id);
                    if (previous === undefined)
                        return character;
                    return {
                        ...character,
                        position: {
                            row: previous.position.row + (character.position.row - previous.position.row) * progress,
                            col: previous.position.col + (character.position.col - previous.position.col) * progress,
                        },
                        alive: character.alive || progress < 0.8,
                    };
                }),
            }
            : state;
        (0, view_1.drawBoard)(canvas, renderState);
        const context = canvas.getContext("2d");
        if (context === null)
            return;
        const cell = (0, board_layout_1.boardCellSize)(canvas, renderState);
        // Match the game's .magic-frame animation: two frames, 200 ms each.
        const effectElapsedMs = victoryElapsedMs === undefined
            ? progress * REPLAY_VIDEO_TURN_MS : REPLAY_VIDEO_TURN_MS + victoryElapsedMs;
        const blastImage = renderState.lastBlastCells.length === 0 ? null
            : await this.loadReplayVideoImage((0, magic_sprites_1.magicSpriteUrl)(`fire_${Math.floor(effectElapsedMs / 200) % 2}.png`));
        const magicImages = await Promise.all(renderState.magics.map(async (magic) => ({
            magic,
            bomb: await this.loadReplayVideoImage((0, magic_sprites_1.magicSpriteUrl)("bomb_000.png")),
            number: await this.loadReplayVideoImage((0, magic_sprites_1.magicSpriteUrl)(`number_${magic.detonateTurn === null ? "i" : Math.max(1, Math.min(9, magic.detonateTurn - renderState.turn))}.png`)),
        })));
        const characterImages = await Promise.all(renderState.characters.map(async (character) => {
            let url = null;
            const previous = previousState.characters.find((candidate) => candidate.id === character.id);
            const moving = victoryElapsedMs === undefined && sameStage && character.alive && previous !== undefined
                && (previous.position.row !== character.position.row || previous.position.col !== character.position.col);
            try {
                const motion = !character.alive ? "lose"
                    : victoryElapsedMs !== undefined && character.teamId === 0 ? "win"
                        : moving ? "move" : "stand";
                const direction = facing[character.id] ?? "f";
                const frames = (0, sprite_assets_1.spriteFrames)(character.id, motion, direction, renderState);
                const duration = (0, sprite_assets_1.motionDuration)((0, sprite_assets_1.spritesForCharacter)(character.id, renderState), motion, direction, frames.length);
                const frameIndex = victoryElapsedMs !== undefined
                    ? Math.min(frames.length - 1, Math.floor(victoryElapsedMs / duration * frames.length))
                    : moving ? Math.min(frames.length - 1, Math.floor(progress * frames.length)) : 0;
                url = frames[frameIndex];
            }
            catch { /* fallback marker below */ }
            return { character, image: url === null ? null : await this.loadReplayVideoImage(url) };
        }));
        context.save();
        for (const { magic, bomb, number } of magicImages) {
            const x = (0, board_layout_1.boardOffset)(magic.position.col, cell);
            const y = (0, board_layout_1.boardOffset)(magic.position.row, cell);
            if (bomb !== null)
                context.drawImage(bomb, x, y, cell, cell);
            if (number !== null)
                context.drawImage(number, x, y, cell, cell);
        }
        if (blastImage !== null) {
            const drawnCells = new Set();
            for (const { row, col } of renderState.lastBlastCells) {
                const key = `${row}:${col}`;
                if (drawnCells.has(key))
                    continue;
                drawnCells.add(key);
                context.drawImage(blastImage, (0, board_layout_1.boardOffset)(col, cell), (0, board_layout_1.boardOffset)(row, cell), cell, cell);
            }
        }
        for (const { character, image } of characterImages) {
            const x = (0, board_layout_1.boardOffset)(character.position.col, cell);
            const y = (0, board_layout_1.boardOffset)(character.position.row, cell);
            if (image !== null)
                context.drawImage(image, x, y, cell, cell);
            else {
                context.fillStyle = character.alive ? (character.teamId === 0 ? "#005bbb" : "#b51f2e") : "#3d4148";
                context.beginPath();
                context.arc(x + cell / 2, y + cell / 2, cell * .26, 0, Math.PI * 2);
                context.fill();
                context.fillStyle = "#fff";
                context.font = `bold ${Math.max(13, cell * .22)}px system-ui`;
                context.textAlign = "center";
                context.fillText(character.alive ? String(character.id + 1) : "×", x + cell / 2, y + cell / 2 + 1);
            }
        }
        context.fillStyle = "rgba(8, 14, 28, .78)";
        context.fillRect(0, canvas.height - 38, canvas.width, 38);
        context.fillStyle = "#fff";
        context.font = "bold 18px system-ui";
        context.textAlign = "left";
        context.textBaseline = "middle";
        context.fillText(`VOLDECADE  ターン ${state.turn}`, 14, canvas.height - 19);
        context.textAlign = "right";
        context.fillText(`${frameIndex - start + 1}/${end - start + 1}`, canvas.width - 14, canvas.height - 19);
        context.restore();
    }
    openReplay(replay) {
        this.pauseReplay();
        this.replayExportNotice = null;
        this.replayTimeline = (0, replay_player_1.buildReplayTimeline)(replay);
        this.replayFrame = 0;
        this.audio.start();
        this.developmentPractice = false;
        this.route = "replay";
    }
    pauseReplay() {
        this.replayPlaying = false;
        if (this.replayTimer !== null)
            window.clearTimeout(this.replayTimer);
        this.replayTimer = null;
    }
    setReplayFrame(index) {
        if (this.replayTimeline === null)
            return;
        this.pauseReplay();
        const nextFrame = (0, replay_player_1.clampReplayFrame)(this.replayTimeline, index);
        if (nextFrame > this.replayFrame) {
            for (let frame = this.replayFrame + 1; frame <= nextFrame; frame += 1) {
                this.audio.playEvents(this.replayTimeline.frames[frame]?.events ?? []);
            }
        }
        this.replayFrame = nextFrame;
    }
    scheduleReplay() {
        if (this.replayTimer !== null)
            window.clearTimeout(this.replayTimer);
        this.replayTimer = null;
        if (!this.replayPlaying || this.replayTimeline === null)
            return;
        if (this.replayFrame >= this.replayTimeline.frames.length - 1) {
            this.replayPlaying = false;
            return;
        }
        this.replayTimer = window.setTimeout(() => {
            this.replayTimer = null;
            if (!this.replayPlaying || this.route !== "replay" || this.replayTimeline === null)
                return;
            this.replayFrame += 1;
            this.audio.playEvents(this.replayTimeline.frames[this.replayFrame]?.events ?? []);
            if (this.replayFrame >= this.replayTimeline.frames.length - 1)
                this.replayPlaying = false;
            this.render();
            this.scheduleReplay();
        }, 1000 / this.replaySpeed);
    }
    renderHome() {
        return `<main class="screen home-screen"><div class="hero"><p class="eyebrow">TACTICAL GRID GAME</p><h1>VOLDECADE</h1><p>2人の術者を動かし、8ターン／無限の魔力球で勝ち抜こう。</p>
      ${DEVELOPMENT_STAGE_CONTROL}
      <div class="home-actions"><button class="primary" data-action="new">ゲームを始める</button></div>
      <nav><button data-route="how">遊び方</button><button data-route="settings">設定</button><button data-route="ranking">オンラインランキング</button><button data-route="replays">リプレイ</button><button data-route="credits">素材クレジット</button></nav>
      ${this.warning === null ? "" : `<p class="warning" role="alert">${this.warning}</p>`}</div></main>`;
    }
    renderHow() {
        const powerItem = `<img class="how-icon" src="${board_assets_1.itemSpriteUrls.POWER}" alt="火力アイテム">`;
        const capacityItem = `<img class="how-icon" src="${board_assets_1.itemSpriteUrls.CAPACITY}" alt="設置数アイテム">`;
        const magicIcon = `<img class="how-icon" src="./assets/design/bomb/bomb_000.png" alt="魔力球">`;
        return `<main class="screen text-screen"><button data-route="home">← ホーム</button><h1>遊び方</h1>
      <section class="how-purpose"><h2>目的とランキング</h2><p>2人の術者を動かし、敵を倒しながら、できるだけ多くのステージをクリアしましょう。</p><p>ランキングは、次の順番で順位を決めます。3項目を合計した点数ではありません。</p><ul><li><strong>① クリアしたステージ数</strong>：多い方が上位</li><li><strong>② 最後にクリアしたステージまでのターン数</strong>：少ない方が上位</li><li><strong>③ 撃墜差</strong>：全ステージ通算の「敵撃墜数 − 味方撃墜数」。大きい方が上位</li></ul></section>
      <section class="how-rules"><h2>基本操作とルール</h2><ol><li><strong>方向ボタンまたは停止ボタンで即確定</strong>します。Shiftを押しながら入力すると、動作後に${magicIcon}魔力球を設置します。</li><li>${magicIcon}魔力球は<strong>8ターンで発動</strong>する設置と、自然発動しない無期限の設置を選べます。残り設置枠が1個の場合は8ターン固定です。無期限の魔力球も雷撃で誘爆します。</li><li>壊せる壁の中には${powerItem}と${capacityItem}が隠れています。前者は火力、後者は設置数を増やします。配置は180度対称です。</li><li>ターン終了時に<strong>味方の生存数が敵を上回ればステージクリア</strong>です。味方が倒れていても、敵より多く生き残ればクリアできます。同数以下で誰かが倒れると敗北です。</li><li>ゲーム開始時は2体同時操作です。同じマスなら個別操作にも切り替えられます。別のマスに移動すると個別操作に切り替わり、同じマスに戻った後は切替ボタンで2体同時操作に戻せます。</li></ol></section>
      <h2>キーボード</h2><p>W/S/A/Dまたは矢印: 移動、X: 停止、Shift＋移動／停止: 動作後に${magicIcon}魔力球を設置、F: 発動方法の切り替え。</p></main>`;
    }
    renderCredits() {
        return `<main class="screen text-screen"><button data-route="home">← ホーム</button><h1>素材クレジット</h1>
      <p>VOLDECADEでは、ゲーム内のBGM・効果音に以下の音楽素材を使用しています。</p>
      <section class="credit-card"><h2>OtoLogic</h2><p>フリー音楽素材・効果音素材</p><p><a href="https://otologic.jp/" target="_blank" rel="noopener noreferrer">OtoLogic 公式サイト</a><br><a href="https://otologic.jp/free/license" target="_blank" rel="noopener noreferrer">利用規約</a></p></section>
      <section class="credit-card"><h2>魔王魂</h2><p>フリー音楽素材</p><p><a href="https://maou.audio/" target="_blank" rel="noopener noreferrer">魔王魂 公式サイト</a><br><a href="https://maou.audio/rule/" target="_blank" rel="noopener noreferrer">音楽利用のルール</a></p></section>
      <p>素材の利用にあたっては、各素材サイトの利用規約・ルールに従っています。</p></main>`;
    }
    renderSettings() {
        return `<main class="screen text-screen"><button data-route="home">← ホーム</button><h1>設定</h1>
      <label>音量 <input data-setting="volume" type="range" min="0" max="1" step="0.1" value="${this.settings.volume}"></label></main>`;
    }
    renderResult() {
        if (this.session === null)
            return this.renderHome();
        const state = this.session.run.controller.state;
        const score = (0, engine_1.getCampaignScore)(this.session.run.controller);
        const resultDetails = this.developmentPractice
            ? `<p>開発用練習を${state.turn}ターンプレイしました。進行状況は保存されませんが、終了したリプレイは端末に保存されます。</p>`
            : `<p class="score">通算クリア <strong>${score.clearedStages}</strong> / 最終クリアまで <strong>${score.turnsToLastClear ?? "—"}</strong>ターン / 撃墜差 <strong>${score.killDifference >= 0 ? "+" : ""}${score.killDifference}</strong></p><p>敵撃墜 ${score.enemyDefeated}・味方撃墜 ${score.playerDefeated}。${state.turn}ターンプレイしました。</p>${this.renderRanking(score)}`;
        const nextAction = this.developmentPractice
            ? `<button class="primary" data-route="home">ステージ選択へ</button>`
            : `<button class="primary" data-action="new">もう一度</button>`;
        const onlineAction = this.developmentPractice ? "" : `<button data-action="submit-online" ${this.resultSubmitted() ? "disabled" : ""}>${this.resultSubmitLabel()}</button><button data-action="share-result-video">動画を作ってXで公開</button><button data-route="ranking">ランキングを見る</button>`;
        return `<main class="screen result-screen"><p class="eyebrow">RESULT</p><h1>${(0, view_1.campaignReason)(state)}</h1>${this.renderOnlineNotice()}${this.warning === null ? "" : `<p class="warning" role="alert">${escapeHtml(this.warning)}</p>`}${(0, view_1.renderSurvivalBreakdown)(state)}${resultDetails}${onlineAction}${nextAction}<button data-route="replays">リプレイを見る</button><button data-route="home">ホーム</button></main>`;
    }
    renderRanking(score) {
        const ranking = (0, ranking_1.loadLocalRanking)();
        const rows = ranking.slice(0, 10).map((entry, index) => `<li>${index + 1}. ${entry.score.clearedStages}面 / ${entry.score.turnsToLastClear ?? "—"}T / ${entry.score.killDifference >= 0 ? "+" : ""}${entry.score.killDifference}</li>`).join("");
        return `<section class="ranking"><h2>ローカルランキング</h2><p>今回: ${score.clearedStages}面 / ${score.turnsToLastClear ?? "—"}T / ${score.killDifference >= 0 ? "+" : ""}${score.killDifference}</p><ol>${rows || "<li>まだ記録がありません</li>"}</ol></section>`;
    }
    renderOnlineRanking() {
        const current = (0, online_ranking_1.getOnlineAuth)();
        const returnToResult = this.session !== null && this.session.run.controller.state.outcome.kind !== "ONGOING"
            ? '<button data-route="result">結果画面に戻る</button>' : "";
        return `<main class="screen text-screen ranking-screen"><button data-route="home">← ホーム</button>${returnToResult}<h1>オンラインランキング</h1>
      ${this.renderOnlineNotice()}
      <p>順位はクリア数、最終クリアまでのターン数、撃墜差の順で決まります。</p>
      <div data-ranking-content>${this.renderOnlineRankingContent()}</div>
      ${current === null ? `<section><h2>ランキングに参加する</h2>
        <p>Googleアカウントでログインします。ランキングにはGoogleの名前ではなく、ここで入力した表示名が公開されます。</p>
        <form class="online-auth-form" autocomplete="on">
          <label>ランキング表示名 <input id="online-name" name="nickname" maxlength="24" autocomplete="nickname" value="${escapeHtml(this.onlineName)}"></label>
          <button type="button" class="primary" data-action="online-google-login">${this.onlineOperation === "login" ? onlineProgress.login : "Googleアカウントでログイン"}</button>
        </form>
      </section>` : `<section><p>${escapeHtml(current.name)}でログイン中。ランキングに表示される名前は入力した表示名です。</p>
        <button data-action="online-logout">ログアウト</button>
      </section>`}
    </main>`;
    }
    renderOnlineRankingContent() {
        const rows = this.onlineEntries?.map((entry, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(entry.name)}</td><td>${entry.clearedStages}</td><td>${entry.turnsToLastClear ?? "—"}</td><td>${entry.killDifference >= 0 ? "+" : ""}${entry.killDifference}</td></tr>`).join("");
        const loading = this.onlineRankingRefreshing || this.onlineOperation === "ranking";
        const empty = this.onlineEntries !== null ? "まだ記録がありません" : loading
            ? "ランキングを取得しています。" : "ランキングを取得できませんでした。再読み込みしてください。";
        const updated = this.onlineRankingUpdatedAt === null ? "" : `最終更新：${new Date(this.onlineRankingUpdatedAt).toLocaleString("ja-JP")}`;
        return `<button data-action="online-refresh" ${loading ? "disabled" : ""}>${loading ? onlineProgress.ranking : "ランキングを再読み込み"}</button>
      <p role="status">${updated}${this.onlineRankingRefreshing ? "　更新中です。前回の順位を表示しています。" : ""}</p>
      ${this.onlineRankingError === null ? "" : `<p class="online-notice error" role="alert">${escapeHtml(this.onlineRankingError)} 前回の順位を表示しています。</p>`}
      <table><thead><tr><th>順位</th><th>名前</th><th>クリア数</th><th>ターン</th><th>撃墜差</th></tr></thead><tbody>${rows || `<tr><td colspan="5">${empty}</td></tr>`}</tbody></table>`;
    }
    isOnlineRequestAction(action) {
        return action !== undefined && ["online-refresh", "online-google-login", "submit-online"].includes(action);
    }
    updateOnlineRankingControls() {
        if (this.onlineOperation !== null || this.replayExporting || this.replayDeleting)
            return;
        this.element.querySelectorAll("button").forEach((button) => {
            if (this.isOnlineRequestAction(button.dataset.action))
                button.disabled = this.onlineRankingRefreshing || button.dataset.action === "submit-online" && this.resultSubmitted();
            if (button.dataset.action === "submit-online")
                button.textContent = this.resultSubmitLabel();
        });
    }
    renderOnlineNotice() {
        const notice = this.onlineNotice;
        if (notice === null)
            return "";
        return `<p class="online-notice ${notice.kind}" data-online-notice role="${notice.kind === "error" ? "alert" : "status"}" tabindex="-1">${escapeHtml(notice.message)}</p>`;
    }
    async renderReplays() {
        const renderId = ++this.replayListRenderId;
        let records = [];
        try {
            const listing = await this.store.listReplays();
            records = listing.records;
            if (listing.removedInvalid > 0)
                this.warning = `読み込めないリプレイを${listing.removedInvalid}件削除しました。`;
        }
        catch (error) {
            this.warning = error instanceof Error ? error.message : String(error);
        }
        if (this.route !== "replays" || renderId !== this.replayListRenderId)
            return;
        this.replayRecords = records;
        const replays = records.map((record) => record.replay);
        const ranking = (0, ranking_1.loadLocalRanking)();
        this.element.innerHTML = `<main class="screen text-screen"><button data-route="home">← ホーム</button><h1>リプレイ</h1>
      ${this.warning === null ? "" : `<p class="warning" role="status">${escapeHtml(this.warning)}</p>`}
      <ul class="replay-list">${replays.map((replay, index) => `<li><span>ステージ${replay.startStage ?? 1}開始・Seed ${replay.seed}・${replay.inputs.length}ターン・${replay.endReason}${replay.score === undefined ? "" : `・${replay.score.clearedStages}面 / ${replay.score.turnsToLastClear ?? "—"}T / 撃墜差 ${replay.score.killDifference >= 0 ? "+" : ""}${replay.score.killDifference}`}</span><span class="replay-list-actions"><button data-action="load-replay" data-index="${index}">再生</button>${DEVELOPMENT_BUILD ? ` <button data-action="export-replay" data-index="${index}">書き出す</button>` : ""} <button data-action="delete-replay" data-index="${index}">削除</button></span></li>`).join("") || "<li>保存済みリプレイはありません</li>"}</ul>
      <h2>ローカルランキング</h2><ol>${ranking.slice(0, 10).map((entry) => `<li>${entry.score.clearedStages}面 / ${entry.score.turnsToLastClear ?? "—"}T / 撃墜差 ${entry.score.killDifference >= 0 ? "+" : ""}${entry.score.killDifference}</li>`).join("") || "<li>まだ記録がありません</li>"}</ol>
      ${DEVELOPMENT_BUILD ? `<label for="replay-json">リプレイJSONを読み込む</label><textarea id="replay-json" rows="8" spellcheck="false"></textarea><button data-action="verify-replay">検証して保存</button>` : ""}</main>`;
        this.applySettings();
        this.renderAccountBadge();
    }
    renderReplay() {
        const timeline = this.replayTimeline;
        if (timeline === null)
            return this.renderHome();
        const frame = timeline.frames[this.replayFrame];
        const state = frame.run.controller.state;
        const finalScore = (0, engine_1.getCampaignScore)(timeline.frames[timeline.frames.length - 1].run.controller);
        const progress = (0, engine_1.getCampaignProgress)(state);
        const last = timeline.frames.length - 1;
        const previousStage = (0, replay_player_1.adjacentStageFrame)(timeline, this.replayFrame, -1);
        const nextStage = (0, replay_player_1.adjacentStageFrame)(timeline, this.replayFrame, 1);
        const actions = frame.resolvedActions === null
            ? "開始盤面"
            : frame.resolvedActions.map((action, id) => `${id < 2 ? "味方" : "敵"}キャラ${id + 1}: ${(0, view_1.characterActionLabel)(action)}`).join(" / ");
        const events = frame.events.length === 0 ? "イベントなし" : frame.events.map(view_1.eventLabel).join("。 ");
        return `<main class="screen replay-screen">
      <header class="game-header">
        <button data-route="replays" class="quiet">リプレイ一覧</button>
        <div><strong data-replay-stage>ステージ ${progress.stageNumber}「${(0, engine_1.getStageName)(progress.stageNumber)}」</strong><span data-replay-progress>周回 ${progress.cycle} / 通算クリア ${progress.clearedStages}</span></div>
        <div><strong data-replay-turn>${this.replayFrame} / ${last} ターン</strong><span>Seed ${timeline.replay.seed}</span><span>記録 ${finalScore.clearedStages}面 / ${finalScore.turnsToLastClear ?? "—"}T / 撃墜差 ${finalScore.killDifference >= 0 ? "+" : ""}${finalScore.killDifference}</span></div>
      </header>
      <section class="play-layout">
        <div class="board-panel">
          <div class="sprite-board"><canvas id="game-board" width="600" height="600" role="img" aria-label="リプレイ盤面"></canvas></div>
          <p class="sr-only" id="board-state">${(0, view_1.boardText)(state)}</p>
        </div>
        <section class="control-panel replay-controls" aria-label="リプレイ操作">
          <p class="eyebrow">REPLAY</p><h2>ターン ${this.replayFrame}</h2>
          ${this.warning === null ? "" : `<p class="warning" role="alert">${escapeHtml(this.warning)}</p>`}
          <input data-replay-seek type="range" min="0" max="${last}" value="${this.replayFrame}" aria-label="再生ターン">
          <div class="replay-buttons">
            <button data-action="replay-first" ${this.replayFrame === 0 ? "disabled" : ""} aria-label="最初へ">|◀</button>
            <button data-action="replay-prev" ${this.replayFrame === 0 ? "disabled" : ""} aria-label="1ターン戻る">◀</button>
            <button class="primary" data-action="replay-play" ${last === 0 ? "disabled" : ""}>${this.replayPlaying ? "一時停止" : this.replayFrame === last ? "最初から再生" : "再生"}</button>
            <button data-action="replay-next" ${this.replayFrame === last ? "disabled" : ""} aria-label="1ターン進む">▶</button>
            <button data-action="replay-last" ${this.replayFrame === last ? "disabled" : ""} aria-label="最後へ">▶|</button>
          </div>
          <div class="replay-stage-buttons"><button data-action="replay-stage-prev" ${previousStage === this.replayFrame ? "disabled" : ""}>前のステージ</button><button data-action="replay-stage-next" ${nextStage === this.replayFrame ? "disabled" : ""}>次のステージ</button></div>
          <label>再生速度 <select data-replay-speed>${[0.5, 1, 2, 4].map((speed) => `<option value="${speed}" ${speed === this.replaySpeed ? "selected" : ""}>${speed}倍</option>`).join("")}</select></label>
          <button data-action="export-replay-video" ${this.replayExporting ? "disabled" : ""}>${this.replayExporting ? "動画を書き出し中…" : "動画を書き出す"}</button>
          <p data-replay-export-notice role="status" ${this.replayExportNotice === null ? "hidden" : ""}>${escapeHtml(this.replayExportNotice ?? "")}</p>
          <p class="replay-actions">${actions}</p>
          <p class="event-log" aria-live="polite">${events}</p>
        </section>
      </section>
    </main>`;
    }
    renderReplayDeleteConfirmation() {
        const replay = this.replayDeleteTarget?.replay;
        return `<main class="screen text-screen" aria-busy="${this.replayDeleting}"><h1>リプレイの削除</h1>
      <p>このリプレイを削除しますか？ 削除すると元に戻せません。</p>
      ${replay === undefined ? "" : `<p>ステージ${replay.startStage ?? 1}開始・Seed ${replay.seed}・${replay.inputs.length}ターン</p>`}
      ${this.warning === null ? "" : `<p class="warning" role="alert">${escapeHtml(this.warning)}</p>`}
      <div class="replay-list-actions"><button data-route="replays" ${this.replayDeleting ? "disabled" : ""}>いいえ</button>
      <button data-action="confirm-delete-replay" ${this.replayDeleting || replay === undefined ? "disabled" : ""}>はい</button></div>
      ${this.replayDeleting ? `<p role="status">削除しています…</p>` : ""}</main>`;
    }
    updateReplayFrame() {
        const timeline = this.replayTimeline;
        if (timeline === null)
            return;
        const frame = timeline.frames[this.replayFrame];
        const state = frame.run.controller.state;
        const progress = (0, engine_1.getCampaignProgress)(state);
        const last = timeline.frames.length - 1;
        const text = (selector, value) => {
            const element = this.element.querySelector(selector);
            if (element !== null)
                element.textContent = value;
        };
        text("[data-replay-stage]", `ステージ ${progress.stageNumber}「${(0, engine_1.getStageName)(progress.stageNumber)}」`);
        text("[data-replay-progress]", `周回 ${progress.cycle} / 通算クリア ${progress.clearedStages}`);
        text("[data-replay-turn]", `${this.replayFrame} / ${last} ターン`);
        text(".replay-controls h2", `ターン ${this.replayFrame}`);
        text("#board-state", (0, view_1.boardText)(state));
        text(".replay-actions", frame.resolvedActions === null ? "開始盤面"
            : frame.resolvedActions.map((action, id) => `${id < 2 ? "味方" : "敵"}キャラ${id + 1}: ${(0, view_1.characterActionLabel)(action)}`).join(" / "));
        text(".event-log", frame.events.length === 0 ? "イベントなし" : frame.events.map(view_1.eventLabel).join("。 "));
        const notice = this.element.querySelector("[data-replay-export-notice]");
        if (notice !== null) {
            notice.hidden = this.replayExportNotice === null;
            notice.textContent = this.replayExportNotice ?? "";
        }
        text('[data-action="replay-play"]', this.replayPlaying ? "一時停止" : this.replayFrame === last ? "最初から再生" : "再生");
        const seek = this.element.querySelector("[data-replay-seek]");
        if (seek !== null)
            seek.value = String(this.replayFrame);
        for (const [action, disabled] of [
            ["replay-first", this.replayFrame === 0], ["replay-prev", this.replayFrame === 0],
            ["replay-next", this.replayFrame === last], ["replay-last", this.replayFrame === last],
            ["replay-play", last === 0],
            ["replay-stage-prev", (0, replay_player_1.adjacentStageFrame)(timeline, this.replayFrame, -1) === this.replayFrame],
            ["replay-stage-next", (0, replay_player_1.adjacentStageFrame)(timeline, this.replayFrame, 1) === this.replayFrame],
        ]) {
            const button = this.element.querySelector(`[data-action="${action}"]`);
            if (button !== null)
                button.disabled = disabled;
        }
        const canvas = this.element.querySelector("#game-board");
        if (canvas !== null) {
            (0, view_1.drawBoard)(canvas, state);
            this.magicSprites.render(canvas, state);
            this.sprites.render(canvas, state, frame.events);
        }
    }
    tutorial() {
        if (this.tutorialStep >= 4 || this.route !== "game")
            return "";
        const steps = [
            ["移動後に設置", "方向またはXで即確定します。Shiftを押しながら入力すると、動作後に△を置きます。"],
            ["8ターン／∞", "残り枠が2個以上なら選べます。∞は自然発動しませんが、雷撃では誘爆します。"],
            ["生存数で勝敗判定", "ターン終了時に味方の生存数が敵を上回れば、味方が1体倒れていてもステージクリアです。同数以下で誰かが倒れると敗北します。"],
            ["操作モードの切替", "同じマスでは2体同時操作と個別操作を切り替えられます。別のマスに移動すると個別操作に切り替わり、同じマスに戻った後は切替ボタンで2体同時操作に戻せます。"],
        ];
        const step = steps[this.tutorialStep];
        return `<div class="tutorial" role="dialog" aria-modal="true" aria-labelledby="tutorial-title"><p>${this.tutorialStep + 1}/4</p><h2 id="tutorial-title">${step[0]}</h2><p>${step[1]}</p><button data-action="tutorial-next">${this.tutorialStep === 3 ? "操作を始める" : "次へ"}</button></div>`;
    }
    applySettings() {
        this.audio.setVolume(this.settings.volume);
    }
    async loadOnlineRanking(successMessage = "ランキングを読み込みました。", fresh = false) {
        if (this.onlineRankingRefreshing) {
            this.render();
            return;
        }
        this.onlineRankingError = null;
        this.onlineRankingRefreshing = true;
        this.render();
        try {
            await (0, online_ranking_1.prepareOnline)();
        }
        catch (error) {
            this.onlineRankingError = error instanceof Error ? error.message : "Firebaseへ接続できませんでした。";
            this.onlineRankingRefreshing = false;
            if (this.route === "ranking")
                this.render();
            return;
        }
        this.onlineRankingRefreshing = false;
        const cached = (0, online_ranking_1.getCachedOnlineRanking)();
        if (cached !== null) {
            this.onlineEntries = cached.entries;
            this.onlineRankingUpdatedAt = cached.updatedAt;
            if (successMessage !== "ランキングを読み込みました。")
                this.onlineNotice = { kind: "success", message: successMessage };
            if (!fresh && cached.checkedAt > 0 && Date.now() - cached.checkedAt < online_ranking_1.ONLINE_RANKING_CACHE_MS) {
                this.render();
                return;
            }
            this.onlineRankingRefreshing = true;
            this.render();
            try {
                this.onlineEntries = await (0, online_ranking_1.fetchOnlineRanking)("v1", undefined, fresh);
                this.onlineRankingUpdatedAt = (0, online_ranking_1.getCachedOnlineRanking)()?.updatedAt ?? Date.now();
            }
            catch (error) {
                this.onlineRankingError = error instanceof Error ? error.message : "通信に失敗しました。";
            }
            finally {
                this.onlineRankingRefreshing = false;
                // Update only the results: preserve focus and partially entered display names,
                // and never redraw a game or replay opened while the request was pending.
                if (this.route === "ranking") {
                    const content = this.element.querySelector("[data-ranking-content]");
                    if (content !== null)
                        content.innerHTML = this.renderOnlineRankingContent();
                }
                this.updateOnlineRankingControls();
            }
            return;
        }
        await this.runOnlineOperation("ranking", async () => {
            this.onlineEntries = await (0, online_ranking_1.fetchOnlineRanking)("v1", undefined, fresh);
            this.onlineRankingUpdatedAt = (0, online_ranking_1.getCachedOnlineRanking)()?.updatedAt ?? Date.now();
            return successMessage;
        });
    }
    /** One owner for start, completion and failure; drawing never starts a request. */
    async runOnlineOperation(operation, task) {
        if (this.onlineOperation !== null)
            return;
        this.onlineOperation = operation;
        this.onlineNotice = null;
        this.onlineSlow = false;
        this.render();
        this.element.querySelector(".online-pending")?.focus({ preventScroll: true });
        const slowTimer = window.setTimeout(() => {
            this.onlineSlow = true;
            const hint = this.element.querySelector("[data-online-wait]");
            if (hint !== null)
                hint.textContent = this.onlineWaitHint();
        }, 8000);
        try {
            this.onlineNotice = { kind: "success", message: await task() };
        }
        catch (error) {
            this.onlineNotice = { kind: "error", message: error instanceof Error ? error.message : "通信に失敗しました。時間をおいてもう一度お試しください。" };
        }
        finally {
            window.clearTimeout(slowTimer);
            this.onlineOperation = null;
            this.onlineSlow = false;
            this.render();
            this.element.querySelector("[data-online-notice]")?.focus();
        }
    }
    onlineWaitHint() {
        return this.onlineSlow ? `応答に時間がかかっています。このままお待ちください。${online_ranking_1.ONLINE_TIMEOUT_MS / 1000}秒で応答がなければ操作できる状態に戻ります。`
            : "サーバーからの応答を待っています。しばらくお待ちください。";
    }
    renderOnlineBusy() {
        if (this.onlineOperation === null)
            return;
        const main = this.element.querySelector("main");
        main?.setAttribute("aria-busy", "true");
        main?.setAttribute("inert", "");
        this.element.querySelectorAll("button, input, select, textarea")
            .forEach((control) => { control.disabled = true; });
        this.element.insertAdjacentHTML("beforeend", `<div class="online-pending" role="status" aria-live="polite" tabindex="-1">
      <div class="online-pending-card"><span class="online-spinner" aria-hidden="true"></span>
      <strong>${onlineProgress[this.onlineOperation]}</strong><p data-online-wait>${this.onlineWaitHint()}</p></div>
    </div>`);
    }
    renderAccountBadge() {
        const main = this.element.querySelector("main");
        if (main === null || typeof main.insertAdjacentHTML !== "function")
            return;
        main.querySelector("[data-account-badge]")?.remove();
        const auth = (0, online_ranking_1.getOnlineAuth)();
        if (auth === null)
            return;
        main.insertAdjacentHTML("afterbegin", `<p class="account-badge" data-account-badge>アカウント：${escapeHtml(auth.name)}</p>`);
    }
    render() {
        // Preserve the range input (including its drag/focus) and canvas while seeking.
        // Rebuild once on export start/end to apply and remove the operation lock.
        if (this.route === "replay" && this.element.querySelector(".replay-screen") !== null && !this.replayExporting && !this.replayExportUiVisible) {
            this.updateReplayFrame();
            return;
        }
        if (this.route === "replays") {
            void this.renderReplays();
            return;
        }
        if (this.route === "home")
            this.element.innerHTML = this.renderHome();
        else if (this.route === "how")
            this.element.innerHTML = this.renderHow();
        else if (this.route === "credits")
            this.element.innerHTML = this.renderCredits();
        else if (this.route === "delete-replay")
            this.element.innerHTML = this.renderReplayDeleteConfirmation();
        else if (this.route === "settings")
            this.element.innerHTML = this.renderSettings();
        else if (this.route === "result")
            this.element.innerHTML = this.renderResult();
        else if (this.route === "share")
            this.element.innerHTML = this.renderShare();
        else if (this.route === "ranking") {
            this.element.innerHTML = this.renderOnlineRanking();
            const name = this.element.querySelector("#online-name");
            if (name !== null)
                name.value = this.onlineName;
        }
        else if (this.route === "replay")
            this.element.innerHTML = this.renderReplay();
        else if (this.session !== null) {
            this.element.innerHTML = (0, view_1.renderGameScreen)(this.session, this.warning, this.developmentPractice, this.stageTransitionState ?? undefined, this.settings.volume) + this.tutorial();
        }
        const canvas = this.element.querySelector("#game-board");
        if (canvas !== null) {
            const state = this.route === "replay" && this.replayTimeline !== null
                ? this.replayTimeline.frames[this.replayFrame]?.run.controller.state
                : this.stageTransitionState ?? this.session?.run.controller.state;
            if (state !== undefined) {
                (0, view_1.drawBoard)(canvas, state);
                const events = this.route === "replay" ? this.replayTimeline?.frames[this.replayFrame]?.events ?? [] : this.session?.events ?? [];
                const preview = this.route === "game" && this.session !== null ? (0, game_session_1.getIndividualDraftPreview)(this.session) : undefined;
                this.magicSprites.render(canvas, state, preview);
                this.sprites.render(canvas, state, events, preview);
            }
        }
        else {
            this.sprites.clear();
            this.magicSprites.clear();
        }
        this.applySettings();
        this.renderOnlineBusy();
        this.renderAccountBadge();
        if (this.route === "game" && this.session !== null && !this.developmentPractice && this.session.run.controller.state.outcome.kind !== "ONGOING") {
            this.element.insertAdjacentHTML("beforeend", '<button class="result-reopen primary" data-action="open-result-popup">今回の記録・投稿</button>');
        }
        this.renderResultPopup();
        if (this.resultPopupPending)
            this.scheduleResultPopup();
        this.replayExportUiVisible = this.replayExporting;
        if (this.onlineRankingRefreshing)
            this.updateOnlineRankingControls();
        if (this.replayExporting) {
            const main = this.element.querySelector("main");
            main?.setAttribute("aria-busy", "true");
            main?.setAttribute("inert", "");
            this.element.querySelectorAll("button, input, select, textarea")
                .forEach((control) => { control.disabled = true; });
            this.element.insertAdjacentHTML("beforeend", `<div class="online-pending" data-replay-export-pending role="status" aria-live="polite" tabindex="-1">
        <div class="online-pending-card"><span class="online-spinner" aria-hidden="true"></span>
        <strong>動画を作成中</strong><p data-replay-export-progress>${escapeHtml(this.replayExportProgress)}</p>
        <p>完了するまで、この画面を開いたままお待ちください。</p></div>
      </div>`);
            this.element.querySelector("[data-replay-export-pending]")?.focus();
        }
    }
}
new BrowserApp(root);
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        void navigator.serviceWorker
            .register("./sw.js", { updateViaCache: "none" })
            .then((registration) => registration.update())
            .catch(() => { });
    });
}

},{"@voldecade/replay":1,"@voldecade/engine":5,"./game-session":35,"./keyboard":37,"./ai-worker-client":38,"./persistence":40,"./replay-player":41,"./settings":42,"./character-sprites":43,"./sprite-assets":44,"./magic-sprites":46,"./board-layout":45,"./view":47,"./ranking":49,"./online-ranking":50,"./audio":51,"./board-assets":48}],
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
__exportStar(require("./campaign-run"), exports);
__exportStar(require("./canonical"), exports);
__exportStar(require("./replay"), exports);
__exportStar(require("./sha256"), exports);

},{"./campaign-run":2,"./canonical":32,"./replay":33,"./sha256":34}],
2:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.advanceCampaignRun = exports.createCampaignRun = void 0;
const ai_1 = require("@voldecade/ai");
const engine_1 = require("@voldecade/engine");
const engine_2 = require("@voldecade/engine");
const createCampaignRun = (seedRoot, startStage = 1) => ({
    controller: startStage === 1 ? (0, engine_2.createCampaign)(seedRoot) : (0, engine_2.createCampaignAtStage)(seedRoot, startStage),
    inputs: [],
    startStage,
});
exports.createCampaignRun = createCampaignRun;
const advanceCampaignRun = (run, playerIntent) => {
    if (run.controller.state.outcome.kind !== "ONGOING")
        throw new Error("replay contains input after campaign ended");
    const stage = (0, engine_2.getCampaignProgress)(run.controller.state).stageNumber;
    const observation = (0, ai_1.toObservation)(run.controller.state, 1);
    const decision = (0, ai_1.decideTeam)(observation, (0, ai_1.getAiProfile)((0, engine_1.getStageProfileNumber)(stage)), run.controller.state.rngStates.ai[1], run.chainPlan);
    const state = {
        ...run.controller.state,
        rngStates: {
            ...run.controller.state.rngStates,
            ai: [run.controller.state.rngStates.ai[0], decision.nextRngState],
        },
    };
    const turn = (0, engine_2.resolveCampaignTurn)({ ...run.controller, state }, playerIntent, decision.intent);
    return {
        run: { controller: turn.controller, inputs: [...run.inputs, playerIntent], startStage: run.startStage,
            ...(!turn.stageChanged && decision.chainPlan !== undefined ? { chainPlan: decision.chainPlan } : {}),
        },
        turn,
        aiNodesVisited: decision.nodesVisited,
        aiVersion: ai_1.AI_VERSION,
    };
};
exports.advanceCampaignRun = advanceCampaignRun;

},{"@voldecade/ai":3,"@voldecade/engine":5}],
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
__exportStar(require("./bitboard-survival"), exports);
__exportStar(require("./danger"), exports);
__exportStar(require("./decide"), exports);
__exportStar(require("./observation"), exports);
__exportStar(require("./profiles"), exports);
__exportStar(require("./stage-ten"), exports);
__exportStar(require("./stage-eight"), exports);

},{"./bitboard-survival":4,"./danger":23,"./decide":24,"./observation":27,"./profiles":31,"./stage-ten":25,"./stage-eight":29}],
4:[function(module,exports,require){
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

},{"@voldecade/engine":5}],
5:[function(module,exports,require){
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

},{"./blast":6,"./campaign":8,"./events":19,"./items":11,"./invariants":20,"./map":18,"./magic":12,"./movement":14,"./outcome":15,"./resolve-turn":10,"./rng":9,"./ruleset":13,"./state":17,"./stage-names":21,"./team-intent":16,"./test-board":22,"./types":7}],
6:[function(module,exports,require){
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

},{"./types":7}],
7:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.samePosition = exports.positionIndex = void 0;
const positionIndex = (position, width) => position.row * width + position.col;
exports.positionIndex = positionIndex;
const samePosition = (left, right) => left.row === right.row && left.col === right.col;
exports.samePosition = samePosition;

},{}],
8:[function(module,exports,require){
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

},{"./rng":9,"./resolve-turn":10,"./state":17}],
9:[function(module,exports,require){
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
10:[function(module,exports,require){
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

},{"./blast":6,"./items":11,"./magic":12,"./movement":14,"./outcome":15,"./team-intent":16}],
11:[function(module,exports,require){
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

},{"./types":7}],
12:[function(module,exports,require){
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

},{"./ruleset":13}],
13:[function(module,exports,require){
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
14:[function(module,exports,require){
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

},{"./types":7}],
15:[function(module,exports,require){
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

},{"./ruleset":13}],
16:[function(module,exports,require){
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

},{"./types":7}],
17:[function(module,exports,require){
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

},{"./map":18,"./rng":9,"./ruleset":13}],
18:[function(module,exports,require){
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

},{"./rng":9,"./ruleset":13,"./types":7}],
19:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

},{}],
20:[function(module,exports,require){
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

},{"./types":7}],
21:[function(module,exports,require){
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
22:[function(module,exports,require){
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

},{"./ruleset":13}],
23:[function(module,exports,require){
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

},{"@voldecade/engine":5}],
24:[function(module,exports,require){
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

},{"@voldecade/engine":5,"./bitboard-survival":4,"./danger":23,"./stage-ten":25,"./stage-nine":26,"./stage-eight":29,"./stage-seven":30}],
25:[function(module,exports,require){
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

},{"@voldecade/engine":5,"./stage-nine":26,"./bitboard-survival":4}],
26:[function(module,exports,require){
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

},{"@voldecade/engine":5,"./bitboard-survival":4,"./observation":27,"./simulation":28}],
27:[function(module,exports,require){
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
28:[function(module,exports,require){
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

},{"@voldecade/engine":5}],
29:[function(module,exports,require){
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

},{"@voldecade/engine":5,"./stage-nine":26}],
30:[function(module,exports,require){
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

},{"@voldecade/engine":5,"./observation":27,"./stage-nine":26,"./bitboard-survival":4,"./simulation":28}],
31:[function(module,exports,require){
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

},{"@voldecade/engine":5}],
32:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalJson = void 0;
const canonicalValue = (value, inArray = false) => {
    if (value === null)
        return "null";
    if (typeof value === "string" || typeof value === "boolean")
        return JSON.stringify(value);
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            throw new TypeError("canonical JSON does not support non-finite numbers");
        return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((entry) => {
            if (entry === undefined)
                throw new TypeError("canonical JSON does not support undefined array entries");
            return canonicalValue(entry, true);
        }).join(",")}]`;
    }
    if (typeof value === "object") {
        const record = value;
        const entries = Object.keys(record)
            .filter((key) => record[key] !== undefined)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${canonicalValue(record[key])}`);
        return `{${entries.join(",")}}`;
    }
    if (inArray)
        throw new TypeError("unsupported canonical JSON array value");
    throw new TypeError(`unsupported canonical JSON value: ${typeof value}`);
};
const canonicalJson = (value) => canonicalValue(value);
exports.canonicalJson = canonicalJson;

},{}],
33:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyCampaignReplay = exports.encodeCampaignReplay = exports.hashGameState = exports.ReplayVerificationError = void 0;
const ai_1 = require("@voldecade/ai");
const engine_1 = require("@voldecade/engine");
const canonical_1 = require("./canonical");
const campaign_run_1 = require("./campaign-run");
const sha256_1 = require("./sha256");
class ReplayVerificationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ReplayVerificationError";
    }
}
exports.ReplayVerificationError = ReplayVerificationError;
const hashGameState = (state) => (0, sha256_1.sha256)((0, canonical_1.canonicalJson)(state));
exports.hashGameState = hashGameState;
const endReasonOf = (state) => {
    if (state.outcome.kind !== "CAMPAIGN_ENDED")
        throw new ReplayVerificationError("campaign has not ended");
    return state.outcome.reason;
};
const encodeCampaignReplay = (run) => ({
    schemaVersion: engine_1.SCHEMA_VERSION,
    rulesetId: engine_1.RULESET_V2.id,
    engineVersion: engine_1.ENGINE_VERSION,
    aiVersion: ai_1.AI_VERSION,
    mapGeneratorVersion: engine_1.MAP_GENERATOR_VERSION,
    seed: run.controller.seedRoot,
    startStage: run.startStage,
    inputs: run.inputs,
    inputHash: (0, sha256_1.sha256)((0, canonical_1.canonicalJson)(run.inputs)),
    endReason: endReasonOf(run.controller.state),
    finalStateHash: (0, exports.hashGameState)(run.controller.state),
    score: (0, engine_1.getCampaignScore)(run.controller),
});
exports.encodeCampaignReplay = encodeCampaignReplay;
const assertVersion = (actual, expected, label) => {
    if (actual !== expected)
        throw new ReplayVerificationError(`unsupported ${label}: ${String(actual)}`);
};
const verifyCampaignReplay = (replay) => {
    assertVersion(replay.schemaVersion, engine_1.SCHEMA_VERSION, "schemaVersion");
    assertVersion(replay.rulesetId, engine_1.RULESET_V2.id, "rulesetId");
    assertVersion(replay.engineVersion, engine_1.ENGINE_VERSION, "engineVersion");
    assertVersion(replay.aiVersion, ai_1.AI_VERSION, "aiVersion");
    assertVersion(replay.mapGeneratorVersion, engine_1.MAP_GENERATOR_VERSION, "mapGeneratorVersion");
    if (!Array.isArray(replay.inputs))
        throw new ReplayVerificationError("replay inputs must be an array");
    const startStage = replay.startStage ?? 1;
    if (!Number.isInteger(startStage) || startStage < 1 || startStage > 10) {
        throw new ReplayVerificationError("replay startStage must be from 1 to 10");
    }
    let run = (0, campaign_run_1.createCampaignRun)(replay.seed, startStage);
    for (let index = 0; index < replay.inputs.length; index += 1) {
        try {
            run = (0, campaign_run_1.advanceCampaignRun)(run, replay.inputs[index]).run;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new ReplayVerificationError(`invalid replay input at turn ${index + 1}: ${message}`);
        }
    }
    if ((0, sha256_1.sha256)((0, canonical_1.canonicalJson)(replay.inputs)) !== replay.inputHash) {
        throw new ReplayVerificationError("replay input hash does not match");
    }
    const endReason = endReasonOf(run.controller.state);
    if (endReason !== replay.endReason)
        throw new ReplayVerificationError("replay end reason does not match");
    const stateHash = (0, exports.hashGameState)(run.controller.state);
    if (stateHash !== replay.finalStateHash)
        throw new ReplayVerificationError("replay final state hash does not match");
    return { state: run.controller.state, turns: replay.inputs.length, stateHash };
};
exports.verifyCampaignReplay = verifyCampaignReplay;

},{"@voldecade/ai":3,"@voldecade/engine":5,"./canonical":32,"./campaign-run":2,"./sha256":34}],
34:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sha256 = void 0;
const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const rotateRight = (value, bits) => (value >>> bits) | (value << (32 - bits));
const sha256 = (text) => {
    const input = new TextEncoder().encode(text);
    const bitLength = input.length * 8;
    const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
    const bytes = new Uint8Array(paddedLength);
    bytes.set(input);
    bytes[input.length] = 0x80;
    const view = new DataView(bytes.buffer);
    view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
    view.setUint32(paddedLength - 4, bitLength >>> 0, false);
    const hash = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];
    const words = new Uint32Array(64);
    for (let offset = 0; offset < bytes.length; offset += 64) {
        for (let index = 0; index < 16; index += 1)
            words[index] = view.getUint32(offset + index * 4, false);
        for (let index = 16; index < 64; index += 1) {
            const w15 = words[index - 15];
            const w2 = words[index - 2];
            const s0 = rotateRight(w15, 7) ^ rotateRight(w15, 18) ^ (w15 >>> 3);
            const s1 = rotateRight(w2, 17) ^ rotateRight(w2, 19) ^ (w2 >>> 10);
            words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
        }
        let [a, b, c, d, e, f, g, h] = hash;
        for (let index = 0; index < 64; index += 1) {
            const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
            const choice = (e & f) ^ (~e & g);
            const temp1 = (h + sum1 + choice + K[index] + words[index]) >>> 0;
            const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
            const majority = (a & b) ^ (a & c) ^ (b & c);
            const temp2 = (sum0 + majority) >>> 0;
            h = g;
            g = f;
            f = e;
            e = (d + temp1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (temp1 + temp2) >>> 0;
        }
        hash[0] = (hash[0] + a) >>> 0;
        hash[1] = (hash[1] + b) >>> 0;
        hash[2] = (hash[2] + c) >>> 0;
        hash[3] = (hash[3] + d) >>> 0;
        hash[4] = (hash[4] + e) >>> 0;
        hash[5] = (hash[5] + f) >>> 0;
        hash[6] = (hash[6] + g) >>> 0;
        hash[7] = (hash[7] + h) >>> 0;
    }
    return hash.map((value) => value.toString(16).padStart(8, "0")).join("");
};
exports.sha256 = sha256;

},{}],
35:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSessionSummary = exports.getGroupCasterPreview = exports.confirmDraftWithAiDecision = exports.confirmDraft = exports.setSessionPaused = exports.selectNextUndraftedCharacter = exports.getIndividualDraftPreview = exports.quickDraftIsComplete = exports.requestMerge = exports.setDraftFuse = exports.isDirectionAvailable = exports.canChooseInfiniteFuse = exports.requestDraftPlacement = exports.setDraftDirectionWithPlacement = exports.toggleDraftPlacement = exports.setDraftDirection = exports.changeControlMode = exports.selectCharacter = exports.restoreGameSession = exports.createGameSession = exports.freshDraft = exports.DEFAULT_FUSE_PREFERENCES = void 0;
const engine_1 = require("@voldecade/engine");
const replay_1 = require("@voldecade/replay");
const client_control_1 = require("../controls/client-control");
exports.DEFAULT_FUSE_PREFERENCES = {
    group: "EIGHT_TURNS",
    individual: ["EIGHT_TURNS", "EIGHT_TURNS"],
};
const idle = (fuse = "EIGHT_TURNS") => ({
    move: "NONE",
    placeMagic: false,
    ...(fuse === "INFINITE" ? { fuse } : {}),
});
const resetIndividualSelection = (control) => control.mode === "INDIVIDUAL" ? { ...control, selectedCharacterId: 0 } : control;
const freshDraft = (mode, preferences = exports.DEFAULT_FUSE_PREFERENCES) => mode === "GROUP"
    ? { kind: "group", move: "NONE", placeMagic: false, fuse: preferences.group }
    : { kind: "individual", actions: [idle(preferences.individual[0]), idle(preferences.individual[1])] };
exports.freshDraft = freshDraft;
const createGameSession = (seed, stageNumber = 1) => ({
    run: (0, replay_1.createCampaignRun)(seed, stageNumber),
    input: { control: (0, client_control_1.createInitialControlState)(0), draft: (0, exports.freshDraft)("GROUP") },
    events: [],
    paused: false,
    draftedCharacterIds: [],
    fusePreferences: exports.DEFAULT_FUSE_PREFERENCES,
});
exports.createGameSession = createGameSession;
const restoreGameSession = (run, control = (0, client_control_1.createInitialControlState)(0), savedFusePreferences = exports.DEFAULT_FUSE_PREFERENCES) => {
    const fusePreferences = availableFusePreferences(run.controller.state, savedFusePreferences);
    return {
        run,
        input: { control: resetIndividualSelection(control), draft: (0, exports.freshDraft)(control.mode, fusePreferences) },
        events: [],
        paused: false,
        draftedCharacterIds: [],
        fusePreferences,
    };
};
exports.restoreGameSession = restoreGameSession;
const selectCharacter = (session, characterId) => {
    if (!(0, engine_1.teamCharacterIds)(0).includes(characterId))
        throw new Error("player character required");
    const [firstId, secondId] = (0, engine_1.teamCharacterIds)(0);
    if (session.input.control.mode === "INDIVIDUAL" &&
        characterId === secondId &&
        !session.draftedCharacterIds.includes(firstId))
        return session;
    return { ...session, input: { ...session.input, control: { ...session.input.control, selectedCharacterId: characterId } } };
};
exports.selectCharacter = selectCharacter;
const changeControlMode = (session, mode) => {
    const control = resetIndividualSelection((0, client_control_1.switchControlMode)(session.input.control, session.run.controller.state, mode));
    return { ...session, input: { control, draft: (0, exports.freshDraft)(mode, session.fusePreferences) }, draftedCharacterIds: [] };
};
exports.changeControlMode = changeControlMode;
const updateIndividualAction = (intent, characterId, update) => {
    const [firstId, secondId] = (0, engine_1.teamCharacterIds)(0);
    if (characterId !== firstId && characterId !== secondId)
        throw new Error("player character required");
    const index = characterId === firstId ? 0 : 1;
    const actions = [{ ...intent.actions[0] }, { ...intent.actions[1] }];
    actions[index] = update(actions[index]);
    return { kind: "individual", actions };
};
const setDraftDirection = (session, direction) => {
    const draft = session.input.draft ?? (0, exports.freshDraft)(session.input.control.mode, session.fusePreferences);
    const next = draft.kind === "group"
        ? { ...draft, move: direction }
        : draft.kind === "individual"
            ? updateIndividualAction(draft, session.input.control.selectedCharacterId, (action) => ({ ...action, move: direction }))
            : draft;
    const selected = session.input.control.selectedCharacterId;
    const draftedCharacterIds = draft.kind === "individual" && !session.draftedCharacterIds.includes(selected)
        ? [...session.draftedCharacterIds, selected]
        : session.draftedCharacterIds;
    return { ...session, input: { ...session.input, draft: next }, draftedCharacterIds };
};
exports.setDraftDirection = setDraftDirection;
const toggleDraftPlacement = (session) => {
    const draft = session.input.draft ?? (0, exports.freshDraft)(session.input.control.mode, session.fusePreferences);
    const next = draft.kind === "group"
        ? { ...draft, placeMagic: !draft.placeMagic }
        : draft.kind === "individual"
            ? updateIndividualAction(draft, session.input.control.selectedCharacterId, (action) => ({
                ...action,
                placeMagic: !action.placeMagic,
            }))
            : draft;
    return { ...session, input: { ...session.input, draft: next } };
};
exports.toggleDraftPlacement = toggleDraftPlacement;
/** Set a direction while explicitly choosing whether this action places magic. */
const setDraftDirectionWithPlacement = (session, direction, placeMagic) => {
    const directed = (0, exports.setDraftDirection)(session, direction);
    const draft = directed.input.draft;
    const current = draft?.kind === "group"
        ? draft.placeMagic
        : draft?.kind === "individual"
            ? draft.actions[directed.input.control.selectedCharacterId === 0 ? 0 : 1].placeMagic
            : false;
    return current === placeMagic ? directed : (0, exports.toggleDraftPlacement)(directed);
};
exports.setDraftDirectionWithPlacement = setDraftDirectionWithPlacement;
const requestDraftPlacement = (session) => {
    const draft = session.input.draft ?? (0, exports.freshDraft)(session.input.control.mode, session.fusePreferences);
    const alreadyRequested = draft.kind === "group"
        ? draft.placeMagic
        : draft.kind === "individual"
            ? draft.actions[session.input.control.selectedCharacterId === 0 ? 0 : 1].placeMagic
            : false;
    return alreadyRequested ? session : (0, exports.toggleDraftPlacement)(session);
};
exports.requestDraftPlacement = requestDraftPlacement;
const canChooseInfiniteFuse = (session) => {
    const state = session.run.controller.state;
    const characterId = session.input.control.mode === "GROUP"
        ? (0, exports.getGroupCasterPreview)(session)
        : session.input.control.selectedCharacterId;
    if (characterId === null)
        return false;
    const character = state.characters[characterId];
    const active = state.magics.filter((magic) => magic.ownerId === characterId).length;
    return character.capacity - active > 1;
};
exports.canChooseInfiniteFuse = canChooseInfiniteFuse;
/** Returns whether the selected movement can succeed and, when requested, place a magic. */
const isDirectionAvailable = (session, direction, placeMagic) => {
    const state = session.run.controller.state;
    const selected = session.input.control.selectedCharacterId;
    const action = { move: direction, placeMagic: false };
    const actions = [
        { move: "NONE", placeMagic: false },
        { move: "NONE", placeMagic: false },
        { move: "NONE", placeMagic: false },
        { move: "NONE", placeMagic: false },
    ];
    const controlledIds = session.input.control.mode === "GROUP" ? [0, 1] : [selected];
    for (const characterId of controlledIds)
        actions[characterId] = action;
    const movement = (0, engine_1.resolveMovement)(state, actions).movements;
    if (!controlledIds.every((characterId) => movement[characterId].succeeded))
        return false;
    if (!placeMagic)
        return true;
    const casterId = session.input.control.mode === "GROUP"
        ? (0, engine_1.selectGroupCaster)([state.characters[0], state.characters[1]], state.magics)
        : selected;
    if (casterId === null)
        return false;
    const character = state.characters[casterId];
    const active = state.magics.filter((magic) => magic.ownerId === casterId).length;
    return character.alive && character.capacity - active > 0;
};
exports.isDirectionAvailable = isDirectionAvailable;
const setDraftFuse = (session, fuse) => {
    const effectiveFuse = fuse === "INFINITE" && (0, exports.canChooseInfiniteFuse)(session) ? "INFINITE" : "EIGHT_TURNS";
    const draft = session.input.draft ?? (0, exports.freshDraft)(session.input.control.mode, session.fusePreferences);
    const next = draft.kind === "group"
        ? { ...draft, fuse: effectiveFuse }
        : draft.kind === "individual"
            ? updateIndividualAction(draft, session.input.control.selectedCharacterId, (action) => ({ ...action, fuse: effectiveFuse }))
            : draft;
    const fusePreferences = session.input.control.mode === "GROUP"
        ? { ...session.fusePreferences, group: effectiveFuse }
        : {
            ...session.fusePreferences,
            individual: session.input.control.selectedCharacterId === 0
                ? [effectiveFuse, session.fusePreferences.individual[1]]
                : [session.fusePreferences.individual[0], effectiveFuse],
        };
    return { ...session, input: { ...session.input, draft: next }, fusePreferences };
};
exports.setDraftFuse = setDraftFuse;
const requestMerge = (session) => ({
    ...session,
    input: { ...session.input, draft: { kind: "merge", anchorId: session.input.control.selectedCharacterId } },
});
exports.requestMerge = requestMerge;
const quickDraftIsComplete = (session) => {
    const draft = session.input.draft;
    if (draft?.kind === "group" || draft?.kind === "merge")
        return true;
    return draft?.kind === "individual" && session.draftedCharacterIds.length === 2;
};
exports.quickDraftIsComplete = quickDraftIsComplete;
const getIndividualDraftPreview = (session) => {
    if (session.input.control.mode !== "INDIVIDUAL" || session.draftedCharacterIds.length !== 1 || !session.draftedCharacterIds.includes(0))
        return undefined;
    const draft = session.input.draft;
    if (draft?.kind !== "individual")
        return undefined;
    const state = session.run.controller.state;
    const action = draft.actions[0];
    const remaining = state.characters[0].capacity - state.magics.filter(magic => magic.ownerId === 0).length;
    const movement = (0, engine_1.resolveMovement)(state, [
        action,
        { move: "NONE", placeMagic: false },
        { move: "NONE", placeMagic: false },
        { move: "NONE", placeMagic: false },
    ]).movements[0];
    return {
        characterId: 0,
        position: movement.to,
        placeMagic: movement.action.placeMagic && remaining > 0,
        fuse: action.fuse ?? "EIGHT_TURNS",
    };
};
exports.getIndividualDraftPreview = getIndividualDraftPreview;
const selectNextUndraftedCharacter = (session) => {
    if (session.input.control.mode !== "INDIVIDUAL")
        return session;
    const next = (0, engine_1.teamCharacterIds)(0).find((id) => !session.draftedCharacterIds.includes(id));
    return next === undefined ? session : (0, exports.selectCharacter)(session, next);
};
exports.selectNextUndraftedCharacter = selectNextUndraftedCharacter;
const setSessionPaused = (session, paused) => ({ ...session, paused });
exports.setSessionPaused = setSessionPaused;
const canCharacterChooseInfiniteFuse = (state, characterId) => {
    const character = state.characters[characterId];
    const active = state.magics.filter((magic) => magic.ownerId === characterId).length;
    return character.alive && character.capacity - active > 1;
};
const availableFusePreferences = (state, preferences) => {
    const caster = (0, engine_1.selectGroupCaster)([state.characters[0], state.characters[1]], state.magics);
    const groupCanUseInfinite = caster !== null && canCharacterChooseInfiniteFuse(state, caster);
    return {
        group: preferences.group === "INFINITE" && groupCanUseInfinite ? "INFINITE" : "EIGHT_TURNS",
        individual: [
            preferences.individual[0] === "INFINITE" && canCharacterChooseInfiniteFuse(state, 0) ? "INFINITE" : "EIGHT_TURNS",
            preferences.individual[1] === "INFINITE" && canCharacterChooseInfiniteFuse(state, 1) ? "INFINITE" : "EIGHT_TURNS",
        ],
    };
};
const confirmDraft = (session) => {
    if (session.paused)
        throw new Error("backgrounded campaign is paused");
    if (session.run.controller.state.outcome.kind !== "ONGOING")
        throw new Error("campaign has ended");
    const intent = session.input.draft ?? (0, exports.freshDraft)(session.input.control.mode, session.fusePreferences);
    const advanced = (0, replay_1.advanceCampaignRun)(session.run, intent);
    const applied = (0, client_control_1.applyCampaignTurnToClientState)(session.input, intent, advanced.turn);
    const control = resetIndividualSelection(applied.control);
    const fusePreferences = availableFusePreferences(advanced.run.controller.state, session.fusePreferences);
    return {
        session: {
            run: advanced.run,
            input: { ...applied, control, draft: (0, exports.freshDraft)(control.mode, fusePreferences) },
            events: advanced.turn.events,
            paused: false,
            draftedCharacterIds: [],
            fusePreferences,
        },
        aiNodesVisited: advanced.aiNodesVisited,
        ...(advanced.turn.stageEndState === undefined ? {} : { stageTransitionState: advanced.turn.stageEndState }),
    };
};
exports.confirmDraft = confirmDraft;
const confirmDraftWithAiDecision = (session, decision) => {
    if (session.paused)
        throw new Error("backgrounded campaign is paused");
    if (session.run.controller.state.outcome.kind !== "ONGOING")
        throw new Error("campaign has ended");
    const intent = session.input.draft ?? (0, exports.freshDraft)(session.input.control.mode, session.fusePreferences);
    const state = {
        ...session.run.controller.state,
        rngStates: {
            ...session.run.controller.state.rngStates,
            ai: [session.run.controller.state.rngStates.ai[0], decision.nextRngState],
        },
    };
    const turn = (0, engine_1.resolveCampaignTurn)({ ...session.run.controller, state }, intent, decision.intent);
    const run = { controller: turn.controller, inputs: [...session.run.inputs, intent], startStage: session.run.startStage,
        ...(!turn.stageChanged && decision.chainPlan !== undefined ? { chainPlan: decision.chainPlan } : {}),
    };
    const applied = (0, client_control_1.applyCampaignTurnToClientState)(session.input, intent, turn);
    const control = resetIndividualSelection(applied.control);
    const fusePreferences = availableFusePreferences(run.controller.state, session.fusePreferences);
    return {
        session: {
            run,
            input: { ...applied, control, draft: (0, exports.freshDraft)(control.mode, fusePreferences) },
            events: turn.events,
            paused: false,
            draftedCharacterIds: [],
            fusePreferences,
        },
        aiNodesVisited: decision.nodesVisited,
        ...(turn.stageEndState === undefined ? {} : { stageTransitionState: turn.stageEndState }),
    };
};
exports.confirmDraftWithAiDecision = confirmDraftWithAiDecision;
const getGroupCasterPreview = (session) => {
    const state = session.run.controller.state;
    return (0, engine_1.selectGroupCaster)([state.characters[0], state.characters[1]], state.magics);
};
exports.getGroupCasterPreview = getGroupCasterPreview;
const getSessionSummary = (session) => {
    const state = session.run.controller.state;
    const progress = (0, engine_1.getCampaignProgress)(state);
    return {
        stage: progress.stageNumber,
        cycle: progress.cycle,
        clearedStages: progress.clearedStages,
        remainingTurns: Math.max(0, engine_1.RULESET_V2.campaignTurnLimit - state.turn),
    };
};
exports.getSessionSummary = getSessionSummary;

},{"@voldecade/engine":5,"@voldecade/replay":1,"../controls/client-control":36}],
36:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyCampaignTurnToClientState = exports.applyTurnResultToControlState = exports.switchControlMode = exports.resetControlForStage = exports.createInitialControlState = void 0;
const engine_1 = require("@voldecade/engine");
const canUseGroupMode = (game, teamId) => {
    const [firstId, secondId] = (0, engine_1.teamCharacterIds)(teamId);
    const first = game.characters[firstId];
    const second = game.characters[secondId];
    return first.alive && second.alive && (0, engine_1.samePosition)(first.position, second.position);
};
/** Initial game and every campaign stage use group mode by default. */
const createInitialControlState = (teamId) => ({
    teamId,
    mode: "GROUP",
    selectedCharacterId: (0, engine_1.teamCharacterIds)(teamId)[0],
});
exports.createInitialControlState = createInitialControlState;
const resetControlForStage = (state) => ({
    ...state,
    mode: "GROUP",
    selectedCharacterId: (0, engine_1.teamCharacterIds)(state.teamId)[0],
});
exports.resetControlForStage = resetControlForStage;
const switchControlMode = (state, game, mode) => {
    if (mode === "GROUP" && !canUseGroupMode(game, state.teamId)) {
        throw new Error("group mode requires two living characters on the same cell");
    }
    return { ...state, mode };
};
exports.switchControlMode = switchControlMode;
/** Applies a confirmed turn; merge mode changes only after the resulting positions are known. */
const applyTurnResultToControlState = (state, submittedIntent, result) => {
    const grouped = canUseGroupMode(result, state.teamId);
    if (submittedIntent.kind === "merge")
        return { ...state, mode: grouped ? "GROUP" : "INDIVIDUAL" };
    if (state.mode === "GROUP" && !grouped)
        return { ...state, mode: "INDIVIDUAL" };
    return state;
};
exports.applyTurnResultToControlState = applyTurnResultToControlState;
const applyCampaignTurnToClientState = (state, submittedIntent, result) => ({
    control: result.stageChanged
        ? (0, exports.resetControlForStage)(state.control)
        : (0, exports.applyTurnResultToControlState)(state.control, submittedIntent, result.state),
    draft: null,
});
exports.applyCampaignTurnToClientState = applyCampaignTurnToClientState;

},{"@voldecade/engine":5}],
37:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.directionForKeyboardEvent = void 0;
const directionsByKey = {
    ArrowUp: "UP",
    ArrowRight: "RIGHT",
    ArrowDown: "DOWN",
    ArrowLeft: "LEFT",
    w: "UP",
    W: "UP",
    d: "RIGHT",
    D: "RIGHT",
    s: "DOWN",
    S: "DOWN",
    a: "LEFT",
    A: "LEFT",
    x: "NONE",
    X: "NONE",
};
const directionsByCode = {
    KeyW: "UP",
    KeyD: "RIGHT",
    KeyS: "DOWN",
    KeyA: "LEFT",
    KeyX: "NONE",
};
const directionForKeyboardEvent = (event) => directionsByKey[event.key] ?? directionsByCode[event.code];
exports.directionForKeyboardEvent = directionForKeyboardEvent;

},{}],
38:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiWorkerClient = void 0;
const engine_1 = require("@voldecade/engine");
const ai_1 = require("@voldecade/ai");
const ai_generation_1 = require("../workers/ai-generation");
class AiWorkerClient {
    constructor(worker) {
        this.worker = worker;
        this.generations = new ai_generation_1.AiGenerationController();
        this.pending = null;
        worker.onmessage = (event) => {
            const decision = this.generations.accept(event.data);
            if (decision === null || this.pending?.generationId !== event.data.generationId)
                return;
            const pending = this.pending;
            this.pending = null;
            pending.resolve(decision);
        };
        worker.onerror = () => {
            const pending = this.pending;
            this.pending = null;
            pending?.reject(new Error("AI Workerでエラーが発生しました"));
        };
    }
    decide(state, chainPlan) {
        this.cancel();
        const generationId = this.generations.beginGeneration();
        return new Promise((resolve, reject) => {
            this.pending = { generationId, resolve, reject };
            this.worker.postMessage({
                generationId,
                observation: (0, ai_1.toObservation)(state, 1),
                stage: (0, engine_1.getStageProfileNumber)((0, engine_1.getCampaignProgress)(state).stageNumber),
                rngState: state.rngStates.ai[1],
                ...(chainPlan === undefined ? {} : { chainPlan }),
            });
        });
    }
    cancel() {
        if (this.pending !== null)
            this.pending.reject(new Error("古いAI計算を破棄しました"));
        this.pending = null;
        this.generations.beginGeneration();
    }
}
exports.AiWorkerClient = AiWorkerClient;

},{"@voldecade/engine":5,"@voldecade/ai":3,"../workers/ai-generation":39}],
39:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiGenerationController = void 0;
/** Tracks run generations so a late worker response cannot affect a newer run. */
class AiGenerationController {
    constructor() {
        this.generation = 0;
    }
    beginGeneration() {
        this.generation += 1;
        return this.generation;
    }
    currentGeneration() {
        return this.generation;
    }
    accept(result) {
        return result.generationId === this.generation ? result.decision : null;
    }
}
exports.AiGenerationController = AiGenerationController;

},{}],
40:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IndexedDbLocalStore = exports.validateStoredReplays = void 0;
const replay_1 = require("@voldecade/replay");
const validateStoredReplays = (keys, values) => {
    const valid = [];
    const invalidKeys = [];
    values.forEach((replay, index) => {
        const key = keys[index];
        if (key === undefined)
            return;
        try {
            (0, replay_1.verifyCampaignReplay)(replay);
            valid.push({ key, replay });
        }
        catch {
            invalidKeys.push(key);
        }
    });
    return { valid, invalidKeys };
};
exports.validateStoredReplays = validateStoredReplays;
const requestResult = (request) => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
});
class IndexedDbLocalStore {
    constructor(indexedDb = indexedDB) {
        this.database = new Promise((resolve, reject) => {
            const request = indexedDb.open("voldecade-local-v1", 2);
            request.onupgradeneeded = () => {
                const database = request.result;
                if (database.objectStoreNames.contains("campaign"))
                    database.deleteObjectStore("campaign");
                if (!database.objectStoreNames.contains("replays"))
                    database.createObjectStore("replays", { autoIncrement: true });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
        });
    }
    async store(name, mode) {
        const database = await this.database;
        return database.transaction(name, mode).objectStore(name);
    }
    async saveReplay(replay) {
        (0, replay_1.verifyCampaignReplay)(replay);
        await requestResult((await this.store("replays", "readwrite")).add(replay));
    }
    async deleteReplay(key) {
        const objectStore = await this.store("replays", "readwrite");
        await new Promise((resolve, reject) => {
            const transaction = objectStore.transaction;
            transaction.oncomplete = () => resolve();
            transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error("リプレイを削除できませんでした。"));
            objectStore.delete(key);
        });
    }
    async listReplays() {
        const objectStore = await this.store("replays", "readonly");
        const [keys, values] = await Promise.all([
            requestResult(objectStore.getAllKeys()),
            requestResult(objectStore.getAll()),
        ]);
        const checked = (0, exports.validateStoredReplays)(keys, values);
        if (checked.invalidKeys.length > 0) {
            const writable = await this.store("replays", "readwrite");
            await Promise.all(checked.invalidKeys.map((key) => requestResult(writable.delete(key))));
        }
        // Auto-increment keys follow save order; IndexedDB returns them ascending.
        return { records: [...checked.valid].reverse(), removedInvalid: checked.invalidKeys.length };
    }
}
exports.IndexedDbLocalStore = IndexedDbLocalStore;

},{"@voldecade/replay":1}],
41:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adjacentStageFrame = exports.clampReplayFrame = exports.buildReplayTimeline = exports.selectReplayHighlight = void 0;
const engine_1 = require("@voldecade/engine");
const replay_1 = require("@voldecade/replay");
/** Inclusive action-frame range; frame zero is an initial board, not a turn. */
const selectReplayHighlight = (timeline) => {
    if (timeline.frames.length < 2)
        return null;
    let stageStart = 1;
    let bestStage = 0;
    let selected = null;
    for (let index = 1; index < timeline.frames.length; index += 1) {
        const frame = timeline.frames[index];
        if (frame.events.some((event) => event.kind === "STAGE_CLEARED")) {
            // The preceding run is still in the stage whose actions this frame resolves.
            // The current run may already contain the next stage's initial board.
            const stage = (0, engine_1.getCampaignProgress)(timeline.frames[index - 1].run.controller.state).stageNumber;
            if (stage >= bestStage) {
                bestStage = stage;
                selected = { start: Math.max(stageStart, index - 39), end: index };
            }
        }
        if (frame.events.some((event) => event.kind === "STAGE_STARTED"))
            stageStart = index + 1;
    }
    // No victories: show the end of the starting stage, including a defeat.
    const end = timeline.frames.length - 1;
    return selected ?? { start: Math.max(stageStart, end - 39), end };
};
exports.selectReplayHighlight = selectReplayHighlight;
/** Verify a replay and reconstruct every turn for interactive playback. */
const buildReplayTimeline = (replay) => {
    (0, replay_1.verifyCampaignReplay)(replay);
    let run = (0, replay_1.createCampaignRun)(replay.seed, replay.startStage ?? 1);
    const frames = [{ run, events: [], resolvedActions: null }];
    const stageStarts = [0];
    let previousStage = (0, engine_1.getCampaignProgress)(run.controller.state).stageNumber;
    for (const input of replay.inputs) {
        const advanced = (0, replay_1.advanceCampaignRun)(run, input);
        run = advanced.run;
        const stage = (0, engine_1.getCampaignProgress)(run.controller.state).stageNumber;
        frames.push({
            run,
            events: advanced.turn.events,
            resolvedActions: advanced.turn.resolvedActions,
            ...(advanced.turn.stageEndState === undefined ? {} : { videoState: advanced.turn.stageEndState }),
        });
        if (stage !== previousStage)
            stageStarts.push(frames.length - 1);
        previousStage = stage;
    }
    return { replay, frames, stageStarts };
};
exports.buildReplayTimeline = buildReplayTimeline;
const clampReplayFrame = (timeline, index) => Math.max(0, Math.min(timeline.frames.length - 1, Math.trunc(index)));
exports.clampReplayFrame = clampReplayFrame;
const adjacentStageFrame = (timeline, current, direction) => {
    let stageIndex = 0;
    timeline.stageStarts.forEach((start, index) => { if (start <= current)
        stageIndex = index; });
    return timeline.stageStarts[stageIndex + direction] ?? current;
};
exports.adjacentStageFrame = adjacentStageFrame;

},{"@voldecade/engine":5,"@voldecade/replay":1}],
42:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveSettings = exports.loadSettings = exports.normalizeSettings = exports.DEFAULT_SETTINGS = void 0;
exports.DEFAULT_SETTINGS = Object.freeze({
    volume: 0.5,
});
const normalizeSettings = (value) => ({
    volume: Math.max(0, Math.min(1, Number.isFinite(value.volume) ? value.volume : exports.DEFAULT_SETTINGS.volume)),
});
exports.normalizeSettings = normalizeSettings;
const loadSettings = (storage) => {
    try {
        const raw = storage.getItem("voldecade-settings-v1");
        return raw === null ? exports.DEFAULT_SETTINGS : (0, exports.normalizeSettings)(JSON.parse(raw));
    }
    catch {
        return exports.DEFAULT_SETTINGS;
    }
};
exports.loadSettings = loadSettings;
const saveSettings = (storage, settings) => {
    storage.setItem("voldecade-settings-v1", JSON.stringify((0, exports.normalizeSettings)(settings)));
};
exports.saveSettings = saveSettings;

},{}],
43:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CharacterSpriteLayer = void 0;
const sprite_assets_1 = require("./sprite-assets");
const board_layout_1 = require("./board-layout");
/** Independent DOM layer: PNG sequences continue even while turns are idle.
 * Terrain and magic remain on the canvas and can acquire their own layers later. */
class CharacterSpriteLayer {
    constructor() {
        this.layer = null;
        this.canvas = null;
        this.state = null;
        this.previewLayer = null;
        this.actors = new Map();
        this.timers = new Set();
        this.facing = ["f", "f", "f", "f"];
    }
    clear() {
        this.timers.forEach(clearTimeout);
        this.timers.clear();
        this.layer?.remove();
        this.previewLayer?.remove();
        this.layer = null;
        this.canvas = null;
        this.previewLayer = null;
        this.actors.clear();
        this.state = null;
    }
    render(canvas, state, events, preview) {
        if (!(0, sprite_assets_1.characterSpritesEnabled)())
            return;
        if (this.canvas === canvas && this.state === state)
            return;
        // Input controls can rerender without advancing a turn. Reattach the same
        // image elements to preserve playback rather than restarting their animation.
        if (this.state === state && this.layer) {
            canvas.parentElement.append(this.layer);
            this.renderPreview(canvas, state, preview);
            this.canvas = canvas;
            return;
        }
        const stageChanged = events.some(e => e.kind === "STAGE_STARTED");
        if (!this.state || state.turn < this.state.turn || stageChanged)
            this.facing = ["f", "f", "f", "f"];
        this.clear();
        this.canvas = canvas;
        this.state = state;
        const host = canvas.parentElement;
        host.classList.add("sprite-board");
        const layer = document.createElement("div");
        layer.className = "character-sprite-layer";
        layer.setAttribute("aria-hidden", "true");
        host.append(layer);
        this.layer = layer;
        const cell = (0, board_layout_1.boardCellSize)(canvas, state);
        for (const c of state.characters) {
            const actor = document.createElement("div");
            actor.className = `board-character team-${c.teamId} character-${c.id}${(0, sprite_assets_1.isSecondCharacter)(c.id) ? " character-secondary" : ""}`;
            actor.style.width = `${cell / canvas.width * 100}%`;
            actor.style.height = `${cell / canvas.height * 100}%`;
            const img = document.createElement("img");
            img.alt = "";
            actor.append(img);
            layer.append(actor);
            this.actors.set(c.id, actor);
            const position = (row, col) => {
                actor.style.left = `${(0, board_layout_1.boardOffset)(col, cell) / canvas.width * 100}%`;
                actor.style.top = `${(0, board_layout_1.boardOffset)(row, cell) / canvas.height * 100}%`;
            };
            const overlapping = state.characters.filter(other => other.position.row === c.position.row && other.position.col === c.position.col);
            const rank = overlapping.findIndex(other => other.id === c.id);
            actor.style.transform = `translateX(${(rank - (overlapping.length - 1) / 2) * 22}%)`;
            const moved = events.find((e) => e.kind === "MOVED" && e.characterId === c.id);
            const placed = events.some(e => e.kind === "MAGIC_PLACED" && e.ownerId === c.id);
            // Keep the left/right split based on rank, but bring the caster forward
            // while the magic-setting animation is playing.
            if (placed)
                actor.style.zIndex = "1";
            if (moved && !stageChanged)
                this.facing[c.id] = moved.to.row < moved.from.row ? "b" : moved.to.row > moved.from.row ? "f" : moved.to.col < moved.from.col ? "l" : "r";
            const facing = this.facing[c.id];
            const later = (fn, ms) => {
                const timer = setTimeout(() => { this.timers.delete(timer); fn(); }, ms);
                this.timers.add(timer);
                return timer;
            };
            let frameTimer;
            const motion = (name) => {
                if (frameTimer !== undefined) {
                    clearTimeout(frameTimer);
                    this.timers.delete(frameTimer);
                }
                frameTimer = undefined;
                const frames = (0, sprite_assets_1.spriteFrames)(c.id, name, facing, state);
                const config = (0, sprite_assets_1.spritesForCharacter)(c.id, state);
                const duration = (0, sprite_assets_1.motionDuration)(config, name, facing, frames.length);
                const loop = name === "stand" || name === "move";
                let index = 0;
                img.src = frames[index];
                actor.dataset.motion = name;
                if (frames.length < 2)
                    return;
                const advance = () => {
                    index = (index + 1) % frames.length;
                    img.src = frames[index];
                    if (loop || index < frames.length - 1)
                        frameTimer = later(advance, duration / frames.length);
                };
                frameTimer = later(advance, duration / frames.length);
            };
            const finish = () => {
                if (!c.alive)
                    motion("lose");
                else if (events.some(e => e.kind === "STAGE_CLEARED") && c.teamId === 0 || state.outcome.kind !== "ONGOING" && state.characters.filter(x => x.teamId === c.teamId && x.alive).length > state.characters.filter(x => x.teamId !== c.teamId && x.alive).length) {
                    motion("win");
                    later(() => motion("stand"), (0, sprite_assets_1.spritesForCharacter)(c.id, state).winMs);
                }
                else
                    motion("stand");
            };
            position(c.position.row, c.position.col);
            if (stageChanged) {
                finish();
                continue;
            }
            const afterMove = () => {
                if (placed) {
                    motion("set");
                    later(finish, (0, sprite_assets_1.spritesForCharacter)(c.id, state).setMs);
                }
                else
                    finish();
            };
            if (moved) {
                motion("move");
                const dx = (moved.from.col - moved.to.col) * 100;
                const dy = (moved.from.row - moved.to.row) * 100;
                actor.animate([{ translate: `${dx}% ${dy}%` }, { translate: "0% 0%" }], { duration: (0, sprite_assets_1.spritesForCharacter)(c.id, state).moveMs, easing: "linear" });
                later(afterMove, (0, sprite_assets_1.spritesForCharacter)(c.id, state).moveMs);
            }
            else
                afterMove();
        }
        this.renderPreview(canvas, state, preview);
    }
    renderPreview(canvas, state, preview) {
        this.previewLayer?.remove();
        this.previewLayer = null;
        this.actors.forEach((actor, id) => { actor.style.opacity = preview?.characterId === id ? "0.35" : ""; });
        if (preview === undefined)
            return;
        const host = canvas.parentElement;
        if (!host)
            return;
        const cell = (0, board_layout_1.boardCellSize)(canvas, state);
        const layer = document.createElement("div");
        layer.className = "character-preview-layer";
        layer.setAttribute("aria-hidden", "true");
        const actor = document.createElement("div");
        actor.className = `board-character preview-character team-${state.characters[preview.characterId].teamId} character-${preview.characterId}${(0, sprite_assets_1.isSecondCharacter)(preview.characterId) ? " character-secondary" : ""}`;
        actor.style.width = `${cell / canvas.width * 100}%`;
        actor.style.height = `${cell / canvas.height * 100}%`;
        actor.style.left = `${(0, board_layout_1.boardOffset)(preview.position.col, cell) / canvas.width * 100}%`;
        actor.style.top = `${(0, board_layout_1.boardOffset)(preview.position.row, cell) / canvas.height * 100}%`;
        const img = document.createElement("img");
        img.alt = "";
        img.src = (0, sprite_assets_1.spriteFrames)(preview.characterId, "stand", "f", state)[0];
        actor.append(img);
        layer.append(actor);
        host.append(layer);
        this.previewLayer = layer;
    }
}
exports.CharacterSpriteLayer = CharacterSpriteLayer;

},{"./sprite-assets":44,"./board-layout":45}],
44:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.motionDuration = exports.animationReferenceDirectory = exports.spriteUrl = exports.spriteFrames = exports.characterSpritesEnabled = exports.framesFor = exports.spritesForCharacter = exports.stageEnemyDirectories = exports.isSecondCharacter = exports.characterSprites = exports.spriteManifest = void 0;
const engine_1 = require("@voldecade/engine");
// The static builder inserts the directory contents into the browser bundle.
const serializedManifest = "{\"base\":{\"icon\":[\"./assets/design/character/base/icon_0001.png\"],\"lose\":[\"./assets/design/character/base/lose_0001.png\",\"./assets/design/character/base/lose_0002.png\"],\"move_b\":[\"./assets/design/character/base/move_b_0001.png\",\"./assets/design/character/base/move_b_0002.png\"],\"move_f\":[\"./assets/design/character/base/move_f_0001.png\",\"./assets/design/character/base/move_f_0002.png\"],\"move_l\":[\"./assets/design/character/base/move_l_0001.png\",\"./assets/design/character/base/move_l_0002.png\"],\"move_r\":[\"./assets/design/character/base/move_r_0001.png\",\"./assets/design/character/base/move_r_0002.png\"],\"set\":[\"./assets/design/character/base/set_0001.png\",\"./assets/design/character/base/set_0002.png\"],\"stand_b\":[\"./assets/design/character/base/stand_b_0001.png\",\"./assets/design/character/base/stand_b_0002.png\"],\"stand_f\":[\"./assets/design/character/base/stand_f_0001.png\",\"./assets/design/character/base/stand_f_0002.png\"],\"stand_l\":[\"./assets/design/character/base/stand_l_0001.png\",\"./assets/design/character/base/stand_l_0002.png\"],\"stand_r\":[\"./assets/design/character/base/stand_r_0001.png\",\"./assets/design/character/base/stand_r_0002.png\"],\"win\":[\"./assets/design/character/base/win_0001.png\",\"./assets/design/character/base/win_0002.png\"]},\"likehuman\":{\"icon\":[\"./assets/design/character/likehuman/icon_0001.png\"],\"lose\":[\"./assets/design/character/likehuman/lose_0001.png\",\"./assets/design/character/likehuman/lose_0002.png\"],\"move_b\":[\"./assets/design/character/likehuman/move_b_0001.png\",\"./assets/design/character/likehuman/move_b_0002.png\"],\"move_f\":[\"./assets/design/character/likehuman/move_f_0001.png\",\"./assets/design/character/likehuman/move_f_0002.png\"],\"move_l\":[\"./assets/design/character/likehuman/move_l_0001.png\",\"./assets/design/character/likehuman/move_l_0002.png\"],\"move_r\":[\"./assets/design/character/likehuman/move_r_0001.png\",\"./assets/design/character/likehuman/move_r_0002.png\"],\"set\":[\"./assets/design/character/likehuman/set_0001.png\",\"./assets/design/character/likehuman/set_0002.png\"],\"stand_b\":[\"./assets/design/character/likehuman/stand_b_0001.png\",\"./assets/design/character/likehuman/stand_b_0002.png\"],\"stand_f\":[\"./assets/design/character/likehuman/stand_f_0001.png\",\"./assets/design/character/likehuman/stand_f_0002.png\"],\"stand_l\":[\"./assets/design/character/likehuman/stand_l_0001.png\",\"./assets/design/character/likehuman/stand_l_0002.png\"],\"stand_r\":[\"./assets/design/character/likehuman/stand_r_0001.png\",\"./assets/design/character/likehuman/stand_r_0002.png\"],\"win\":[\"./assets/design/character/likehuman/win_0001.png\",\"./assets/design/character/likehuman/win_0002.png\"]},\"onebomb\":{\"icon\":[\"./assets/design/character/onebomb/icon_0001.png\"],\"lose\":[\"./assets/design/character/onebomb/lose_0001.png\",\"./assets/design/character/onebomb/lose_0002.png\"],\"move_b\":[\"./assets/design/character/onebomb/move_b_0001.png\",\"./assets/design/character/onebomb/move_b_0002.png\"],\"move_f\":[\"./assets/design/character/onebomb/move_f_0001.png\",\"./assets/design/character/onebomb/move_f_0002.png\"],\"move_l\":[\"./assets/design/character/onebomb/move_l_0001.png\",\"./assets/design/character/onebomb/move_l_0002.png\"],\"move_r\":[\"./assets/design/character/onebomb/move_r_0001.png\",\"./assets/design/character/onebomb/move_r_0002.png\"],\"set\":[\"./assets/design/character/onebomb/set_0001.png\",\"./assets/design/character/onebomb/set_0002.png\"],\"stand_b\":[\"./assets/design/character/onebomb/stand_b_0001.png\",\"./assets/design/character/onebomb/stand_b_0002.png\"],\"stand_f\":[\"./assets/design/character/onebomb/stand_f_0001.png\",\"./assets/design/character/onebomb/stand_f_0002.png\"],\"stand_l\":[\"./assets/design/character/onebomb/stand_l_0001.png\",\"./assets/design/character/onebomb/stand_l_0002.png\"],\"stand_r\":[\"./assets/design/character/onebomb/stand_r_0001.png\",\"./assets/design/character/onebomb/stand_r_0002.png\"],\"win\":[\"./assets/design/character/onebomb/win_0001.png\",\"./assets/design/character/onebomb/win_0002.png\"]},\"plan\":{\"icon\":[\"./assets/design/character/plan/icon_0001.png\"],\"lose\":[\"./assets/design/character/plan/lose_0001.png\",\"./assets/design/character/plan/lose_0002.png\"],\"move_b\":[\"./assets/design/character/plan/move_b_0001.png\",\"./assets/design/character/plan/move_b_0002.png\"],\"move_f\":[\"./assets/design/character/plan/move_f_0001.png\",\"./assets/design/character/plan/move_f_0002.png\"],\"move_l\":[\"./assets/design/character/plan/move_l_0001.png\",\"./assets/design/character/plan/move_l_0002.png\"],\"move_r\":[\"./assets/design/character/plan/move_r_0001.png\",\"./assets/design/character/plan/move_r_0002.png\"],\"set\":[\"./assets/design/character/plan/set_0001.png\",\"./assets/design/character/plan/set_0002.png\"],\"stand_b\":[\"./assets/design/character/plan/stand_b_0001.png\",\"./assets/design/character/plan/stand_b_0002.png\"],\"stand_f\":[\"./assets/design/character/plan/stand_f_0001.png\",\"./assets/design/character/plan/stand_f_0002.png\"],\"stand_l\":[\"./assets/design/character/plan/stand_l_0001.png\",\"./assets/design/character/plan/stand_l_0002.png\"],\"stand_r\":[\"./assets/design/character/plan/stand_r_0001.png\",\"./assets/design/character/plan/stand_r_0002.png\"],\"win\":[\"./assets/design/character/plan/win_0001.png\",\"./assets/design/character/plan/win_0002.png\"]},\"player\":{\"icon\":[\"./assets/design/character/player/icon_0001.png\"],\"lose\":[\"./assets/design/character/player/lose_0001.png\",\"./assets/design/character/player/lose_0002.png\"],\"move_b\":[\"./assets/design/character/player/move_b_0001.png\",\"./assets/design/character/player/move_b_0002.png\"],\"move_f\":[\"./assets/design/character/player/move_f_0001.png\",\"./assets/design/character/player/move_f_0002.png\"],\"move_l\":[\"./assets/design/character/player/move_l_0001.png\",\"./assets/design/character/player/move_l_0002.png\"],\"move_r\":[\"./assets/design/character/player/move_r_0001.png\",\"./assets/design/character/player/move_r_0002.png\"],\"set\":[\"./assets/design/character/player/set_0001.png\",\"./assets/design/character/player/set_0002.png\"],\"stand_b\":[\"./assets/design/character/player/stand_b_0001.png\",\"./assets/design/character/player/stand_b_0002.png\"],\"stand_f\":[\"./assets/design/character/player/stand_f_0001.png\",\"./assets/design/character/player/stand_f_0002.png\"],\"stand_l\":[\"./assets/design/character/player/stand_l_0001.png\",\"./assets/design/character/player/stand_l_0002.png\"],\"stand_r\":[\"./assets/design/character/player/stand_r_0001.png\",\"./assets/design/character/player/stand_r_0002.png\"],\"win\":[\"./assets/design/character/player/win_0001.png\",\"./assets/design/character/player/win_0002.png\"]},\"search\":{\"icon\":[\"./assets/design/character/search/icon_0001.png\"],\"lose\":[\"./assets/design/character/search/lose_0001.png\",\"./assets/design/character/search/lose_0002.png\"],\"move_b\":[\"./assets/design/character/search/move_b_0001.png\",\"./assets/design/character/search/move_b_0002.png\"],\"move_f\":[\"./assets/design/character/search/move_f_0001.png\",\"./assets/design/character/search/move_f_0002.png\"],\"move_l\":[\"./assets/design/character/search/move_l_0001.png\",\"./assets/design/character/search/move_l_0002.png\"],\"move_r\":[\"./assets/design/character/search/move_r_0001.png\",\"./assets/design/character/search/move_r_0002.png\"],\"set\":[\"./assets/design/character/search/set_0001.png\",\"./assets/design/character/search/set_0002.png\"],\"stand_b\":[\"./assets/design/character/search/stand_b_0001.png\",\"./assets/design/character/search/stand_b_0002.png\"],\"stand_f\":[\"./assets/design/character/search/stand_f_0001.png\",\"./assets/design/character/search/stand_f_0002.png\"],\"stand_l\":[\"./assets/design/character/search/stand_l_0001.png\",\"./assets/design/character/search/stand_l_0002.png\"],\"stand_r\":[\"./assets/design/character/search/stand_r_0001.png\",\"./assets/design/character/search/stand_r_0002.png\"],\"win\":[\"./assets/design/character/search/win_0001.png\",\"./assets/design/character/search/win_0002.png\"]},\"sides\":{\"icon\":[\"./assets/design/character/sides/icon_0001.png\"],\"lose\":[\"./assets/design/character/sides/lose_0001.png\",\"./assets/design/character/sides/lose_0002.png\"],\"move_b\":[\"./assets/design/character/sides/move_b_0001.png\",\"./assets/design/character/sides/move_b_0002.png\"],\"move_f\":[\"./assets/design/character/sides/move_f_0001.png\",\"./assets/design/character/sides/move_f_0002.png\"],\"move_l\":[\"./assets/design/character/sides/move_l_0001.png\",\"./assets/design/character/sides/move_l_0002.png\"],\"move_r\":[\"./assets/design/character/sides/move_r_0001.png\",\"./assets/design/character/sides/move_r_0002.png\"],\"set\":[\"./assets/design/character/sides/set_0001.png\",\"./assets/design/character/sides/set_0002.png\"],\"stand_b\":[\"./assets/design/character/sides/stand_b_0001.png\",\"./assets/design/character/sides/stand_b_0002.png\"],\"stand_f\":[\"./assets/design/character/sides/stand_f_0001.png\",\"./assets/design/character/sides/stand_f_0002.png\"],\"stand_l\":[\"./assets/design/character/sides/stand_l_0001.png\",\"./assets/design/character/sides/stand_l_0002.png\"],\"stand_r\":[\"./assets/design/character/sides/stand_r_0001.png\",\"./assets/design/character/sides/stand_r_0002.png\"],\"win\":[\"./assets/design/character/sides/win_0001.png\",\"./assets/design/character/sides/win_0002.png\"]}}";
exports.spriteManifest = serializedManifest.startsWith("__") ? {} : JSON.parse(serializedManifest);
const player = { directory: "player", moveMs: 240, setMs: 400, winMs: 3510, frameMs: 100 };
// Assign another asset directory here to change one character independently.
exports.characterSprites = {
    0: player, 1: player, 2: player, 3: player,
};
/** Character 1 in each team is the secondary visual variant. */
const isSecondCharacter = (id) => id === 1 || id === 3;
exports.isSecondCharacter = isSecondCharacter;
// Enemy artwork by campaign stage; allies always use their character setting.
exports.stageEnemyDirectories = Object.fromEntries(engine_1.STAGE_DEFINITIONS.map((definition, index) => [index + 1, definition.series]));
function spritesForCharacter(id, state) {
    const base = exports.characterSprites[id];
    if (!state || state.mode !== "CAMPAIGN" || state.characters[id].teamId === 0)
        return base;
    const stage = (state.clearedStages ?? 0) % 10 + 1;
    const directory = exports.stageEnemyDirectories[stage];
    return directory ? { ...base, directory } : base;
}
exports.spritesForCharacter = spritesForCharacter;
function framesFor(manifest, directory, motion, facing = "f") {
    const key = motion === "stand" || motion === "move" ? `${motion}_${facing}` : motion;
    const frames = manifest[directory]?.[key];
    if (!frames?.length)
        throw new Error(`Missing character frames: ${directory}/${key}`);
    return frames;
}
exports.framesFor = framesFor;
const characterSpritesEnabled = () => Object.keys(exports.spriteManifest).length > 0;
exports.characterSpritesEnabled = characterSpritesEnabled;
const spriteFrames = (id, motion, facing = "f", state) => framesFor(exports.spriteManifest, spritesForCharacter(id, state).directory, motion, facing);
exports.spriteFrames = spriteFrames;
const spriteUrl = (id, motion, facing = "f", state) => (0, exports.spriteFrames)(id, motion, facing, state)[0];
exports.spriteUrl = spriteUrl;
// Match the cycle duration of 01, regardless of each character's frame count.
exports.animationReferenceDirectory = "base";
function motionDuration(config, motion, facing, frameCount) {
    if (motion === "move")
        return config.moveMs;
    if (motion === "set")
        return config.setMs;
    if (motion === "win")
        return config.winMs;
    const key = motion === "stand" ? `stand_${facing}` : motion;
    const referenceCount = exports.spriteManifest[exports.animationReferenceDirectory]?.[key]?.length;
    return (referenceCount || frameCount) * config.frameMs;
}
exports.motionDuration = motionDuration;

},{"@voldecade/engine":5}],
45:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.boardOffset = exports.boardCellSize = void 0;
const boardCellSize = (canvas, state) => Math.min(canvas.width / Math.max(1, state.width - 1), canvas.height / Math.max(1, state.height - 1));
exports.boardCellSize = boardCellSize;
const boardOffset = (index, cell) => index === 0 ? 0 : (index - 0.5) * cell;
exports.boardOffset = boardOffset;

},{}],
46:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MagicSpriteLayer = exports.visibleMagicSprites = exports.magicSpriteUrl = exports.magicSpriteAssets = void 0;
const board_layout_1 = require("./board-layout");
exports.magicSpriteAssets = ["bomb_000.png", "bomb_001.png", "fire_0.png", "fire_1.png", ...Array.from({ length: 9 }, (_, i) => `number_${i + 1}.png`), "number_i.png"];
const magicSpriteUrl = (file) => `./assets/design/bomb/${file}`;
exports.magicSpriteUrl = magicSpriteUrl;
// Co-located circles share one visual, with the earliest natural ignition.
function visibleMagicSprites(state) {
    const cells = new Map();
    for (const magic of state.magics) {
        const remaining = magic.detonateTurn === null ? null : Math.max(0, magic.detonateTurn - state.turn);
        const key = `${magic.position.row}:${magic.position.col}`;
        const previous = cells.get(key);
        if (!previous || remaining !== null && (previous.remaining === null || remaining < previous.remaining)) {
            cells.set(key, { ...magic.position, remaining });
        }
    }
    return [...cells.values()];
}
exports.visibleMagicSprites = visibleMagicSprites;
/** CSS steps animate independently of turn input or canvas redraws. */
class MagicSpriteLayer {
    constructor() {
        this.layer = null;
        this.state = null;
        this.previewLayer = null;
    }
    clear() { this.layer?.remove(); this.previewLayer?.remove(); this.layer = null; this.previewLayer = null; this.state = null; }
    render(canvas, state, preview) {
        const host = canvas.parentElement;
        if (!host)
            return;
        if (this.state === state && this.layer) {
            if (this.layer.parentElement !== host)
                host.append(this.layer);
            this.renderPreview(canvas, state, preview);
            return;
        }
        this.clear();
        this.state = state;
        const layer = document.createElement("div");
        layer.className = "magic-sprite-layer";
        layer.setAttribute("aria-hidden", "true");
        const cell = (0, board_layout_1.boardCellSize)(canvas, state);
        for (const { row, col, remaining } of visibleMagicSprites(state)) {
            const sprite = document.createElement("div");
            sprite.className = "magic-sprite";
            Object.assign(sprite.style, {
                left: `${(0, board_layout_1.boardOffset)(col, cell) / canvas.width * 100}%`, top: `${(0, board_layout_1.boardOffset)(row, cell) / canvas.height * 100}%`,
                width: `${cell / canvas.width * 100}%`, height: `${cell / canvas.height * 100}%`,
            });
            for (const file of ["bomb_000.png", "bomb_001.png"]) {
                const frame = document.createElement("img");
                frame.src = (0, exports.magicSpriteUrl)(file);
                frame.alt = "";
                frame.className = "magic-frame";
                sprite.append(frame);
            }
            if (remaining === null || remaining >= 1 && remaining <= 9) {
                const number = document.createElement("img");
                number.src = (0, exports.magicSpriteUrl)(`number_${remaining ?? "i"}.png`);
                number.alt = "";
                number.className = "magic-number";
                sprite.append(number);
            }
            else {
                const number = document.createElement("span");
                number.className = "magic-number-fallback";
                number.textContent = String(remaining);
                sprite.append(number);
            }
            layer.append(sprite);
        }
        const blastCells = new Set();
        for (const { row, col } of state.lastBlastCells) {
            const key = `${row}:${col}`;
            if (blastCells.has(key))
                continue;
            blastCells.add(key);
            const sprite = document.createElement("div");
            sprite.className = "magic-sprite blast-sprite";
            Object.assign(sprite.style, {
                left: `${(0, board_layout_1.boardOffset)(col, cell) / canvas.width * 100}%`, top: `${(0, board_layout_1.boardOffset)(row, cell) / canvas.height * 100}%`,
                width: `${cell / canvas.width * 100}%`, height: `${cell / canvas.height * 100}%`,
            });
            for (const file of ["fire_0.png", "fire_1.png"]) {
                const frame = document.createElement("img");
                frame.src = (0, exports.magicSpriteUrl)(file);
                frame.alt = "";
                frame.className = "magic-frame";
                sprite.append(frame);
            }
            layer.append(sprite);
        }
        host.append(layer);
        this.layer = layer;
        this.renderPreview(canvas, state, preview);
    }
    renderPreview(canvas, state, preview) {
        this.previewLayer?.remove();
        this.previewLayer = null;
        if (!preview?.placeMagic)
            return;
        const host = canvas.parentElement;
        if (!host)
            return;
        const cell = (0, board_layout_1.boardCellSize)(canvas, state);
        const layer = document.createElement("div");
        layer.className = "magic-preview-layer";
        layer.setAttribute("aria-hidden", "true");
        const sprite = document.createElement("div");
        sprite.className = "magic-sprite magic-preview-sprite";
        Object.assign(sprite.style, {
            left: `${(0, board_layout_1.boardOffset)(preview.position.col, cell) / canvas.width * 100}%`, top: `${(0, board_layout_1.boardOffset)(preview.position.row, cell) / canvas.height * 100}%`,
            width: `${cell / canvas.width * 100}%`, height: `${cell / canvas.height * 100}%`,
        });
        const frame = document.createElement("img");
        frame.src = (0, exports.magicSpriteUrl)("bomb_000.png");
        frame.alt = "";
        sprite.append(frame);
        const number = document.createElement("img");
        number.src = (0, exports.magicSpriteUrl)(`number_${preview.fuse === "INFINITE" ? "i" : "8"}.png`);
        number.alt = "";
        number.className = "magic-number";
        sprite.append(number);
        layer.append(sprite);
        host.append(layer);
        this.previewLayer = layer;
    }
}
exports.MagicSpriteLayer = MagicSpriteLayer;

},{"./board-layout":45}],
47:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.campaignReason = exports.drawBoard = exports.renderGameScreen = exports.renderSurvivalBreakdown = exports.boardText = exports.characterActionLabel = exports.eventLabel = void 0;
const engine_1 = require("@voldecade/engine");
const sprite_assets_1 = require("./sprite-assets");
const board_assets_1 = require("./board-assets");
const game_session_1 = require("./game-session");
const board_layout_1 = require("./board-layout");
const escapeHtml = (value) => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const directionLabel = {
    UP: "上",
    RIGHT: "右",
    DOWN: "下",
    LEFT: "左",
    NONE: "停止",
};
const directionButtonSprites = {
    UP: "./assets/design/arrow/u.png",
    RIGHT: "./assets/design/arrow/r.png",
    DOWN: "./assets/design/arrow/d.png",
    LEFT: "./assets/design/arrow/l.png",
    NONE: "./assets/design/arrow/w.png",
};
const magicButtonSprites = {
    UP: "./assets/design/arrow/mu.png",
    RIGHT: "./assets/design/arrow/mr.png",
    DOWN: "./assets/design/arrow/md.png",
    LEFT: "./assets/design/arrow/ml.png",
    NONE: "./assets/design/arrow/mw.png",
};
const eventLabel = (event) => {
    switch (event.kind) {
        case "MOVE_BLOCKED": return `キャラ${event.characterId + 1}の移動失敗`;
        case "ITEM_COLLECTED": return `キャラ${event.characterId + 1}が${event.item === "POWER" ? "火力" : "設置数"}を取得`;
        case "MAGIC_PLACED": return `キャラ${event.ownerId + 1}が魔力球を設置`;
        case "MAGIC_TRIGGERED": return `魔力球${event.magicId}が発動`;
        case "CHARACTER_DEFEATED": return `キャラ${event.characterId + 1}が倒れた`;
        case "STAGE_CLEARED": return `ステージクリア（通算${event.clearedStages}）`;
        case "STAGE_STARTED": return `ステージ${event.stageNumber}「${(0, engine_1.getStageName)(event.stageNumber)}」開始`;
        case "GAME_ENDED": return "ゲーム終了";
        case "MOVED": return `キャラ${event.characterId + 1}が移動`;
        case "SOFT_DESTROYED": return "壊せる壁を破壊";
        case "ITEM_REVEALED": return "アイテム出現";
    }
};
exports.eventLabel = eventLabel;
const characterActionLabel = (action) => `${directionLabel[action.move]}・${action.placeMagic ? `移動後に設置（${action.fuse === "INFINITE" ? "∞" : "8ターン"}）` : "設置なし"}`;
exports.characterActionLabel = characterActionLabel;
const boardText = (state) => {
    const cells = [];
    for (let row = 0; row < state.height; row += 1) {
        for (let col = 0; col < state.width; col += 1) {
            const position = { row, col };
            const occupants = state.characters.filter((character) => character.position.row === row && character.position.col === col);
            const magic = state.magics.find((candidate) => candidate.position.row === row && candidate.position.col === col);
            const item = state.visibleItems[(0, engine_1.positionIndex)(position, state.width)];
            if (occupants.length > 0)
                cells.push(`${row + 1}行${col + 1}列: ${occupants.map((c) => `${c.teamId === 0 ? `味方${c.id + 1}` : `敵${c.id - 1}`}（${c.alive ? "生存" : "戦闘不能"}）`).join("・")}`);
            if (magic !== undefined)
                cells.push(`${row + 1}行${col + 1}列: ${magic.ownerId < 2 ? "味方" : "敵"}魔力球、${magic.detonateTurn === null ? "自然発動なし" : `あと${Math.max(0, magic.detonateTurn - state.turn)}ターン`}`);
            const blockItem = state.hiddenItems[(0, engine_1.positionIndex)(position, state.width)];
            if (blockItem !== null)
                cells.push(`${row + 1}行${col + 1}列: ${blockItem === "POWER" ? "火力" : "設置数"}アイテム入りブロック`);
            if (item !== null)
                cells.push(`${row + 1}行${col + 1}列: ${item === "POWER" ? "火力" : "設置数"}アイテム`);
        }
    }
    return cells.length === 0 ? "盤面上にキャラクター以外の表示物はありません" : cells.join("。") + "。";
};
exports.boardText = boardText;
const renderSurvivalBreakdown = (state) => {
    const friendly = state.characters.filter((character) => character.teamId === 0);
    const enemy = state.characters.filter((character) => character.teamId === 1);
    const friendlyAlive = friendly.filter((character) => character.alive).length;
    const enemyAlive = enemy.filter((character) => character.alive).length;
    const status = (character) => `<li><span>${character.teamId === 0 ? "◆" : "●"}${character.id + 1} キャラ${character.id + 1}</span><strong class="${character.alive ? "alive" : "defeated"}">${character.alive ? "生存" : "戦闘不能"}</strong></li>`;
    const difference = enemyAlive - friendlyAlive;
    const comparison = difference > 0
        ? `敵側が${difference}体多く生き残りました。`
        : difference < 0
            ? `味方側が${-difference}体多く生き残りました。`
            : "両陣営の生存数は同じです。";
    return `<section class="survival-breakdown" aria-label="最終生存状況">
    <p class="survival-count"><strong>味方 生存 ${friendlyAlive}/2</strong><strong>敵 生存 ${enemyAlive}/2</strong></p>
    <div><section><h2>味方</h2><ul>${friendly.map(status).join("")}</ul></section><section><h2>敵</h2><ul>${enemy.map(status).join("")}</ul></section></div>
    <p class="outcome-comparison">${comparison}</p>
  </section>`;
};
exports.renderSurvivalBreakdown = renderSurvivalBreakdown;
const renderGameScreen = (session, warning, developmentPractice = false, displayState, volume = 0.5) => {
    const summary = (0, game_session_1.getSessionSummary)(session);
    const group = session.input.control.mode === "GROUP";
    const state = session.run.controller.state;
    const rosterState = displayState ?? state;
    const draft = session.input.draft;
    const requestedFuse = draft?.kind === "group"
        ? draft.fuse ?? "EIGHT_TURNS"
        : draft?.kind === "individual"
            ? draft.actions[session.input.control.selectedCharacterId === 0 ? 0 : 1].fuse ?? "EIGHT_TURNS"
            : "EIGHT_TURNS";
    const infiniteAvailable = (0, game_session_1.canChooseInfiniteFuse)(session);
    const gameEnded = state.outcome.kind !== "ONGOING";
    const sidePanel = gameEnded
        ? `<section class="control-panel final-board-panel" aria-label="最終盤面の確認">
        <p class="eyebrow">FINAL BOARD</p><h2>最後の盤面</h2>
        <p>青白い雷撃が最後に発動した魔力球の範囲です。盤面を確認してから結果へ進めます。</p>
        ${(0, exports.renderSurvivalBreakdown)(state)}
        <button class="primary" data-action="show-result">結果を見る</button>
      </section>`
        : `<section class="control-panel game-controls" tabindex="0" aria-label="ゲーム操作。矢印またはWASDで移動、Xで停止、Shift併用で設置">
        <div class="mode-row" role="group" aria-label="操作モード">
          <button data-action="mode-toggle" aria-pressed="${group}">操作: ${group ? "2体同時" : "2体個別"}（切替）</button>
          <button data-action="fuse" ${infiniteAvailable ? "" : "disabled"} aria-label="魔力球の自然発動設定">発動: ${requestedFuse === "INFINITE" ? "∞" : "8ターン"} <kbd>F</kbd></button>
        </div>
        <div class="pad-row">
          <div class="pad-group"><div class="direction-pad" aria-label="移動または待機">
            <button data-direction="UP" aria-label="上へ移動" ${(0, game_session_1.isDirectionAvailable)(session, "UP", false) ? "" : "disabled"}><img class="control-button-icon" src="${directionButtonSprites.UP}" alt=""></button>
            <button data-direction="LEFT" aria-label="左へ移動" ${(0, game_session_1.isDirectionAvailable)(session, "LEFT", false) ? "" : "disabled"}><img class="control-button-icon" src="${directionButtonSprites.LEFT}" alt=""></button>
            <button data-direction="NONE" aria-label="待機" ${(0, game_session_1.isDirectionAvailable)(session, "NONE", false) ? "" : "disabled"}><img class="control-button-icon" src="${directionButtonSprites.NONE}" alt=""></button>
            <button data-direction="RIGHT" aria-label="右へ移動" ${(0, game_session_1.isDirectionAvailable)(session, "RIGHT", false) ? "" : "disabled"}><img class="control-button-icon" src="${directionButtonSprites.RIGHT}" alt=""></button>
            <button data-direction="DOWN" aria-label="下へ移動" ${(0, game_session_1.isDirectionAvailable)(session, "DOWN", false) ? "" : "disabled"}><img class="control-button-icon" src="${directionButtonSprites.DOWN}" alt=""></button>
          </div></div>
          <div class="pad-group"><div class="direction-pad" aria-label="移動または待機して魔力球を設置">
            <button data-magic-direction="UP" aria-label="上へ移動して魔力球を設置" ${(0, game_session_1.isDirectionAvailable)(session, "UP", true) ? "" : "disabled"}><img class="control-button-icon" src="${magicButtonSprites.UP}" alt=""></button>
            <button data-magic-direction="LEFT" aria-label="左へ移動して魔力球を設置" ${(0, game_session_1.isDirectionAvailable)(session, "LEFT", true) ? "" : "disabled"}><img class="control-button-icon" src="${magicButtonSprites.LEFT}" alt=""></button>
            <button data-magic-direction="NONE" aria-label="待機して魔力球を設置" ${(0, game_session_1.isDirectionAvailable)(session, "NONE", true) ? "" : "disabled"}><img class="control-button-icon" src="${magicButtonSprites.NONE}" alt=""></button>
            <button data-magic-direction="RIGHT" aria-label="右へ移動して魔力球を設置" ${(0, game_session_1.isDirectionAvailable)(session, "RIGHT", true) ? "" : "disabled"}><img class="control-button-icon" src="${magicButtonSprites.RIGHT}" alt=""></button>
            <button data-magic-direction="DOWN" aria-label="下へ移動して魔力球を設置" ${(0, game_session_1.isDirectionAvailable)(session, "DOWN", true) ? "" : "disabled"}><img class="control-button-icon" src="${magicButtonSprites.DOWN}" alt=""></button>
          </div></div>
        </div>
        <p class="quick-help">方向／<kbd>X</kbd>で即確定。<kbd>Shift</kbd>＋方向／<kbd>X</kbd>で動作後に△を置く。</p>
      </section>`;
    return `<main class="screen game-screen ${session.paused ? "is-paused" : ""}">
    <header class="game-header">
      <button data-route="home" class="quiet">ホーム</button>
      <div><strong>ステージ ${summary.stage}「${(0, engine_1.getStageName)(summary.stage)}」</strong><span>${developmentPractice ? "開発用練習・終了時にリプレイ保存" : `周回 ${summary.cycle} / 通算クリア ${summary.clearedStages}`}</span></div>
      <div class="game-turn"><strong>${state.turn}/1000</strong><span>ターン</span></div>
    </header>
    ${warning === null ? "" : `<p class="warning" role="alert">${escapeHtml(warning)}</p>`}
    ${session.paused ? '<div class="pause-panel" role="alert"><strong>一時停止中</strong><span>画面がバックグラウンドになったため入力を停止しました。</span><button data-action="resume">プレイを再開</button></div>' : ""}
    <section class="play-layout">
      <div class="board-panel">
        <div class="sprite-board"><canvas id="game-board" width="600" height="600" role="img" aria-label="ゲーム盤面"></canvas></div>
        ${(0, sprite_assets_1.characterSpritesEnabled)() ? `<div class="sprite-roster" aria-label="キャラクター情報">${rosterState.characters.map(c => {
        return `<div class="roster-character team-${c.teamId}">
            <div class="roster-heading"><img class="character-icon${(0, sprite_assets_1.isSecondCharacter)(c.id) ? " character-secondary" : ""}" src="${(0, sprite_assets_1.spriteUrl)(c.id, "icon", "f", rosterState)}" alt=""></div>
            <div class="roster-items" aria-label="キャラクターのアイテム">
              <span><img src="${board_assets_1.itemSpriteUrls.POWER}" alt="火力">${c.power}</span>
              <span><img src="${board_assets_1.itemSpriteUrls.CAPACITY}" alt="残り設置数">${c.capacity - rosterState.magics.filter(magic => magic.ownerId === c.id).length}/${c.capacity}</span>
            </div>
          </div>`;
    }).join("")}<label class="roster-volume" for="game-volume">音量<input id="game-volume" data-setting="volume" type="range" min="0" max="1" step="0.1" value="${volume}" aria-label="音量"></label></div>` : ""}
        <p class="sr-only" id="board-state">${escapeHtml((0, exports.boardText)(state))}</p>
      </div>
      ${sidePanel}
    </section>
  </main>`;
};
exports.renderGameScreen = renderGameScreen;
const drawBoard = (canvas, state) => {
    const context = canvas.getContext("2d");
    if (context === null)
        return;
    (0, board_assets_1.prepareBoardSprites)(canvas, () => (0, exports.drawBoard)(canvas, state));
    context.imageSmoothingEnabled = false;
    const cell = (0, board_layout_1.boardCellSize)(canvas, state);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `bold ${Math.max(11, cell * 0.38)}px system-ui`;
    for (let row = 0; row < state.height; row += 1) {
        for (let col = 0; col < state.width; col += 1) {
            const index = row * state.width + col;
            const terrain = state.terrain[index];
            const x = (0, board_layout_1.boardOffset)(col, cell);
            const y = (0, board_layout_1.boardOffset)(row, cell);
            const blockItem = state.hiddenItems[index];
            const softColor = blockItem === "POWER" ? "#9a4f00" : blockItem === "CAPACITY" ? "#176b45" : "#7b6248";
            const isOuterHard = terrain === "HARD" && (row === 0 || col === 0 || row === state.height - 1 || col === state.width - 1);
            const drawX = x;
            const drawY = y;
            const drawWidth = isOuterHard && (col === 0 || col === state.width - 1) ? cell / 2 : cell;
            const drawHeight = isOuterHard && (row === 0 || row === state.height - 1) ? cell / 2 : cell;
            context.fillStyle = terrain === "HARD" ? "#1c2333" : terrain === "SOFT" ? softColor : "#eef1f7";
            context.fillRect(drawX, drawY, drawWidth, drawHeight);
            let terrainDrawn = false;
            const terrainUrl = terrain === "HARD" ? board_assets_1.terrainSpriteUrls.HARD : terrain === "SOFT" ? board_assets_1.terrainSpriteUrls.SOFT : board_assets_1.terrainSpriteUrls.FLOOR;
            if (isOuterHard) {
                context.save();
                context.beginPath();
                context.rect(drawX, drawY, drawWidth, drawHeight);
                context.clip();
                const spriteX = col === 0 ? x - cell / 2 : x;
                const spriteY = row === 0 ? y - cell / 2 : y;
                terrainDrawn = (0, board_assets_1.drawBoardSprite)(context, terrainUrl, spriteX, spriteY, cell);
                context.restore();
            }
            else {
                terrainDrawn = (0, board_assets_1.drawBoardSprite)(context, terrainUrl, x, y, cell);
            }
            context.strokeStyle = "#aeb8c9";
            context.strokeRect(drawX, drawY, drawWidth, drawHeight);
            if (terrain === "SOFT") {
                if (blockItem != null) {
                    if (!(0, board_assets_1.drawBoardSprite)(context, board_assets_1.softBlockSpriteUrls[blockItem], x, y, cell)) {
                        context.fillStyle = "#fff";
                        context.fillText(blockItem === "POWER" ? "P▧" : "C▧", x + cell / 2, y + cell / 2);
                    }
                }
                else if (!terrainDrawn) {
                    context.fillStyle = "#fff";
                    context.fillText("▧", x + cell / 2, y + cell / 2);
                }
            }
            const item = state.visibleItems[index];
            if (item != null && !(0, board_assets_1.drawBoardSprite)(context, board_assets_1.itemSpriteUrls[item], x, y, cell, 0.85)) {
                context.fillStyle = "#111";
                context.fillText(item === "POWER" ? "P" : "C", x + cell / 2, y + cell / 2);
            }
        }
    }
    // Show the future blast footprint before detonation.  The center label below
    // carries the remaining turns (or ∞); this overlay shows where that blast can
    // actually travel, stopping at hard and soft blocks just like the engine.
    const previewCells = new Set();
    for (const magic of state.magics) {
        if (magic.detonateTurn !== null && magic.detonateTurn <= state.turn)
            continue;
        const cells = [{ row: magic.position.row, col: magic.position.col }];
        for (const [dr, dc] of [[-1, 0], [0, 1], [1, 0], [0, -1]]) {
            for (let distance = 1; distance <= magic.power; distance += 1) {
                const row = magic.position.row + dr * distance;
                const col = magic.position.col + dc * distance;
                if (row < 0 || col < 0 || row >= state.height || col >= state.width)
                    break;
                const terrain = state.terrain[row * state.width + col];
                if (terrain === "HARD" || terrain === undefined)
                    break;
                cells.push({ row, col });
                if (terrain === "SOFT")
                    break;
            }
        }
        for (const position of cells)
            previewCells.add(position.row * state.width + position.col);
    }
    context.fillStyle = "rgba(96, 105, 120, .28)";
    for (const index of previewCells)
        context.fillRect((0, board_layout_1.boardOffset)(index % state.width, cell), (0, board_layout_1.boardOffset)(Math.floor(index / state.width), cell), cell, cell);
    for (const character of state.characters) {
        if ((0, sprite_assets_1.characterSpritesEnabled)())
            continue;
        context.fillStyle = character.alive ? (character.teamId === 0 ? "#005bbb" : "#b51f2e") : "#3d4148";
        const baseMark = character.teamId === 0 ? `◆${character.id + 1}` : `●${character.id + 1}`;
        const mark = character.alive ? baseMark : `×${baseMark}`;
        const offset = character.id % 2 === 0 ? -cell * 0.14 : cell * 0.14;
        context.fillText(mark, (0, board_layout_1.boardOffset)(character.position.col, cell) + cell / 2, (0, board_layout_1.boardOffset)(character.position.row, cell) + cell / 2 + offset);
    }
};
exports.drawBoard = drawBoard;
const campaignReason = (state) => {
    if (state.outcome.kind !== "CAMPAIGN_ENDED")
        return "進行中";
    if (state.outcome.reason !== "PLAYER_DEFEATED")
        return `${engine_1.RULESET_V2.campaignTurnLimit}ターンに到達しました`;
    const defeated = state.characters
        .filter((character) => character.teamId === 0 && !character.alive)
        .map((character) => `キャラ${character.id + 1}`)
        .join("と");
    return `${defeated || "味方"}が倒れたため敗北`;
};
exports.campaignReason = campaignReason;

},{"@voldecade/engine":5,"./sprite-assets":44,"./board-assets":48,"./game-session":35,"./board-layout":45}],
48:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.drawBoardSprite = exports.prepareBoardSprites = exports.boardSpriteAssets = exports.itemSpriteUrls = exports.softBlockSpriteUrls = exports.terrainSpriteUrls = void 0;
exports.terrainSpriteUrls = {
    FLOOR: "./assets/design/stage/floor.png",
    SOFT: "./assets/design/stage/soft.png",
    HARD: "./assets/design/stage/hard.png",
};
/** Complete soft-block artwork, including the item concealed inside. */
exports.softBlockSpriteUrls = {
    CAPACITY: "./assets/design/stage/soft_c.png",
    POWER: "./assets/design/stage/soft_p.png",
};
exports.itemSpriteUrls = {
    CAPACITY: "./assets/design/item/item_c.png",
    POWER: "./assets/design/item/item_p.png",
};
exports.boardSpriteAssets = [...Object.values(exports.terrainSpriteUrls), ...Object.values(exports.softBlockSpriteUrls), ...Object.values(exports.itemSpriteUrls)].map(url => url.slice(2));
const images = new Map();
const pendingCanvases = new WeakMap();
let loading;
let settled = false;
const prepareBoardSprites = (canvas, redraw) => {
    if (settled || typeof Image === "undefined")
        return;
    loading ?? (loading = Promise.all(exports.boardSpriteAssets.map(asset => new Promise(resolve => {
        const image = new Image();
        images.set(`./${asset}`, image);
        image.onload = () => resolve();
        image.onerror = () => resolve();
        image.src = `./${asset}`;
    }))).then(() => { settled = true; }));
    const alreadyPending = pendingCanvases.has(canvas);
    pendingCanvases.set(canvas, redraw);
    if (!alreadyPending)
        void loading.then(() => {
            const latest = pendingCanvases.get(canvas);
            pendingCanvases.delete(canvas);
            if (canvas.isConnected !== false)
                latest?.();
        });
};
exports.prepareBoardSprites = prepareBoardSprites;
const drawBoardSprite = (context, url, x, y, cell, scale = 1) => {
    const image = images.get(url);
    if (!image?.complete || image.naturalWidth === 0)
        return false;
    const size = cell * scale;
    const inset = (cell - size) / 2;
    context.drawImage(image, x + inset, y + inset, size, size);
    return true;
};
exports.drawBoardSprite = drawBoardSprite;

},{}],
49:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordLocalRanking = exports.loadLocalRanking = exports.compareCampaignScores = void 0;
const KEY = "voldecade-campaign-ranking-v1";
const turns = (score) => score.turnsToLastClear ?? Number.MAX_SAFE_INTEGER;
const compareCampaignScores = (a, b) => b.clearedStages - a.clearedStages || turns(a) - turns(b) || b.killDifference - a.killDifference;
exports.compareCampaignScores = compareCampaignScores;
const loadLocalRanking = (storage = localStorage) => {
    try {
        const parsed = JSON.parse(storage.getItem(KEY) ?? "[]");
        return Array.isArray(parsed) ? parsed.filter((entry) => entry !== null && typeof entry === "object" && "score" in entry).sort((a, b) => (0, exports.compareCampaignScores)(a.score, b.score)) : [];
    }
    catch {
        return [];
    }
};
exports.loadLocalRanking = loadLocalRanking;
const recordLocalRanking = (entry, storage = localStorage) => {
    const next = [...(0, exports.loadLocalRanking)(storage), entry].sort((a, b) => (0, exports.compareCampaignScores)(a.score, b.score)).slice(0, 100);
    storage.setItem(KEY, JSON.stringify(next));
    return next;
};
exports.recordLocalRanking = recordLocalRanking;

},{}],
50:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.persistOnlineAuth = exports.submitOnlineScore = exports.fetchOnlineRanking = exports.getCachedOnlineRanking = exports.logoutOnline = exports.signInOnline = exports.prepareOnline = exports.getOnlineAuth = exports.ONLINE_RANKING_CACHE_MS = exports.ONLINE_TIMEOUT_MS = void 0;
exports.ONLINE_TIMEOUT_MS = 30000;
exports.ONLINE_RANKING_CACHE_MS = 30000;
const AUTH_KEY = "voldecade-online-auth-v2";
const snapshots = new Map();
const cacheKey = (season) => `voldecade-ranking-cache-v2:${season}`;
let apiPromise = null;
const api = async () => {
    apiPromise ?? (apiPromise = new Function("url", "return import(url)")(new URL("./firebase-online.js", document.baseURI).href).then((loaded) => {
        const candidate = loaded.default;
        return candidate.default ?? candidate;
    }).catch((error) => { apiPromise = null; throw error; }));
    return apiPromise;
};
const cachedAuth = () => {
    try {
        const value = JSON.parse(localStorage.getItem(AUTH_KEY) ?? "null");
        return value && typeof value.name === "string" && typeof value.token === "string" ? value : null;
    }
    catch {
        return null;
    }
};
const validEntries = (entries) => Array.isArray(entries) && entries.every((entry) => entry !== null && typeof entry === "object"
    && typeof entry.name === "string" && Number.isFinite(entry.clearedStages)
    && (entry.turnsToLastClear === null || Number.isFinite(entry.turnsToLastClear))
    && Number.isFinite(entry.killDifference) && Number.isFinite(entry.enemyDefeated) && Number.isFinite(entry.playerDefeated));
const getOnlineAuth = () => cachedAuth();
exports.getOnlineAuth = getOnlineAuth;
const withTimeout = (promise) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("通信に時間がかかっています。時間をおいてもう一度お試しください。")), exports.ONLINE_TIMEOUT_MS);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
});
const prepareOnline = async () => { await withTimeout(api()); };
exports.prepareOnline = prepareOnline;
const signInOnline = async (name) => withTimeout((await api()).signInWithGoogle(name));
exports.signInOnline = signInOnline;
const logoutOnline = () => { void api().then((module) => module.logoutOnline()).catch(() => { }); localStorage.removeItem(AUTH_KEY); };
exports.logoutOnline = logoutOnline;
const getCachedOnlineRanking = (season = "v1") => {
    const memory = snapshots.get(season);
    if (memory !== undefined)
        return memory;
    try {
        const saved = JSON.parse(localStorage.getItem(cacheKey(season)) ?? "null");
        if (saved && validEntries(saved.entries) && Number.isFinite(saved.updatedAt) && Number.isFinite(saved.checkedAt)) {
            snapshots.set(season, saved);
            return saved;
        }
    }
    catch { /* Browser storage is optional. */ }
    return null;
};
exports.getCachedOnlineRanking = getCachedOnlineRanking;
const saveSnapshot = (season, entries) => {
    const snapshot = { entries, updatedAt: Date.now(), checkedAt: Date.now() };
    snapshots.set(season, snapshot);
    try {
        localStorage.setItem(cacheKey(season), JSON.stringify(snapshot));
    }
    catch { /* Memory cache remains available. */ }
};
const fetchOnlineRanking = async (season = "v1", clears, _fresh = false) => {
    const entries = await withTimeout((await api()).fetchOnlineRanking(season));
    if (!validEntries(entries))
        throw new Error("ランキングデータの形式が正しくありません。");
    saveSnapshot(season, entries);
    return clears === undefined ? entries : entries.filter((entry) => entry.clearedStages === clears);
};
exports.fetchOnlineRanking = fetchOnlineRanking;
const submitOnlineScore = async (score, season = "v1") => {
    if ((0, exports.getOnlineAuth)() === null)
        throw new Error("ランキングへ参加するにはGoogleアカウントでログインしてください。");
    const previous = (0, exports.getCachedOnlineRanking)(season);
    if (previous !== null) {
        const invalid = { ...previous, checkedAt: 0 };
        snapshots.set(season, invalid);
        try {
            localStorage.setItem(cacheKey(season), JSON.stringify(invalid));
        }
        catch { /* Memory cache remains available. */ }
    }
    return withTimeout((await api()).submitOnlineScore(score, season));
};
exports.submitOnlineScore = submitOnlineScore;
const persistOnlineAuth = (auth) => {
    if (auth === null)
        localStorage.removeItem(AUTH_KEY);
    else
        localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
};
exports.persistOnlineAuth = persistOnlineAuth;

},{}],
51:[function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SoundManager = void 0;
const soundPaths = {
    bgm: "./assets/sound/bgm.ogg",
    thunder: "./assets/sound/thunder.mp3",
    setMagic: "./assets/sound/set_magic.mp3",
    item: "./assets/sound/item.mp3",
};
const BGM_VOLUME_RATIO = 0.65;
// Video exports use the normal mid-level setting regardless of the in-game slider.
const EXPORT_AUDIO_VOLUME = 0.5;
const findLoopEnd = (buffer) => {
    const data = buffer.getChannelData(0);
    const rate = buffer.sampleRate;
    const start = Math.round(0.45 * rate);
    const window = Math.round(0.08 * rate);
    const minEnd = Math.round(37 * rate);
    const maxEnd = Math.min(data.length - window - 1, Math.round(38 * rate));
    let bestEnd = Math.round(37.5 * rate);
    let bestScore = -Infinity;
    let startEnergy = 0;
    for (let i = 0; i < window; i += 1)
        startEnergy += data[start + i] ** 2;
    for (let candidate = minEnd; candidate <= maxEnd; candidate += Math.max(1, Math.round(rate / 200))) {
        let dot = 0;
        let candidateEnergy = 0;
        for (let i = 0; i < window; i += 1) {
            dot += data[start + i] * data[candidate + i];
            candidateEnergy += data[candidate + i] ** 2;
        }
        const score = dot / Math.sqrt((startEnergy * candidateEnergy) || 1);
        if (score > bestScore) {
            bestScore = score;
            bestEnd = candidate;
        }
    }
    return { start: start / rate, end: bestEnd / rate };
};
class SoundManager {
    constructor() {
        this.effects = new Map();
        this.context = typeof window === "undefined" ? null : new AudioContext();
        this.gain = this.context?.createGain() ?? null;
        this.effectGain = this.context?.createGain() ?? null;
        this.captureDestination = this.context?.createMediaStreamDestination() ?? null;
        this.captureBgmGain = this.context?.createGain() ?? null;
        this.captureEffectGain = this.context?.createGain() ?? null;
        this.bgmBuffer = null;
        this.bgmSource = null;
        this.bgmLoad = null;
        this.bgmLoopStart = 0.45;
        this.bgmLoopEnd = 37.5;
        this.bgmOffset = this.bgmLoopStart;
        this.bgmStartedAt = 0;
        this.volume = 0.5;
        this.gain?.connect(this.context.destination);
        this.effectGain?.connect(this.context.destination);
        if (this.captureDestination !== null) {
            this.captureBgmGain?.connect(this.captureDestination);
            this.captureEffectGain?.connect(this.captureDestination);
        }
        if (this.captureBgmGain !== null)
            this.captureBgmGain.gain.value = EXPORT_AUDIO_VOLUME * BGM_VOLUME_RATIO;
        if (this.captureEffectGain !== null)
            this.captureEffectGain.gain.value = EXPORT_AUDIO_VOLUME;
        for (const key of ["thunder", "setMagic", "item"]) {
            const audio = new Audio(soundPaths[key]);
            audio.preload = "auto";
            this.effects.set(key, audio);
        }
        this.applyVolume();
    }
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        this.applyVolume();
    }
    /** Returns the current game audio stream for local video export. */
    captureAudioTrack() {
        const track = this.captureDestination?.stream.getAudioTracks()[0];
        if (track !== undefined)
            track.enabled = true;
        return track?.clone() ?? null;
    }
    start() {
        void this.startAndWait();
    }
    /** Starts the BGM and waits until its capture node is connected. */
    async startAndWait() {
        if (this.context === null || this.gain === null)
            return false;
        try {
            await this.loadBgm();
            if (this.bgmBuffer !== null && this.bgmSource === null) {
                const source = this.context.createBufferSource();
                const loop = findLoopEnd(this.bgmBuffer);
                this.bgmLoopStart = loop.start;
                this.bgmLoopEnd = loop.end;
                source.buffer = this.bgmBuffer;
                source.loop = true;
                source.loopStart = loop.start;
                source.loopEnd = loop.end;
                source.connect(this.gain);
                if (this.captureBgmGain !== null)
                    source.connect(this.captureBgmGain);
                this.bgmSource = source;
                this.bgmStartedAt = this.context.currentTime;
                source.start(0, this.bgmOffset);
            }
            await this.context.resume();
            return true;
        }
        catch { /* Audio is optional and may be blocked by the browser. */
            return false;
        }
    }
    stop() {
        if (this.bgmSource !== null) {
            try {
                this.bgmSource.stop();
            }
            catch { /* already stopped */ }
            this.bgmSource.disconnect();
            this.bgmSource = null;
        }
        this.bgmOffset = this.bgmLoopStart;
    }
    pause() {
        if (this.context === null || this.bgmSource === null)
            return;
        const elapsed = this.context.currentTime - this.bgmStartedAt;
        const duration = this.bgmLoopEnd - this.bgmLoopStart;
        this.bgmOffset = this.bgmLoopStart + ((this.bgmOffset - this.bgmLoopStart + elapsed) % duration);
        try {
            this.bgmSource.stop();
        }
        catch { /* already stopped */ }
        this.bgmSource.disconnect();
        this.bgmSource = null;
    }
    resume() {
        this.start();
    }
    playEvents(events) {
        for (const event of events) {
            if (event.kind === "MAGIC_TRIGGERED")
                this.play("thunder");
            else if (event.kind === "MAGIC_PLACED")
                this.play("setMagic");
            else if (event.kind === "ITEM_COLLECTED")
                this.play("item");
        }
    }
    async loadBgm() {
        if (this.bgmLoad !== null)
            return this.bgmLoad;
        if (this.context === null)
            return;
        this.bgmLoad = fetch(soundPaths.bgm)
            .then((response) => response.arrayBuffer())
            .then((data) => this.context.decodeAudioData(data))
            .then((buffer) => { this.bgmBuffer = buffer; });
        return this.bgmLoad;
    }
    play(key) {
        const source = this.effects.get(key);
        if (source === undefined)
            return;
        const audio = source.cloneNode(true);
        audio.volume = 1;
        if (this.context !== null && this.effectGain !== null) {
            try {
                const mediaSource = this.context.createMediaElementSource(audio);
                mediaSource.connect(this.effectGain);
                if (this.captureEffectGain !== null)
                    mediaSource.connect(this.captureEffectGain);
                const disconnect = () => { try {
                    mediaSource.disconnect();
                }
                catch { /* already disconnected */ } };
                audio.addEventListener("ended", disconnect, { once: true });
                audio.addEventListener("error", disconnect, { once: true });
                void this.context.resume();
            }
            catch {
                audio.volume = this.volume;
            }
        }
        else {
            audio.volume = this.volume;
        }
        void audio.play().catch(() => { });
    }
    applyVolume() {
        if (this.gain !== null)
            this.gain.gain.value = this.volume * BGM_VOLUME_RATIO;
        if (this.effectGain !== null)
            this.effectGain.gain.value = this.volume;
        for (const audio of this.effects.values())
            audio.volume = this.volume;
    }
}
exports.SoundManager = SoundManager;

},{}]});
