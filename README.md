# Daily Canvas

シンプルなデイリープランナーの Vite + React + TypeScript PWA です。`index.html`・`src/App.tsx`・`src/main.tsx`・`src/style.css`を中心に、`public/manifest.webmanifest` と `public/sw.js` でインストールとオフライン起動に対応しています。

## ローカルでの確認

```bash
cd /path/to/repo
npm install
npm run dev
# ブラウザで表示された localhost URL を開く
```

PWA として確認する場合は開発サーバーではなく本番ビルドを確認してください。開発中のモジュール配信をキャッシュしないよう、Service Worker は本番ビルド時のみ登録されます。

```bash
npm run build
npm run preview
```

Chrome / Edge ではアドレスバーのインストールアイコン、または DevTools → Application → Manifest / Service Workers から状態を確認できます。

## PWA 構成

- `public/manifest.webmanifest`: アプリ名、テーマカラー、起動 URL、インストール用アイコンを定義
- `public/sw.js`: アプリ本体、ロゴ、アイコンを事前キャッシュし、ビルド成果物をランタイムキャッシュ
- `public/icons/`: 180px、192px、512px の PNG アイコン

キャッシュ対象ファイルを変更した場合は、`public/sw.js` の `CACHE_NAME` を更新すると既存ユーザーのキャッシュを確実に入れ替えられます。

## GitHub Pages への公開手順

1. `npm run build` で `dist/` を生成する。
2. このリポジトリを GitHub の `main` ブランチにプッシュする。(`main` 以外なら `.github/workflows/pages.yml` のブランチ指定を変えてください)
3. GitHub のリポジトリ設定 → Pages → Build and deployment で Source を「GitHub Actions」にする。
4. Actions タブで `Deploy GitHub Pages` ワークフローが実行され、完了すると Pages が公開される。初回は数分かかる場合があります。
5. 公開 URL は `https://<your-username>.github.io/<repository-name>/`（ユーザーページの場合は `/` 直下）で、`vite.config.ts` の `base: './'` によりサブディレクトリ配信にも対応します。
