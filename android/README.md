# Pause&Ponder Android companion

Java / Android API 26+ / SDK 35 / AGP 8.9.2 / Gradle 8.11.1 / JDK 17.

Same existing Supabase email/password account; no API keys are embedded. The deployed web endpoint `/api/client-config` provides only the Supabase public URL/key. OpenAI remains on Vercel.

Apply `../supabase/migrations/003_routines.sql` and deploy the updated web code first. See `../ROUTINES_ANDROID_UPDATE.txt` for Korean installation steps.

Open this folder in Android Studio, install SDK 35 and JDK 17, then run:

```sh
./gradlew testDebugUnitTest assembleDebug
```

APK: `app/build/outputs/apk/debug/app-debug.apk`. Default server: `https://pouseponder.vercel.app`. Override with `-PappUrl=https://your-host`. Do not include credentials in this argument. This is a personal test build; Play signing/distribution is not configured.

- MainActivity: login, current routines, actions, sync, permission settings, conflict review and same-account reauthentication.
- CaptureActivity: short input window opened by memo widget; encrypted draft/outbox; retry with stable UUID.
- RemoteViews widgets: capture and next unchecked routine with completion action.
- AlarmManager: eight-day rolling schedule, renewed after notifications, boot, time changes and sync; exact only when permitted.
- WorkManager: network retry and periodic background refresh. Foreground RealtimeBridge subscribes to own routines/logs. Background changes are eventually refreshed, not immediately guaranteed.
- Vault: Android Keystore AES-GCM, no backup. Logout refuses to discard unsent inputs. Delete unresolved queued requests explicitly after reviewing the server record. If a login expires, use '로그인 다시 확인' with the same account; pending inputs stay local.

Lockscreen notification public version hides routine title. Widgets intentionally display routine titles on the home screen. Offline data is not recoverable after app deletion. Future APK updates require the same signing key; a locally built debug APK may use a different key from a downloaded one. Sync pending inputs before any uninstall.

Device checks still needed: permission denied, exact-alarm access denied, airplane mode, reboot, force-stop, battery restriction, Fold resize/rotation, font enlargement and TalkBack. Run a routine two minutes ahead and verify completion/snooze/skip. Web direct notifications require an open page and a supporting browser; the native app schedules closed-app notifications.
