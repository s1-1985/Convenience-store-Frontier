# AndroidデモAPK

Web版をCapacitorでAndroidアプリへ包み、GitHub Actionsからインストール可能なdebug APKを生成する。

## CIから取得

1. GitHubの対象PRまたはActionsを開く
2. `Android Demo APK`ワークフローを開く
3. 成功した実行のArtifactsから`convenience-store-frontier-android-demo`を取得する
4. ZIPを展開して`convenience-store-frontier-demo.apk`をAndroid端末へ送る
5. 端末側で提供元不明アプリのインストールを許可し、APKを開く

APKと同時にSHA-256ファイルも出力する。

## ローカルビルド

```bash
npm install
npm run build
rm -rf android
npx cap add android
npx cap sync android
cd android
./gradlew assembleDebug
```

生成先：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## 注意

- 現段階は開発用debug APK
- Playストア公開用の署名鍵は使用しない
- 保存データは端末内のWebViewストレージへ保存する
- アプリ削除やストレージ消去を行うと保存データも消える
