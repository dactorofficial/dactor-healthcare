package com.dactor.clinic.ui.queue.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.TextStyle
import java.util.Locale

@Composable
fun QueueDateScroller(
    selectedDate: String,
    onDateSelected: (LocalDate) -> Unit,
    modifier: Modifier = Modifier
) {
    val coroutineScope = rememberCoroutineScope()
    val parsedSelectedDate = remember(selectedDate) {
        try {
            LocalDate.parse(selectedDate)
        } catch (_: Exception) {
            LocalDate.now()
        }
    }
    var viewedYearMonth by remember(parsedSelectedDate) {
        mutableStateOf(YearMonth.from(parsedSelectedDate))
    }
    val curToday = LocalDate.now()
    val initialDateIndex = remember(parsedSelectedDate) {
        (parsedSelectedDate.dayOfMonth - 1 - 2).coerceAtLeast(0)
    }
    val dateListState = rememberLazyListState(initialFirstVisibleItemIndex = initialDateIndex)

    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(
            modifier = Modifier.padding(vertical = 10.dp, horizontal = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // Header: Month/Year navigation & "Today" shortcut
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    IconButton(
                        onClick = {
                            val prev = viewedYearMonth.minusMonths(1)
                            viewedYearMonth = prev
                            val today = LocalDate.now()
                            if (prev == YearMonth.from(today)) {
                                onDateSelected(today)
                                coroutineScope.launch {
                                    val targetIdx = (today.dayOfMonth - 1 - 2).coerceAtLeast(0)
                                    dateListState.animateScrollToItem(targetIdx)
                                }
                            } else {
                                val newDate = prev.atDay(1)
                                onDateSelected(newDate)
                                coroutineScope.launch { dateListState.scrollToItem(0) }
                            }
                        },
                        modifier = Modifier.size(30.dp)
                    ) {
                        Icon(
                            Icons.Default.ChevronLeft,
                            contentDescription = "Previous Month",
                            tint = Color(0xFF475569),
                            modifier = Modifier.size(18.dp)
                        )
                    }
                    Text(
                        text = "${viewedYearMonth.month.getDisplayName(TextStyle.FULL, Locale.ENGLISH)} ${viewedYearMonth.year}",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    IconButton(
                        onClick = {
                            val next = viewedYearMonth.plusMonths(1)
                            viewedYearMonth = next
                            val today = LocalDate.now()
                            if (next == YearMonth.from(today)) {
                                onDateSelected(today)
                                coroutineScope.launch {
                                    val targetIdx = (today.dayOfMonth - 1 - 2).coerceAtLeast(0)
                                    dateListState.animateScrollToItem(targetIdx)
                                }
                            } else {
                                val newDate = next.atDay(1)
                                onDateSelected(newDate)
                                coroutineScope.launch { dateListState.scrollToItem(0) }
                            }
                        },
                        modifier = Modifier.size(30.dp)
                    ) {
                        Icon(
                            Icons.Default.ChevronRight,
                            contentDescription = "Next Month",
                            tint = Color(0xFF475569),
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }

                // "Today" Button
                val isTodaySelected = selectedDate == curToday.toString()
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = if (isTodaySelected) Color(0xFFE0F2FE) else Color(0xFFF1F5F9),
                    border = BorderStroke(1.dp, if (isTodaySelected) Color(0xFF0284C7) else Color(0xFFCBD5E1)),
                    modifier = Modifier.clickable {
                        viewedYearMonth = YearMonth.from(curToday)
                        onDateSelected(curToday)
                        coroutineScope.launch {
                            val targetIdx = (curToday.dayOfMonth - 1 - 2).coerceAtLeast(0)
                            dateListState.animateScrollToItem(targetIdx)
                        }
                    }
                ) {
                    Text(
                        text = "Today",
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = if (isTodaySelected) Color(0xFF0284C7) else Color(0xFF475569),
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                    )
                }
            }

            // Compact Horizontal Date List
            val daysInMonth = remember(viewedYearMonth) {
                (1..viewedYearMonth.lengthOfMonth()).map { viewedYearMonth.atDay(it) }
            }
            LazyRow(
                state = dateListState,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                contentPadding = PaddingValues(horizontal = 2.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                items(daysInMonth, key = { it.toString() }) { date ->
                    val isSelected = date.toString() == selectedDate
                    val dayOfWeekStr = date.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.ENGLISH).take(3)
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = if (isSelected) Color(0xFF0284C7) else Color(0xFFF8FAFC),
                        border = BorderStroke(
                            1.dp,
                            if (isSelected) Color(0xFF0284C7) else Color(0xFFE2E8F0)
                        ),
                        modifier = Modifier
                            .width(46.dp)
                            .clickable { onDateSelected(date) }
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                            modifier = Modifier.padding(vertical = 6.dp)
                        ) {
                            Text(
                                text = dayOfWeekStr.uppercase(Locale.ENGLISH),
                                fontSize = 9.5.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = if (isSelected) Color.White.copy(alpha = 0.9f) else Color(0xFF64748B)
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = "${date.dayOfMonth}",
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (isSelected) Color.White else Color(0xFF1E293B)
                            )
                        }
                    }
                }
            }
        }
    }
}
