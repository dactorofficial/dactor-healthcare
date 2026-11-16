package com.dactor.patient.service

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.dactor.patient.data.model.Appointment
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.util.concurrent.TimeUnit

/**
 * Decides when the phone talks to the server for appointment alerts (docs/scaling-plan.md):
 *
 * - No upcoming appointment: nothing is scheduled.
 * - Upcoming appointment: hourly background check (WorkManager).
 * - Local reminders: appointment day (7 AM) and 1 hour before the slot.
 * - Doctor appointment: 90 s check loop from slot - 2 h until 5 min after the
 *   consultation is completed (or cancelled); hard stop at midnight, after which
 *   the background check runs every 6 hours.
 * - Lab report pending: 5 min loop between 7 AM and 8 PM until the report is
 *   prepared (+5 min), for at most 3 days.
 */
object AppointmentAlarmPlanner {

    private const val PREFS = "dactor_alert_planner"
    private const val KEY_REMINDERS = "scheduled_reminders"
    private const val KEY_NOTIF_SINCE = "notifications_since"
    private const val WORK_NAME = "DactorNotificationSyncWork"

    private const val LOOP_MS = 90_000L
    private const val LAB_LOOP_MS = 5 * 60_000L
    private const val GRACE_MS = 5 * 60_000L
    private const val LAB_MAX_DAYS = 3L
    private const val UNRESOLVED_MAX_DAYS = 2L
    private val LAB_DAY_START: LocalTime = LocalTime.of(7, 0)
    private val LAB_DAY_END: LocalTime = LocalTime.of(20, 0)
    private val DAY_REMINDER_TIME: LocalTime = LocalTime.of(7, 0)

    private val CANCELLED = setOf("cancelled", "canceled", "no_show", "rejected")
    private val FINISHED = setOf("completed", "done", "finished")
    private val LAB_PENDING = setOf("processing", "sample_collected", "in_lab")
    private val LAB_READY = setOf("report_prepared", "prepared")

    private enum class Phase { CANCELLED, FINISHED, LAB_PENDING, WAITING }

    /**
     * @param queueStatusByApptId queue_entries.status per appointment id, when known.
     */
    fun plan(context: Context, appointments: List<Appointment>, queueStatusByApptId: Map<String, String?> = emptyMap()) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val decision = decide(
            now = LocalDateTime.now(),
            nowMs = System.currentTimeMillis(),
            appointments = appointments,
            queueStatusByApptId = queueStatusByApptId,
            completedSeenAt = { id -> prefs.getLong(completedKey(id), 0L).takeIf { it > 0 } }
        )
        prefs.edit().apply {
            decision.completedSeenUpdates.forEach { (id, at) -> if (at == null) remove(completedKey(id)) else putLong(completedKey(id), at) }
        }.apply()

