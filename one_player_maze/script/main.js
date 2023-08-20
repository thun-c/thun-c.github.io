const BLOCK_SIZE = 48;
const PER_DISTANCE = BLOCK_SIZE / 16;
const dx = [1, -1, 0, 0, 0];//右、左、下、上、無
const dy = [0, 0, 1, -1, 0]
const key_codes = [39, 37, 40, 38]
const DIR_STR = ["R", "L", "D", "U", "N"]
const NO_ACTION = 4;
const MAX_NUMBER = 9 + 1;
var state = null;
var SEED = null;
var W = null;
var H = null;
var END_TURN = null;

var state = null;

class Coord {

    constructor(y = 0, x = 0) {
        this.y_ = y;
        this.x_ = x;
    }
}
class DrawCoord extends Coord {

    constructor(y = 0, x = 0, is_move = false) {
        super(y, x);
        this.is_move_ = is_move;
    }
}

class Random {
    constructor(seed) {
        this.x = 123456789;
        this.y = 362436069;
        this.z = 521288629;
        this.w = seed;
    }

    // XorShift
    next() {
        let t;

        t = this.x ^ (this.x << 11);
        this.x = this.y; this.y = this.z; this.z = this.w;
        this.w = (this.w ^ (this.w >>> 19)) ^ (t ^ (t >>> 8));
        return Math.abs(this.w);
    }
}


class WallMazeState {

    constructor(seed) {
        var rnd = new Random(seed);
        this.game_score_ = 0;
        this.turn_ = 0;
        this.walls_ = new Array(H);
        this.character_ = new DrawCoord(rnd.next() % H, rnd.next() % W);
        for (var y = 0; y < H; y++) {
            this.walls_[y] = new Array(W);
            for (var x = 0; x < W; x++) {
                this.walls_[y][x] = 0;
            }
        }
        this.points_ = new Array(H);
        for (var y = 0; y < H; y++) {
            this.points_[y] = new Array(W);
            for (var x = 0; x < W; x++) {
                this.points_[y][x] = 0;
            }
        }

        for (var y = 1; y < H; y += 2) {
            for (var x = 1; x < W; x += 2) {
                var ty = y;
                var tx = x;
                if (ty === this.character_.y_ && tx === this.character_.x_) {
                    continue;
                }
                this.walls_[ty][tx] = 1;
                var direction_size = 3; // (右、左、下)方向の隣接マスを壁方向にする。
                if (y === 1) {
                    direction_size = 4; // 最初だけ上方向の隣接マスも壁候補にする。
                }
                var direction = rnd.next() % direction_size;
                ty += dy[direction];
                tx += dx[direction];
                // ここで(ty,tx)は1マス置きの位置からランダムに隣接する位置
                if (ty === this.character_.y_ && tx === this.character_.x_) {
                    continue;
                }
                this.walls_[ty][tx] = 1;
            }
        }


        for (var y = 0; y < H; y++) {
            for (var x = 0; x < W; x++) {
                if ((y === this.character_.y_ && x === this.character_.x_) ||
                    this.walls_[y][x] === 1
                ) {
                    continue;
                }
                this.points_[y][x] = rnd.next() % MAX_NUMBER;
            }
        }
    }
    canDo(action) {
        var tx = this.character_.x_ + dx[action];
        var ty = this.character_.y_ + dy[action];
        return (tx >= 0 && tx < W && ty >= 0 && ty < H &&
            this.walls_[ty][tx] === 0);
    }
    isDone() {
        return this.turn_ == END_TURN;
    }

    advance(action) {
        this.character_.x_ += dx[action];
        this.character_.y_ += dy[action];
        var point = this.points_[this.character_.y_][this.character_.x_];
        if (point > 0) {
            this.game_score_ += point;
            this.points_[this.character_.y_][this.character_.x_] = 0;
        }
        this.turn_++;
    }
}




//キーボードのオブジェクトを作成
class Key {
    constructor() {
        this.flags = [false, false, false, false]
        this.push = NO_ACTION;
    }
}

var key = new Key();

