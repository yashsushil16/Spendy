// SPENDY — Kotlin Native Module Templates
// These files are generated here for reference and will be placed
// into android/app/src/main/java/com/spendy/app/ after running:
//   npx expo prebuild --platform android
//
// Section 5a: SMS BroadcastReceiver
// Section 5b: NotificationListenerService
// Section 5c: Bridge to React Native via DeviceEventEmitter

/*
 * ─── SmsReceiver.kt ──────────────────────────────────────────────────────────
 *
 * package com.spendy.app
 *
 * import android.content.BroadcastReceiver
 * import android.content.Context
 * import android.content.Intent
 * import android.telephony.SmsMessage
 * import androidx.work.*
 * import java.util.concurrent.TimeUnit
 *
 * class SmsReceiver : BroadcastReceiver() {
 *     override fun onReceive(context: Context, intent: Intent) {
 *         val bundle = intent.extras ?: return
 *         @Suppress("UNCHECKED_CAST")
 *         val pdus = bundle.get("pdus") as? Array<*> ?: return
 *         for (pdu in pdus) {
 *             val sms = SmsMessage.createFromPdu(pdu as ByteArray)
 *             val sender = sms.originatingAddress ?: continue
 *             val body = sms.messageBody ?: continue
 *             // Hand off to WorkManager — never do heavy work in onReceive
 *             val inputData = workDataOf(
 *                 "sender" to sender,
 *                 "body" to body,
 *                 "timestamp" to System.currentTimeMillis()
 *             )
 *             val request = OneTimeWorkRequestBuilder<SmsParseWorker>()
 *                 .setInputData(inputData)
 *                 .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
 *                 .build()
 *             WorkManager.getInstance(context).enqueue(request)
 *         }
 *     }
 * }
 *
 * ─── SmsParseWorker.kt ───────────────────────────────────────────────────────
 *
 * package com.spendy.app
 *
 * import android.content.Context
 * import androidx.work.CoroutineWorker
 * import androidx.work.WorkerParameters
 * import com.facebook.react.bridge.Arguments
 *
 * class SmsParseWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
 *     override suspend fun doWork(): Result {
 *         val sender = inputData.getString("sender") ?: return Result.failure()
 *         val body = inputData.getString("body") ?: return Result.failure()
 *         val timestamp = inputData.getLong("timestamp", System.currentTimeMillis())
 *
 *         // Parse in worker thread — safe for DB + regex
 *         val parsed = SpendyParser.parseSms(sender, body, timestamp) ?: return Result.success()
 *
 *         // Emit to React Native
 *         val map = Arguments.createMap().apply {
 *             putDouble("amount", parsed.amount)
 *             putString("type", parsed.type)
 *             putString("merchant", parsed.merchant)
 *             putDouble("timestamp", parsed.timestamp.toDouble())
 *             putString("raw_source", "sms")
 *         }
 *         SpendyEventEmitter.emit("onTransactionParsed", map)
 *         return Result.success()
 *     }
 * }
 *
 * ─── BankNotificationListener.kt ─────────────────────────────────────────────
 *
 * package com.spendy.app
 *
 * import android.app.Notification
 * import android.service.notification.NotificationListenerService
 * import android.service.notification.StatusBarNotification
 * import androidx.work.*
 *
 * class BankNotificationListener : NotificationListenerService() {
 *
 *     private val trackedPackages = setOf(
 *         "com.google.android.apps.nbu.paisa.user",  // GPay
 *         "com.phonepe.app",                          // PhonePe
 *         "net.one97.paytm",                          // Paytm
 *         "in.amazon.mShop.android.shopping",         // Amazon Pay
 *         "com.freecharge.android",                   // Freecharge
 *     )
 *
 *     override fun onNotificationPosted(sbn: StatusBarNotification) {
 *         val pkg = sbn.packageName
 *         if (pkg !in trackedPackages) return
 *
 *         val extras = sbn.notification.extras
 *         val title = extras.getString(Notification.EXTRA_TITLE) ?: ""
 *         val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
 *
 *         val inputData = workDataOf(
 *             "packageName" to pkg,
 *             "title" to title,
 *             "text" to text,
 *             "timestamp" to sbn.postTime
 *         )
 *         val request = OneTimeWorkRequestBuilder<NotificationParseWorker>()
 *             .setInputData(inputData)
 *             .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
 *             .build()
 *         WorkManager.getInstance(applicationContext).enqueue(request)
 *     }
 * }
 *
 * ─── AndroidManifest.xml additions ───────────────────────────────────────────
 *
 * Inside <application>:
 *
 *   <receiver android:name=".SmsReceiver" android:exported="true"
 *     android:permission="android.permission.BROADCAST_SMS">
 *     <intent-filter android:priority="999">
 *       <action android:name="android.provider.Telephony.SMS_RECEIVED" />
 *     </intent-filter>
 *   </receiver>
 *
 *   <service android:name=".BankNotificationListener"
 *     android:label="SPENDY Notification Reader"
 *     android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"
 *     android:exported="true">
 *     <intent-filter>
 *       <action android:name="android.service.notification.NotificationListenerService" />
 *     </intent-filter>
 *   </service>
 *
 * Inside <manifest>:
 *   <uses-permission android:name="android.permission.RECEIVE_SMS" />
 *   <uses-permission android:name="android.permission.READ_SMS" />
 *   <uses-permission android:name="android.permission.CAMERA" />
 *   <uses-permission android:name="android.permission.USE_BIOMETRIC" />
 *   <uses-permission android:name="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE" />
 *   <uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
 */

export {};
