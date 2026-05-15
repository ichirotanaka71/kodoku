# 入力システム刷新 — dungeon-raid-starter の実装を移植

動作確認済みの `dungeon-raid-starter/src/scenes/GameScene.ts` の
一筆書き入力ロジックを `dungeon-raid` プロジェクトに移植する。

---

## 移植元の핵심ロジック（そのまま使える部分）

### 1. `onPointerDown` — ドラッグ開始

```ts
private onPointerDown(pointer: Phaser.Input.Pointer): void {
  if (this.isAnimating) return;
  const hit = this.gridPosAt(pointer.worldX, pointer.worldY);
  if (!hit) return;

  // dungeon-raid では「プレイヤーマス」からのみ開始
  const playerPos = this.gs.playerPos;
  if (hit.r !== playerPos.r || hit.c !== playerPos.c) return;

  this.isDragging = true;
  this.path = [hit];
  this.setHighlight(hit, true);
  this.redrawChain();
}
```

### 2. `onPointerMove` — バックトラック＋経路延伸（★ここが核心）

```ts
private onPointerMove(pointer: Phaser.Input.Pointer): void {
  if (!this.isDragging || this.path.length === 0) return;

  // ── グリッド外に出たらキャンセル ──
  const boardRight  = this.gridOffsetX + GRID_COLS * (CELL_SIZE + CELL_GAP) - CELL_GAP;
  const boardBottom = this.gridOffsetY + GRID_ROWS * (CELL_SIZE + CELL_GAP) - CELL_GAP;
  if (
    pointer.worldX < this.gridOffsetX || pointer.worldX > boardRight ||
    pointer.worldY < this.gridOffsetY || pointer.worldY > boardBottom
  ) {
    this.cancelPath();
    this.isDragging = false;
    return;
  }

  const hit = this.gridPosAt(pointer.worldX, pointer.worldY);
  if (!hit) return;

  const n = this.path.length;
  const last = this.path[n - 1];
  if (last.r === hit.r && last.c === hit.c) return; // 同じマス → 無視

  // ── バックトラック（★Uターン時に末尾をpopして縮める） ──
  if (n >= 2) {
    const prev = this.path[n - 2];
    if (prev.r === hit.r && prev.c === hit.c) {
      this.setHighlight(this.path[n - 1], false);
      this.path.pop();
      this.redrawChain();
      this._updateStepInfo();
      return;
    }
  }

  // ── 通常の延伸チェック ──
  if (!this.isAdjacent(last, hit)) return;
  if (this.path.length - 1 >= this.gs.player.maxSteps) return;

  // ★ inChain チェックは行わない（同じマスへの再訪問を許可）

  this.path.push(hit);
  this.setHighlight(hit, true);
  this.redrawChain();
  this._updateStepInfo();
}
```

### 3. `onPointerUp` — 離したら確定

```ts
private onPointerUp(pointer: Phaser.Input.Pointer): void {
  if (!this.isDragging) return;
  this.isDragging = false;

  // グリッド外で離した場合はキャンセル
  const hit = this.gridPosAt(pointer.worldX, pointer.worldY);
  const isOutside = !hit;

  if (isOutside || this.path.length < 2) {
    this.cancelPath();
    return;
  }

  // 終着点が敵マスならキャンセル
  if (!this.gs.isValidDestination(this.path)) {
    this._flashMsg('終着点は敵マス以外にしてください');
    this.cancelPath();
    return;
  }

  this._confirmMove();
}
```

### 4. `gridPosAt` — ワールド座標 → グリッド座標変換

```ts
private gridPosAt(worldX: number, worldY: number): { r: number; c: number } | null {
  const c = Math.floor((worldX - this.gridOffsetX) / (CELL_SIZE + CELL_GAP));
  const r = Math.floor((worldY - this.gridOffsetY) / (CELL_SIZE + CELL_GAP));
  if (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS) return null;

  // タイル中心との距離チェック（タイルの隙間に入り込まないように）
  const cx = this.gridOffsetX + c * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2;
  const cy = this.gridOffsetY + r * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2;
  if (Math.abs(worldX - cx) > CELL_SIZE / 2 || Math.abs(worldY - cy) > CELL_SIZE / 2) return null;

  return { r, c };
}
```

※ 既存の `_pointerToCell()` をこの実装で**置き換える**。
  移植元は `TILE_SIZE / 2` でタイル外縁チェックをしており、
  これによりタイル間の隙間でのチラつきが防止される。

### 5. `isAdjacent` — 8方向隣接判定

```ts
private isAdjacent(a: {r:number,c:number}, b: {r:number,c:number}): boolean {
  return (
    Math.abs(a.r - b.r) <= 1 &&
    Math.abs(a.c - b.c) <= 1 &&
    !(a.r === b.r && a.c === b.c)
  );
}
```

### 6. `setHighlight` — タイルハイライト

```ts
private setHighlight(pos: {r:number,c:number}, active: boolean): void {
  const bg = this.cellBgs[pos.r][pos.c];
  if (!bg) return;
  if (active) {
    bg.setStrokeStyle(3, 0xffffff);
  } else {
    bg.setStrokeStyle(0);
  }
}
```

※ 既存のセル背景色変更（`setFillStyle`）と併用してOK。

---

## 既存コードからの削除・変更点

### 削除する処理

`_extendOrTrimPath()` 内の以下のブロックを削除する（バックトラックは `onPointerMove` 内で処理するため）：

```js
// ★ 削除
const existIdx = this.path.findIndex((p, i) => i > 0 && p.r === r && p.c === c)
if (existIdx > 0) {
  this.path = this.path.slice(0, existIdx + 1)
  ...
}
```

### `_setupInput()` の全面置き換え

既存の `_setupInput()` を削除し、上記の `onPointerDown` / `onPointerMove` / `onPointerUp` に差し替える。

```js
// create() 内の登録
this.input.on('pointerdown', this.onPointerDown, this);
this.input.on('pointermove', this.onPointerMove, this);
this.input.on('pointerup',   this.onPointerUp,   this);
```

キーボードショートカット（Enter/Esc）は既存のまま維持してOK。

---

## 移植元との主な差分

| 項目 | dungeon-raid-starter | dungeon-raid（今回） |
|---|---|---|
| チェイン開始マス | 任意のタイル | プレイヤーマスのみ |
| 同一マス再訪問 | `inChain()` で禁止 | **許可**（複数回攻撃のため） |
| チェイン最小長 | 3個 | **2マス**（1歩から有効） |
| 確定タイミング | `pointerup` | `pointerup`（同じ） |
| グリッド外キャンセル | `pointermove` 内 | `pointermove` + `pointerup` の両方 |
| バックトラック | `pop()` で縮める | 同じ（CHANGES4.md と一致） |

---

## 変更ファイル

| ファイル | 変更内容 |
|---|---|
| `src/scenes/GameScene.js` | `_setupInput()` を削除し `onPointerDown/Move/Up` に置換、`_pointerToCell()` を `gridPosAt()` に置換、`setHighlight()` 追加、`isAdjacent()` を新実装に差し替え |
