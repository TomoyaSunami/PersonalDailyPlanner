# DayFlow UI デザインシステム仕様書

## 1. デザインコンセプト

本UIは「Glassmorphism（グラスモーフィズム）」をベースに、清潔感とモダンな透明感を追求したインターフェースです。

### コア原則

* **固定テーマ適用**：Cool (Glacial Blue) テーマを採用。
* **透明性の強調**：backdrop-blur-lg、bg-white/40 による階層表現。
* **マイクロインタラクション**：hover や focus による影・浮き上がり表現。

## 2. 固定カラーシステム（Cool Theme）

| カラーロール         | 用途               | Tailwind Class       |
| -------------- | ---------------- | -------------------- |
| text.primary   | 見出し、重要情報         | text-slate-800       |
| text.secondary | 本文、補助情報          | text-slate-600       |
| text.accent    | プライマリアクション、アイコン色 | text-indigo-600      |
| bg.primary     | プライマリーボタン背景      | bg-indigo-500        |
| bg.surface     | カード背景（半透明）       | bg-white/40          |
| shadow.glow    | ボタンの輝き           | shadow-indigo-500/20 |

## 3. インタラクション仕様

すべての要素に `transition-all duration-300` を適用。

### A. グラスカード / コンテナ

* Default: bg-white/40, shadow-sm, backdrop-blur-md, border border-white/60
* Hover: hover:shadow-lg, hover:scale-[1.01], hover:-translate-y-1

### B. プライマリーボタン

* Default: プライマリ背景 + 弱い光沢影
* Hover: hover:shadow-xl, hover:-translate-y-0.5
* Glow Effect: group-hover:translate-x-[100%] transition-transform duration-1000

### C. 入力フィールド

* Default: bg-white/40, border border-white/60, opacity-70
* Focus: focus:bg-white/70, focus:ring-4 focus:ring-white/50

### D. 折り畳みトグル

* アイコンのみ（▾/▸）、左側に配置
* 押下時に親セクションの開閉状態を反映してアイコンが切替

## 4. 主なコンポーネント詳細

### 4.1 Primary Button (.PrimaryAction)

* 構造: button + 光沢アニメーション div
* Styling: rounded-2xl, text-white, group relative overflow-hidden
* Animation: translate-x-[-100%] → group-hover:translate-x-[100%]

### 4.2 Glass Card (.StatsCard / .ProfileCard)

* rounded-3xl, backdrop-blur-lg, border border-white/60
* 内部要素にアクセントカラーやサブ背景を使用し階層表現

### 4.3 List Item (.ListItem)

* 控えめなブラー（backdrop-blur-md）
* Hover: shadow-lg, bg-white/60, scale-[1.01]
* チェック済みタスクは opacity を下げ、タイトルに打消し線

## 5. 実装補足

* **Font**: Inter を使用
* **Responsive**: max-w-6xl を基準に md:, lg: を適用
* **Icon**: lucide-react、strokeWidth={1.5} を使用
