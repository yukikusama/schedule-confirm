# 空き時間チェッカー

複数人のGoogleカレンダーを参照し、指定期間内の共通空き時間を自動で表示するWebアプリです。

## 使い方

1. `index.html` をブラウザで開く（または簡易HTTPサーバーで起動）
2. Googleアカウントでサインイン
3. 対象者のメールアドレスを入力
4. 検索期間・稼働時間帯・最低空き時間を設定
5. 「空き時間を検索」ボタンをクリック

---

## 事前準備: Google Cloud Platformの設定

### 1. GCPプロジェクト作成
1. https://console.cloud.google.com にアクセス
2. 新しいプロジェクトを作成

### 2. Google Calendar API の有効化
1. 「APIとサービス」→「ライブラリ」
2. 「Google Calendar API」を検索して有効化

### 3. OAuth 同意画面の設定
1. 「APIとサービス」→「OAuth同意画面」
2. User Type: **外部** を選択
3. アプリ名・メールアドレスを入力して保存
4. スコープに `https://www.googleapis.com/auth/calendar.freebusy` を追加
5. テストユーザーに自分のGmailを追加

### 4. OAuth 2.0 クライアントIDの作成
1. 「APIとサービス」→「認証情報」→「認証情報を作成」→「OAuthクライアントID」
2. アプリケーションの種類: **ウェブアプリケーション**
3. 承認済みのJavaScriptオリジン:
   - ローカル開発時: `http://localhost:8080`（または使用するポート）
   - ファイル直接開く場合: `http://localhost` は不可。簡易サーバー必須
4. 作成されたクライアントID（`xxxxx.apps.googleusercontent.com`）をコピー

### 5. app.js にクライアントIDを設定
```javascript
// app.js の先頭
const CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
// ↑ここを自分のクライアントIDに変更
```

---

## ローカルでの起動方法

**Python がある場合:**
```bash
cd schedule-confirm
python -m http.server 8080
```
→ `http://localhost:8080` をブラウザで開く

**Node.js がある場合:**
```bash
npx serve .
```

---

## 注意事項

- **相手のカレンダー共有設定**: FreeBusy APIは相手が「予定あり/なし情報の公開」を許可している場合のみ取得可能。Google Workspace（法人）の場合は組織内での共有が必要。
- **個人Gmailアカウント**: 相手が明示的にカレンダーを共有していないと空きとして扱われる（予定なしに見える）場合があります。
- ブラウザからの直接ファイル開き（`file://`）ではOAuthが動作しないため、必ずHTTPサーバー経由で開いてください。
