# ジャパニーズ英語俳句

英単語をカタカナ読みしたときに5・7・5になるかを判定するWebページです。

```
level 2 / ice cream / island
レベルツー（5）／アイスクリーム（7）／アイランド（5）
```

## 開発

```sh
npm install
npm run dev        # 開発サーバー
npm test           # テスト（Vitest）
npm run typecheck  # 型チェック
npm run build      # dist/ に静的サイトを出力
```

`main` にpushすると、GitHub Actionsでテストとビルドが走り、GitHub Pagesにデプロイされます。初回だけ、リポジトリの Settings → Pages で Source を「GitHub Actions」にしてください。

## しくみ

1. **分かち書き**（`src/haiku/tokenize.ts`）：空白やハイフンで単語に分けます。入力がちょうど3行なら、その改行を句切れとして扱います。
2. **読みの候補**（`src/haiku/readings.ts`）：単語ごとに、自然さを表すコストつきでカタカナ読みの候補を出します。
   - 英単語は e2k モデルのビームサーチで複数候補を出します（`src/e2k/model.ts`）。
   - 機能語のようにモデルが苦手な単語、数字、大文字の略語（AI → エーアイ）は辞書で補います（`src/haiku/dictionary.ts`）。
   - 「サーバー → サーバ」「ハロウィーン → ハロウィン」「ウィ ⇔ ウイ」の揺れを、少し高いコストの候補として追加します。
3. **拍数**（`src/haiku/mora.ts`）：ッ・ン・ーは1拍、小書きのャュョァィゥェォなどは前の字とまとめて1拍と数えます。
4. **5・7・5の探索**（`src/haiku/solver.ts`）：読みの選び方と句切れの位置を動的計画法で探し、コストの合計が最小になる組み合わせを選びます。

5. **共有**（`src/share.ts`）：入力した句と手で変えた読みを `?q=...&r=...` のURLに入れ、そのURL付きでXの投稿画面を開きます。

OGP画像 `public/og.png` は `og/og.html` を1200×630で開いてスクリーンショットしたものです。OGPタグの絶対URLは、CIで GitHub Pages のURLを `SITE_URL` として渡して埋め込んでいます。

誤読を直したいときは、まず `src/haiku/dictionary.ts` に単語を足すのが手軽です。

## 読み推定モデルについて

`public/model-c2k.safetensors` は [Patchethium/e2k](https://github.com/Patchethium/e2k) の英語→カタカナ変換モデル（C2K）です。Wiktionary と JMdict/EDICT から作った辞書で学習されています。`src/e2k/model.ts` は、その推論部分（GRUエンコーダ・デコーダとアテンション）をTypeScriptに移植したものです。e2k のライセンスは Unlicense です（`public/LICENSE-e2k.txt`）。

## ライセンス

MIT（`LICENSE`）。ただし `public/model-c2k.safetensors` は e2k に由来し、Unlicense です。
