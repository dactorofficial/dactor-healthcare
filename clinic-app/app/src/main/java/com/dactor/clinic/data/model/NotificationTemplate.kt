package com.dactor.clinic.data.model

sealed class NotificationTemplate {
    abstract val type: NotificationType

    object AppointmentReminder : NotificationTemplate() {
        override val type = NotificationType.QUEUE_ALERT
        fun buildTitle(code: String) = "Appointment Reminder • #$code"
        fun buildMessage(patientName: String, code: String, slotTime: String, estWait: String): String {
            return NotificationTemplateData.buildMessageWithMeta(
                cleanMessage = "Hi $patientName, your appointment (#$code) is scheduled for today at $slotTime. Track your live queue turn anytime.",
                leftLabel = "Estimated Wait",
                leftValue = estWait,
                rightLabel = "Appointment Time",
                rightValue = slotTime,
                trackingCode = code
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
                trackingCode = code
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
                trackingCode = code
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
                trackingCode = code
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
                trackingCode = code
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
                trackingCode = trackingCode
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
                rightValue = rightVal
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
            rightVal: String = "Active Queue",
            trackingCode: String? = null
        ): String {
            return NotificationTemplateData.buildMessageWithMeta(
                cleanMessage = cleanMessage,
                leftLabel = leftLabel,
                leftValue = leftVal,
                rightLabel = rightLabel,
                rightValue = rightVal,
                trackingCode = trackingCode
            )
        }
    }

    object EarlyArrivalInvite : NotificationTemplate() {
        override val type = NotificationType.EARLY_ARRIVAL
        fun buildTitle() = "⚡ Doctor is Free Now! Come in Early?"
        fun buildMessage(patientName: String, code: String, originalSlot: String): String {
            return NotificationTemplateData.buildMessageWithMeta(
                cleanMessage = "Hi $patientName, the doctor is free now ahead of schedule! Since you opted into early calls, you can come in right now instead of waiting for your $originalSlot slot.",
                leftLabel = "Doctor Status",
                leftValue = "Free Now",
                rightLabel = "Original Slot",
                rightValue = originalSlot,
                trackingCode = code
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
                trackingCode = code
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
                trackingCode = code
            )
        }
    }
}