        scheduleLoop(context, decision.loopDelayMs)
        scheduleReminders(context, decision.reminders)
        scheduleBackgroundCheck(context, decision.backgroundCheckHours)
    }

    data class Decision(
        val loopDelayMs: Long?,
        val backgroundCheckHours: Long?,
        val reminders: Map<String, Triple<LocalDateTime, String, Appointment>>,
        val completedSeenUpdates: Map<String, Long?>
    )

    /** Pure scheduling rules (no Android calls) so they can be unit tested. */
    fun decide(
        now: LocalDateTime,
        nowMs: Long,
        appointments: List<Appointment>,
        queueStatusByApptId: Map<String, String?>,
        completedSeenAt: (String) -> Long?
    ): Decision {
        val today = now.toLocalDate()
        var nextLoopMs: Long? = null
        var needsHourly = false
        var needsSixHourly = false
        val reminders = mutableMapOf<String, Triple<LocalDateTime, String, Appointment>>()
        val completedUpdates = mutableMapOf<String, Long?>()

        for (appt in appointments) {
            if (appt.id.isBlank()) continue
            val date = runCatching { LocalDate.parse(appt.appointmentDate.trim().take(10)) }.getOrNull() ?: continue
            val slot = parseTime(appt.appointmentTime)?.let { date.atTime(it) } ?: date.atTime(LocalTime.NOON)
            val queueStatus = queueStatusByApptId[appt.id]?.lowercase()

            when (phaseOf(appt, queueStatus)) {
                Phase.CANCELLED -> completedUpdates[appt.id] = null

                Phase.FINISHED -> {
                    // Keep checking for 5 minutes after completion (bill, prescription, report).
                    val seenAt = completedSeenAt(appt.id) ?: nowMs.also { completedUpdates[appt.id] = it }
                    val left = seenAt + GRACE_MS - nowMs
                    if (left > 0) nextLoopMs = minOf(nextLoopMs ?: Long.MAX_VALUE, maxOf(left, 60_000L))
                }

                Phase.LAB_PENDING -> {
                    if (Duration.between(date.atStartOfDay(), now).toDays() > LAB_MAX_DAYS) {
                        needsSixHourly = true
                    } else {
                        needsHourly = true
                        val t = now.toLocalTime()
                        val wait = when {
                            t.isBefore(LAB_DAY_START) -> Duration.between(now, today.atTime(LAB_DAY_START)).toMillis()
                            !t.isBefore(LAB_DAY_END) -> Duration.between(now, today.plusDays(1).atTime(LAB_DAY_START)).toMillis()
                            else -> LAB_LOOP_MS
                        }
                        nextLoopMs = minOf(nextLoopMs ?: Long.MAX_VALUE, wait)
                    }
                }

                Phase.WAITING -> {
                    val windowStart = slot.minusHours(2)
                    val hardStop = date.plusDays(1).atStartOfDay()
                    when {
                        now.isBefore(windowStart) -> {
                            needsHourly = true
                            nextLoopMs = minOf(nextLoopMs ?: Long.MAX_VALUE, Duration.between(now, windowStart).toMillis())
                        }
                        now.isBefore(hardStop) -> {
                            needsHourly = true
                            nextLoopMs = minOf(nextLoopMs ?: Long.MAX_VALUE, LOOP_MS)
                        }
                        // Past midnight and still unresolved: slow 6-hour check for a couple of days.
                        Duration.between(hardStop, now).toDays() < UNRESOLVED_MAX_DAYS -> needsSixHourly = true
                    }
                    val dayReminder = date.atTime(DAY_REMINDER_TIME)
                    if (dayReminder.isAfter(now) && dayReminder.isBefore(slot)) {
                        reminders["${appt.id}:day"] = Triple(dayReminder, "day", appt)
                    }
                    val hourBefore = slot.minusHours(1)
                    if (hourBefore.isAfter(now)) {
                        reminders["${appt.id}:hour"] = Triple(hourBefore, "hour", appt)
                    }
                }
            }
        }

        return Decision(
            loopDelayMs = nextLoopMs,
            backgroundCheckHours = when {
                needsHourly -> 1L
                needsSixHourly -> 6L
                else -> null
            },
            reminders = reminders,
            completedSeenUpdates = completedUpdates
        )
    }

    /** Only fetch notifications newer than this (ISO-8601); overlaps by a minute, duplicates are filtered by seen ids. */
    fun notificationsSince(context: Context): String {
        val saved = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_NOTIF_SINCE, null)
        val base = saved?.let { runCatching { Instant.parse(it) }.getOrNull() }
            ?: Instant.now().minus(Duration.ofHours(24))
        return base.minus(Duration.ofMinutes(1)).toString()
    }

    fun rememberNotificationsSeenUpTo(context: Context, createdAtValues: List<String>) {
        val newest = createdAtValues.mapNotNull { runCatching { Instant.parse(it) }.getOrNull() }.maxOrNull() ?: return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val current = prefs.getString(KEY_NOTIF_SINCE, null)?.let { runCatching { Instant.parse(it) }.getOrNull() }
        if (current == null || newest.isAfter(current)) {
            prefs.edit().putString(KEY_NOTIF_SINCE, newest.toString()).apply()
        }
    }

    private fun phaseOf(appt: Appointment, queueStatus: String?): Phase {
        val checkin = appt.checkinStatus.lowercase()
        val status = appt.status.lowercase()
        return when {
            checkin in CANCELLED || queueStatus in CANCELLED || status in CANCELLED -> Phase.CANCELLED
            queueStatus in LAB_PENDING || checkin in LAB_PENDING -> Phase.LAB_PENDING
            checkin in FINISHED || queueStatus in FINISHED || queueStatus in LAB_READY || checkin in LAB_READY -> Phase.FINISHED
            else -> Phase.WAITING
        }
    }

    private fun parseTime(raw: String): LocalTime? {
        val t = raw.trim()
        if (t.isBlank()) return null
        return runCatching { LocalTime.parse(t.take(8)) }.getOrNull()
            ?: runCatching { LocalTime.parse(t.take(5)) }.getOrNull()
    }

    private fun completedKey(id: String) = "completed_seen_$id"

    private fun scheduleLoop(context: Context, delayMs: Long?) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val pending = PendingIntent.getBroadcast(
            context,
            NotificationAlarmReceiver.ALARM_REQUEST_CODE,
            Intent(context, NotificationAlarmReceiver::class.java).setAction(NotificationAlarmReceiver.ACTION_CHECK_ALERTS),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        if (delayMs == null) {
            alarmManager.cancel(pending)
            return
        }
        setAlarm(alarmManager, System.currentTimeMillis() + delayMs, pending)
    }

    private fun scheduleReminders(context: Context, reminders: Map<String, Triple<LocalDateTime, String, Appointment>>) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val previous = prefs.getStringSet(KEY_REMINDERS, emptySet()).orEmpty()

        // Cancel reminders for appointments that were cancelled, moved or finished.
        for (key in previous - reminders.keys) {
            alarmManager.cancel(reminderIntent(context, key, null))
        }
        for ((key, value) in reminders) {
            val (at, kind, appt) = value
            val timeText = parseTime(appt.appointmentTime)?.let {
                it.format(java.time.format.DateTimeFormatter.ofPattern("h:mm a", java.util.Locale.US))
            } ?: "today"
            val (title, message) = if (kind == "day") {
                "Appointment today" to "You have an appointment today at $timeText (code ${appt.trackingCode10Digit})."
            } else {
                "Appointment in 1 hour" to "Your appointment is at $timeText (code ${appt.trackingCode10Digit}). Please start on your way."
            }
            val extras = Intent()
                .putExtra(NotificationAlarmReceiver.EXTRA_TITLE, title)
                .putExtra(NotificationAlarmReceiver.EXTRA_MESSAGE, message)
                .putExtra(NotificationAlarmReceiver.EXTRA_APPOINTMENT_ID, appt.id)
            val triggerAt = at.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
            setAlarm(alarmManager, triggerAt, reminderIntent(context, key, extras))
        }
        prefs.edit().putStringSet(KEY_REMINDERS, reminders.keys).apply()
    }

    private fun reminderIntent(context: Context, key: String, extras: Intent?): PendingIntent {
        val intent = Intent(context, NotificationAlarmReceiver::class.java)
            .setAction(NotificationAlarmReceiver.ACTION_REMINDER)
            // Unique data URI so each reminder is a separate alarm.
            .setData(android.net.Uri.parse("dactor://reminder/$key"))
        extras?.extras?.let { intent.putExtras(it) }
        return PendingIntent.getBroadcast(
            context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun setAlarm(alarmManager: AlarmManager, triggerAtMillis: Long, pending: PendingIntent) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pending)
            } else {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pending)
            }
        } catch (_: Exception) {
            try {
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pending)
            } catch (_: Exception) {}
        }
    }

    private fun scheduleBackgroundCheck(context: Context, everyHours: Long?) {
        val workManager = WorkManager.getInstance(context)
        if (everyHours == null) {
            workManager.cancelUniqueWork(WORK_NAME)
            return
        }
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val policy = if (prefs.getLong("work_interval_hours", 0L) == everyHours) {
            ExistingPeriodicWorkPolicy.KEEP
        } else {
            ExistingPeriodicWorkPolicy.UPDATE
        }
        val request = PeriodicWorkRequestBuilder<NotificationSyncWorker>(everyHours, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        workManager.enqueueUniquePeriodicWork(WORK_NAME, policy, request)
        prefs.edit().putLong("work_interval_hours", everyHours).apply()
    }
}
