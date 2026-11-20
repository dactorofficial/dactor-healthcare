package com.dactor.clinic.domain.model

class QueueConflictException(
    override val message: String = "This entry was just updated",
    val currentStatus: String = ""
) : Exception(message)