function is_equal(y0, x0, y1, x1) {
    return y0 === y1 && x0 === x1;
}

class Drawer {
    constructor() {
        key = new Key();
        //canvasの設定（せってい）
        this.is_twitter_btn_generated = false;
        this.canvas = document.getElementById('canvas');
        this.canvas.width = W * BLOCK_SIZE;		//canvasの横幅（よこはば）
        this.canvas.height = H * BLOCK_SIZE;	//canvasの縦幅（たてはば）
        //コンテキストを取得（しゅとく）
        this.ctx = canvas.getContext('2d');

        //キャラクターのオブジェクトを作成
        this.d_character = new Coord(state.character_.y_ * BLOCK_SIZE, state.character_.x_ * BLOCK_SIZE);
        this.char_imgs = new Array(5);
        for (var di = 0; di < 5; di++) {
            var tdi = di;
            if (tdi === 4) {
                tdi = 2;
            }
            this.char_imgs[di] = new Array(2);
            for (var t = 0; t < 2; t++) {
                this.char_imgs[di][t] = new Image();
                this.char_imgs[di][t].src = `img/${tdi}_${t}.png`;
            }
        }
        this.num_imgs = new Array(MAX_NUMBER);
        for (var number = 0; number < MAX_NUMBER; number++) {
            if (number === 0) {
                this.num_imgs[number] = null;
            } else {
                this.num_imgs[number] = new Image();
                this.num_imgs[number].src = `img/n${number}.png`;
            }
        }
        //マップチップのImageオブジェクトを作る
        this.floor_img = new Image();
        this.floor_img.src = 'img/floor.png';
        this.wall_img = new Image();
        this.wall_img.src = 'img/wall.png';

        this.move_cnt = 0;
        document.getElementById("Message").innerText = "PCのキーボードで【→】、【←】、【↓】、【↑】の4つのキーでキャラクターを動かしましょう。";
        document.getElementById("Message").style = "color:#000000;font-weight:normal  ;font-size : medium;";

    }

    draw() {

        document.getElementById("Score").innerText = state.game_score_;
        document.getElementById("Turn").innerText = `${state.turn_} / ${END_TURN}`;

        if (!this.is_twitter_btn_generated && state.isDone()) {

            twttr.widgets.createShareButton(
                'https://thun-c.github.io/one_player_maze/one_player_maze.html', // shareするurl
                document.getElementById('twitter_btn'),
                {
                    lang: 'ja', // ボタンの表示文字の言語
                    count: 'none',
                    text: `数字集め迷路\nSeed${SEED}W${W}H${H}END_TURN${END_TURN}で\nScore ${state.game_score_}\nを獲得しました。\n`, //ツイートする文面
                    size: "large", //ボタンサイズ
                    hashtags: 'thunder本', // ハッシュタグ
                }
            );
            this.is_twitter_btn_generated = true;
            document.getElementById("Message").innerText = `ゲームがScore ${state.game_score_}で終了しました。\n右のボタンを押してX(旧Twitter)で自慢しましょう！`
            document.getElementById("Message").style = "color:#ff0000;font-weight:bold;font-size : larger;";
        }

        //塗りつぶす色を指定
        this.ctx.fillStyle = "rgb( 100, 0, 0 )";
        //塗りつぶす
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 壁の描画
        for (var y = 0; y < Math.min(state.walls_.length, H); y++) {
            for (var x = 0; x < Math.min(state.walls_[y].length, W); x++) {
                if (state.walls_[y][x] === 0) this.ctx.drawImage(this.floor_img, BLOCK_SIZE * x, BLOCK_SIZE * y, BLOCK_SIZE, BLOCK_SIZE);
                if (state.walls_[y][x] === 1) this.ctx.drawImage(this.wall_img, BLOCK_SIZE * x, BLOCK_SIZE * y, BLOCK_SIZE, BLOCK_SIZE);
            }
        }

        // ポイントの描画
        for (var y = 0; y < Math.min(state.walls_.length, H); y++) {
            for (var x = 0; x < Math.min(state.walls_[y].length, W); x++) {
                var point = state.points_[y][x];
                if (point != 0) {
                    this.ctx.drawImage(this.num_imgs[point], BLOCK_SIZE * x, BLOCK_SIZE * y, BLOCK_SIZE, BLOCK_SIZE);
                }
            }
        }

        const draw_interval = 4;
        const draw_interval_twice = draw_interval * 2;
        // キャラクターを描画
        const turn_id = Math.floor((this.move_cnt % draw_interval_twice) / draw_interval);
        var timg = this.char_imgs[key.push][turn_id];
        this.ctx.drawImage(timg, this.d_character.x_, this.d_character.y_, BLOCK_SIZE, BLOCK_SIZE);

        if (!state.isDone()) {
            //方向キーが押されている場合は、キャラクターが移動する
            if (!this.d_character.is_move_) {
                for (var di = 0; di < 4; di++) {
                    if (key.flags[di] === true) {
                        if (state.canDo(di)) {
                            state.advance(di);
                            key.push = di;
                            this.d_character.is_move_ = true;
                            break;
                        }
                    }
                }

            }
        }

        //character.moveが0より大きい場合は、PER_DISTANCE pxずつ移動を続ける
        if (!is_equal(state.character_.y_, state.character_.x_, this.d_character.y_ / BLOCK_SIZE, this.d_character.x_ / BLOCK_SIZE)) {
            for (var di = 0; di < 4; di++) {
                if (key.push === di) {
                    this.d_character.x_ += dx[di] * PER_DISTANCE;
                    this.d_character.y_ += dy[di] * PER_DISTANCE;
                    break;
                }
            }
            this.move_cnt += 1;

        } else {
            this.move_cnt = 0;
            this.d_character.is_move_ = false
        }
    }
}

