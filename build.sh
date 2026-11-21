#!/usr/bin/env bash
# خطوات بناء تطبيق «حياتي» لأندرويد — بيشغلها GitHub Actions من ملف .github/workflows/build-apk.yml
# أي تعديل في الخطوات بيبقى هنا، فمش محتاج تعدل ملف الـ workflow تاني.
set -euo pipefail

CERT_SHA256="fe144af18762a216199d5c6a5731145dd15ec5a60be0ecc41c6c8f2d3233be2a"
BT_VER="35.0.0"
RUN_NUMBER="${RUN_NUMBER:-1}"
err() { echo "::error::$1"; exit 1; }

echo "::group::التأكد من مفتاح التوقيع"
[ -n "${KEYSTORE_PASSWORD:-}" ] || err "لسه مضفتش كلمة السر: Settings ← Secrets and variables ← Actions ← New repository secret باسم KEYSTORE_PASSWORD"
[ -f android.keystore ] || err "ملف android.keystore مش مرفوع في المستودع"
keytool -list -keystore android.keystore -storepass "$KEYSTORE_PASSWORD" -alias mylife > /dev/null 2>&1 \
  || err "كلمة السر في KEYSTORE_PASSWORD مش مطابقة لملف android.keystore"
echo "::endgroup::"

echo "::group::تجهيز مشروع أندرويد من إعداداتك وموقعك"
npm ci --no-audit --no-fund
VERSION_CODE="$RUN_NUMBER" node generate.mjs
echo "::endgroup::"

echo "::group::أدوات أندرويد الرسمية"
SDKM="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
yes | "$SDKM" --licenses > /dev/null 2>&1 || true
"$SDKM" "platforms;android-36" "build-tools;$BT_VER" > /dev/null
echo "::endgroup::"

echo "::group::بناء التطبيق"
if ! (cd android && ${GRADLE_CMD:-./gradlew} --no-daemon assembleRelease 2>&1 | tee ../gradle.log); then
  WHY=$(sed -n '/What went wrong:/,/^\* Try:/p' gradle.log | sed '1d;$d' | tr -s '\n' ' ' | cut -c1-700)
  err "البناء فشل — ${WHY:-افتح خطوة البناء وشوف التفاصيل}"
fi
echo "::endgroup::"

echo "::group::التوقيع والتأكد منه"
BT="$ANDROID_HOME/build-tools/$BT_VER"
"$BT/zipalign" -p -f 4 android/app/build/outputs/apk/release/app-release-unsigned.apk aligned.apk
"$BT/apksigner" sign --ks android.keystore --ks-key-alias mylife \
  --ks-pass env:KEYSTORE_PASSWORD --key-pass env:KEYSTORE_PASSWORD --out MyLife.apk aligned.apk
"$BT/apksigner" verify --print-certs MyLife.apk | tee certs.txt
grep -qi "$CERT_SHA256" certs.txt || err "بصمة التوقيع مختلفة عن اللي في assetlinks.json"
echo "::endgroup::"

echo "::group::نشر التطبيق في صفحة التنزيل"
VER=$(node -p "require('./twa-config.json')['رقم_الإصدار']")
TAG="v${VER}-build${RUN_NUMBER}"
LINK="https://github.com/${GITHUB_REPOSITORY:-bodax7/mylife-android}/releases/latest/download/MyLife.apk"
gh release create "$TAG" MyLife.apk --latest \
  --title "حياتي ${VER} (بناء ${RUN_NUMBER})" \
  --notes "نزّل الملف MyLife.apk اللي تحت وافتحه على الموبايل عشان تثبّت أو تحدّث التطبيق. الرابط الثابت لآخر نسخة: ${LINK}"
# نسيب آخر 5 نسخ بس
gh release list --limit 100 --json tagName -q '.[5:][].tagName' | xargs -r -n1 gh release delete --yes --cleanup-tag || true
echo "::endgroup::"

echo "::notice::التطبيق جاهز للتنزيل: ${LINK}"
