package com.dactor.patient.data.model

sealed class NotificationTemplate {
    abstract val type: NotificationType

    object AppointmentReminder : NotificationTemplate() {
        override val type = NotificationType.QUEUE_ALERT
        fun buildTitle(code: String) = "Appointment Reminder • #$code"
        fun buildMessage(
            patientName: String,
            code: String,
            slotTime: String,
            estWait: String,
            avgMinutes: Int = 10
        ): String {
            val slotWindow = NotificationTemplateData.formatSlotWindow(slotTime, avgMinutes)
            val windowDisplay = if (slotWindow.isNotBlank()) slotWindow else slotTime
            return NotificationTemplateData.buildMessageWithMeta(
                cleanMessage = "Hi $patientName, your appointment (#$code) is scheduled for today around $windowDisplay. Track your live queue turn anytime.",
                leftLabel = "Estimated Wait",
                leftValue = estWait,
                rightLabel = "Appointment Window",
                rightValue = windowDisplay,
                trackingCode = code,
                statusBadge = "APPOINTMENT REMINDER"
            )
        }
    }

    object QueueApproaching : NotificationTemplate() {
        override val type = NotificationType.QUEUE_ALERT
        fun buildTitle(queuePosition: Int) = "Your Turn Is Approaching (#$queuePosition)"
        fun buildMessage(patientName: String, code: String, queuePosition: Int, waitLabel: String): String {
            return NotificationTemplateData.buildMessageWithMeta(
                cleanMessage = "Hi $patientName, you are now #$queuePosition in the live queue (#$code). Please be ready near the consultation room.",
                leftLabel = "Estimated Time Left",
                leftValue = waitLabel,
                rightLabel = "Queue Position",
                rightValue = "#$queuePosition (Queue Position #$queuePosition)",
                trackingCode = code,
                statusBadge = "TURN APPROACHING"
            )
        }
    }

    object DoctorCallingInside : NotificationTemplate() {
        override val type = NotificationType.QUEUE_ALERT
        fun buildTitle() = "Doctor Calling You Inside Now!"
        fun buildMessage(patientName: String, code: String, queuePosition: Int = 1): String {
            return NotificationTemplateData.buildMessageWithMeta(
                cleanMessage = "Hi $patientName, the doctor is calling you inside now for appointment #$code. Please proceed to the room immediately.",
                leftLabel = "Estimated Time Left",
                leftValue = "Now (0 mins)",
                rightLabel = "Your Token",
                rightValue = "Token #$queuePosition",
                trackingCode = code,
                statusBadge = "CALLING INSIDE"
            )
        }
    }

    object LabProcessing : NotificationTemplate() {
        override val type = NotificationType.LAB_PROCESSING
        fun buildTitle() = "Sample Collected • Processing Started"
        fun buildMessage(patientName: String, code: String): String {
            return NotificationTemplateData.buildMessageWithMeta(
                cleanMessage = "Hi $patientName, your lab sample for #$code has been collected and is now processing in the laboratory.",
                leftLabel = "Lab Status",
                leftValue = "Processing",
                rightLabel = "Tracking Code",
                rightValue = "#$code",
                trackingCode = code,
                statusBadge = "IN TESTING"
            )
        }
    }

    object LabReportReady : NotificationTemplate() {
        override val type = NotificationType.LAB_REPORT
        fun buildTitle(code: String) = "Lab Report Prepared (#$code)"
        fun buildMessage(patientName: String, code: String): String {
            return NotificationTemplateData.buildMessageWithMeta(
                cleanMessage = "Hi $patientName, your diagnostic lab report for #$code is prepared and ready to view or download.",
                leftLabel = "Report Status",
                leftValue = "Prepared & Ready",
                rightLabel = "Verification",
                rightValue = "Name / Mobile",
                trackingCode = code,
                statusBadge = "REPORT READY"
            )
        }
    }

