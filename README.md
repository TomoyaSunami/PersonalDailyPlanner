# Daily Canvas

シンプルなデイリープランナーのスタティックサイトです。`index.html`・`style.css`・`main.js`だけで動くのでビルド不要でそのまま配信できます。

## ローカルでの確認

```bash
cd /path/to/repo
python -m http.server 4173
# ブラウザで http://localhost:4173 を開く
```

## GitHub Pages への公開手順

1. このリポジトリを GitHub の `main` ブランチにプッシュする。(`main` 以外なら `.github/workflows/pages.yml` のブランチ指定を変えてください)
2. GitHub のリポジトリ設定 → Pages → Build and deployment で Source を「GitHub Actions」にする。
3. Actions タブで `Deploy GitHub Pages` ワークフローが実行され、完了すると Pages が公開される。初回は数分かかる場合があります。
4. 公開 URL は `https://<your-username>.github.io/<repository-name>/`（ユーザーページの場合は `/` 直下）で、資産パスはすべて相対指定済みのため追加設定は不要です。
