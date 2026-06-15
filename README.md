# Daily Canvas

シンプルなデイリープランナーのスタティック PWA です。`index.html`・`style.css`・`main.js`を中心に、`manifest.webmanifest` と `sw.js` でインストールとオフライン起動に対応しています。

## ローカルでの確認

```bash
cd /path/to/repo
python -m http.server 4173
# ブラウザで http://localhost:4173 を開く
```

PWA として確認する場合は `file://` ではなく HTTP サーバー経由で開いてください。Chrome / Edge ではアドレスバーのインストールアイコン、または DevTools → Application → Manifest / Service Workers から状態を確認できます。

## PWA 構成

- `manifest.webmanifest`: アプリ名、テーマカラー、起動 URL、インストール用アイコンを定義
- `sw.js`: アプリ本体、CSS、JS、ロゴ、アイコンをキャッシュしてオフライン起動をサポート
- `icons/`: 180px、192px、512px の PNG アイコン

キャッシュ対象ファイルを変更した場合は、`sw.js` の `CACHE_NAME` を更新すると既存ユーザーのキャッシュを確実に入れ替えられます。

## GitHub Pages への公開手順

1. このリポジトリを GitHub の `main` ブランチにプッシュする。(`main` 以外なら `.github/workflows/pages.yml` のブランチ指定を変えてください)
2. GitHub のリポジトリ設定 → Pages → Build and deployment で Source を「GitHub Actions」にする。
3. Actions タブで `Deploy GitHub Pages` ワークフローが実行され、完了すると Pages が公開される。初回は数分かかる場合があります。
4. 公開 URL は `https://<your-username>.github.io/<repository-name>/`（ユーザーページの場合は `/` 直下）で、資産パスはすべて相対指定済みのため追加設定は不要です。