    object ClinicBreak : NotificationTemplate() {
        override val type = NotificationType.CLINIC_BREAK
        fun buildTitle(clinicName: String) = "$clinicName is Currently on Break"
        fun buildMessage(clinicName: String, breakWindowText: String? = null, appointmentTime: String? = null, trackingCode: String? = null): String {
            val breakInfo = if (!breakWindowText.isNullOrBlank()) " ($breakWindowText)" else ""
            val cleanBody = "The clinic is currently on a short break$breakInfo. Queue movement is paused and will resume shortly."
            return NotificationTemplateData.buildMessageWithMeta(
                cleanMessage = cleanBody,
                leftLabel = "Estimated Time Left",
                leftValue = "Clinic on Break",
                rightLabel = "Your Appointment Time",
                rightValue = breakWindowText?.takeIf { it.isNotBlank() } ?: (appointmentTime ?: "Paused Briefly"),
                trackingCode = trackingCode,
                statusBadge = "CLINIC BREAK"
            )
        }
    }

    object ClinicBroadcast : NotificationTemplate() {
        override val type = NotificationType.CLINIC_BROADCAST
        fun buildMessage(
            cleanMessage: String,
            leftLabel: String = "Status",
            leftVal: String = "Clinic Alert",
            rightLabel: String = "Target",
            rightVal: String = "All Patients"
        ): String {
            return NotificationTemplateData.buildMessageWithMeta(
                cleanMessage = cleanMessage,
                leftLabel = leftLabel,
                leftValue = leftVal,
                rightLabel = rightLabel,
                rightValue = rightVal,
                statusBadge = "ANNOUNCEMENT"
            )
        }
    }

    object ManualAlert : NotificationTemplate() {
        override val type = NotificationType.MANUAL_ALERT
        fun buildMessage(
            cleanMessage: String,
            leftLabel: String = "Estimated Time Left",
            leftVal: String = "Soon, be ready",
            rightLabel: String = "Your Appointment Time",
            rightValue: String = "Active Queue",
            trackingCode: String? = null
        ): String {
            return NotificationTemplateData.buildMessageWithMeta(
                cleanMessage = cleanMessage,
                leftLabel = leftLabel,
                leftValue = leftVal,
                rightLabel = rightLabel,
                rightValue = rightValue,
                trackingCode = trackingCode,
                statusBadge = "QUEUE ALERT"
            )
        }
    }

    object EarlyArrivalInvite : NotificationTemplate() {
        override val type = NotificationType.EARLY_ARRIVAL
        fun buildTitle() = "⚡ Doctor is Free Now! Come in Early?"
        fun buildMessage(patientName: String, code: String, originalSlot: String, avgMinutes: Int = 10): String {
            val slotWindow = NotificationTemplateData.formatSlotWindow(originalSlot, avgMinutes)
            val windowDisplay = if (slotWindow.isNotBlank()) slotWindow else originalSlot
            return NotificationTemplateData.buildMessageWithMeta(
                cleanMessage = "Hi $patientName, the doctor is free now ahead of schedule! Since you opted into early calls, you can come in right now instead of waiting for your $windowDisplay slot.",
                leftLabel = "Doctor Status",
                leftValue = "Free Now",
                rightLabel = "Original Window",
                rightValue = windowDisplay,
                trackingCode = code,
                statusBadge = "DOCTOR FREE NOW"
            )
        }
    }

    object DoctorNotArrived : NotificationTemplate() {
        override val type = NotificationType.DOCTOR_NOT_ARRIVED
        fun buildTitle(doctorName: String? = null) = if (!doctorName.isNullOrBlank()) {
            "$doctorName Has Not Arrived Yet"
        } else {
            "Doctor Not Arrived • Delayed"
        }
        fun buildMessage(
            patientName: String,
            doctorName: String = "Doctor",
            expectedArrival: String = "Expected shortly",
            clinicName: String? = null,
            code: String? = null,
            slotTime: String? = null,
            avgMinutes: Int = 10
        ): String {
            val clinicPart = if (!clinicName.isNullOrBlank()) " at $clinicName" else ""
            val slotWindow = slotTime?.takeIf { it.isNotBlank() }?.let { NotificationTemplateData.formatSlotWindow(it, avgMinutes) }
            val arrivalInfo = if (!slotWindow.isNullOrBlank()) "$expectedArrival (Slot: $slotWindow)" else expectedArrival
            return NotificationTemplateData.buildMessageWithMeta(
                cleanMessage = "Hi $patientName, $doctorName has not arrived yet$clinicPart. Queue consultation is currently paused and will start as soon as the doctor reaches.",
                leftLabel = "Doctor Status",
                leftValue = "Not Arrived / Delayed",
                rightLabel = "Est. Arrival",
                rightValue = arrivalInfo,
                trackingCode = code,
                statusBadge = "DOCTOR DELAYED"
            )
        }
    }