function setCorrectInput(id, check_odd = false) {
    var max = document.getElementById(id).max;
    var min = document.getElementById(id).min;
    var value = document.getElementById(id).value;
    if (!value.match(/^[0-9]+$/)) {
        console.log(`${typeof value} "${value}"`);
        document.getElementById(id).value = 0;
        return;
    }
    value = Number(value);
    max = Number(max);
    min = Number(min);
    if (check_odd === true && value % 2 === 0) {
        value++;
        document.getElementById(id).value = String(value);
    }

    if (value > max) {
        console.log(`value > max ${typeof value} "${value}"`);
        document.getElementById(id).value = String(max);
        return;
    }
    if (value < min) {
        console.log(`value < min ${typeof value} "${value}"`);
        document.getElementById(id).value = String(min);
        return;
    }
}


var drawer = null;
function generate() {
    setCorrectInput("seed");
    setCorrectInput("W", true);
    setCorrectInput("H", true);
    setCorrectInput("END_TURN");

    const node = document.getElementById('twitter_btn');

    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
    SEED = document.getElementById("seed").value;
    W = document.getElementById("W").value;
    H = document.getElementById("H").value;
    END_TURN = document.getElementById("END_TURN").value;
    console.log(`generate ${SEED} ${W} ${END_TURN}`)
    state = new WallMazeState(SEED);
    drawer = new Drawer();

}

generate();


addEventListener("keydown", keydownfunc, false);
addEventListener("keyup", keyupfunc, false);
//メインループ
function main() {
    drawer.draw();

    requestAnimationFrame(main);
}
// //ページと依存（いぞん）している全てのデータが読み込まれたら、メインループ開始
addEventListener('load', main(), false);

//キーボードが押されたときに呼び出される関数（かんすう）
function keydownfunc(event) {
    var key_code = event.keyCode;
    if (37 <= key_code && key_code <= 40) {
        for (var di = 0; di < 4; di++) {
            if (key_code === key_codes[di]) {
                key.flags[di] = true;
            }
        }
        event.preventDefault();		//方向キーでブラウザがスクロールしないようにする
    }
}

//キーボードが放（はな）されたときに呼び出される関数
function keyupfunc(event) {
    var key_code = event.keyCode;
    for (var di = 0; di < 4; di++) {
        if (key_code === key_codes[di]) {
            key.flags[di] = false;
        }
    }
}