    object DoctorDelayed : NotificationTemplate() {
        override val type = NotificationType.DOCTOR_DELAYED
        fun buildTitle(doctorName: String? = null) = if (!doctorName.isNullOrBlank()) {
            "$doctorName Has Not Arrived Yet • Delay Notice"
        } else {
            "Doctor Not Arrived Yet / Delay Notice"
        }
        fun buildMessage(
            patientName: String,
            doctorName: String = "Doctor",
            expectedDelay: String = "~ 15-20 mins",
            clinicName: String? = null,
            code: String? = null,
            slotTime: String? = null,
            avgMinutes: Int = 10
        ): String {
            val clinicPart = if (!clinicName.isNullOrBlank()) " at $clinicName" else ""
            val slotWindow = slotTime?.takeIf { it.isNotBlank() }?.let { NotificationTemplateData.calculateApproximateSlotWindow(it, avgMinutes) }
            val slotInfo = if (!slotWindow.isNullOrBlank()) " (Slot: $slotWindow)" else ""
            return NotificationTemplateData.buildMessageWithMeta(
                cleanMessage = "Hi $patientName, $doctorName has not arrived yet$clinicPart. The queue is delayed by $expectedDelay$slotInfo. Consultations will begin once the doctor arrives.",
                leftLabel = "Doctor Status",
                leftValue = "Not Arrived / Delayed",
                rightLabel = "Est. Delay",
                rightValue = expectedDelay,
                trackingCode = code,
                statusBadge = "DOCTOR DELAYED"
            )
        }
    }

    object WaitForFewMinutes : NotificationTemplate() {
        override val type = NotificationType.WAIT_FEW_MINUTES
        fun buildTitle(reason: String? = null) = if (!reason.isNullOrBlank()) {
            "Brief Pause ($reason) • Please Wait"
        } else {
            "Brief Pause • Please Wait Few Minutes"
        }
        fun buildMessage(
            patientName: String,
            waitMins: String = "5-10 mins",
            reason: String? = null,
            code: String? = null
        ): String {
            val reasonPart = if (!reason.isNullOrBlank()) " ($reason)" else ""
            return NotificationTemplateData.buildMessageWithMeta(
                cleanMessage = "Hi $patientName, please wait for a few minutes$reasonPart. The queue is briefly paused and your turn will resume shortly.",
                leftLabel = "Queue Status",
                leftValue = "Brief Pause",
                rightLabel = "Estimated Wait",
                rightValue = if (waitMins.startsWith("~")) waitMins else "~ $waitMins",
                trackingCode = code,
                statusBadge = "WAIT A FEW MINS"
            )
        }
    }

    object WaitFewMins : NotificationTemplate() {
        override val type = NotificationType.WAIT_FEW_MINS
        fun buildTitle(reason: String? = null) = if (!reason.isNullOrBlank()) {
            "Please Wait a Few Minutes ($reason)"
        } else {
            "Please Wait a Few Minutes"
        }
        fun buildMessage(
            patientName: String,
            reason: String = "reviewing records / brief procedure",
            resumeWait: String = "~ 5-10 mins",
            code: String? = null
        ): String {
            val formattedWait = if (resumeWait.startsWith("~")) resumeWait else "~ $resumeWait"
            return NotificationTemplateData.buildMessageWithMeta(
                cleanMessage = "Hi $patientName, please wait a few minutes. The doctor is $reason. Consultations will resume in $formattedWait.",
                leftLabel = "Queue Status",
                leftValue = "Brief Pause",
                rightLabel = "Estimated Wait",
                rightValue = formattedWait,
                trackingCode = code,
                statusBadge = "WAIT A FEW MINS"
            )
        }
    }

    object ArriveSoon : NotificationTemplate() {
        override val type = NotificationType.ARRIVE_SOON
        fun buildTitle(queuePosition: Int? = null) = if (queuePosition != null && queuePosition > 0) {
            "Arrive Soon • Turn Approaching (#$queuePosition)"
        } else {
            "Arrive Soon! Turn Approaching"
        }
        fun buildMessage(
            patientName: String,
            code: String,
            queuePosition: Int = 2,
            estTime: String = "~ 10-15 mins"
        ): String {
            val aheadPart = when {
                queuePosition <= 1 -> "You are next in line."
                queuePosition == 2 -> "Only 1 patient is ahead of you."
                else -> "Only ${queuePosition - 1} patients are ahead of you."
            }
            return NotificationTemplateData.buildMessageWithMeta(
                cleanMessage = "Hi $patientName, your turn is approaching! You are position #$queuePosition in the queue (#$code). $aheadPart Please arrive at the clinic soon to avoid missing your turn.",
                leftLabel = "Turn Status",
                leftValue = "Arrive Soon",
                rightLabel = "Queue Position",
                rightValue = "Position #$queuePosition",
                trackingCode = code,
                statusBadge = "ARRIVE SOON • #$queuePosition"
            )
        }
    }

    object DoctorArrived : NotificationTemplate() {
        override val type = NotificationType.DOCTOR_ARRIVAL
        fun buildTitle(doctorName: String? = null) = if (!doctorName.isNullOrBlank()) {
            "🩺 $doctorName Has Arrived!"
        } else {
            "🩺 Doctor Has Arrived!"
        }
        fun buildMessage(
            patientName: String,
            doctorName: String = "Doctor",
            clinicName: String? = null,
            code: String? = null
        ): String {
            val clinicPart = if (!clinicName.isNullOrBlank()) " at $clinicName" else ""
            val cleanBody = "Hi $patientName, $doctorName has arrived$clinicPart! OPD consultations are starting now. Please check your live queue position and be near the clinic."
            return NotificationTemplateData.buildMessageWithMeta(
                cleanMessage = cleanBody,
                leftLabel = "Doctor Status",
                leftValue = "In Clinic • Active",
                rightLabel = "Live Queue",
                rightValue = "Consultations Started",
                trackingCode = code,
                statusBadge = "DOCTOR ARRIVED"
            )
        }
    }

    object DoctorSteppedOut : NotificationTemplate() {
        override val type = NotificationType.DOCTOR_STATUS
        fun buildTitle(doctorName: String? = null) = if (!doctorName.isNullOrBlank()) {
            "⏳ $doctorName Temporarily Stepped Out"
        } else {
            "⏳ Doctor Temporarily Away"
        }
        fun buildMessage(
            patientName: String,
            doctorName: String = "Doctor",
            clinicName: String? = null,
            code: String? = null
        ): String {
            val clinicPart = if (!clinicName.isNullOrBlank()) " from $clinicName" else ""
            val cleanBody = "Hi $patientName, $doctorName has temporarily stepped out$clinicPart. Consultations are briefly paused and will resume shortly."
            return NotificationTemplateData.buildMessageWithMeta(
                cleanMessage = cleanBody,
                leftLabel = "Doctor Status",
                leftValue = "Temporarily Away",
                rightLabel = "Queue Status",
                rightValue = "Briefly Paused",
                trackingCode = code,
                statusBadge = "DOCTOR AWAY"
            )
        }
    }
}

fun calculateApproximateSlotWindow(
    slotTime: String?,
    avgConsultationMinutes: Int = 10,
    includeTolerance: Boolean = true
): String = NotificationTemplateData.calculateApproximateSlotWindow(slotTime, avgConsultationMinutes, includeTolerance)
