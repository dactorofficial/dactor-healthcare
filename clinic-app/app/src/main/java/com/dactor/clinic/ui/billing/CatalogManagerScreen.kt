package com.dactor.clinic.ui.billing

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.dactor.clinic.data.model.CatalogItem
import com.dactor.clinic.data.repository.BillingRepository
import com.dactor.clinic.domain.util.CurrencyFormatter
import kotlinx.coroutines.launch
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CatalogManagerScreen(
    navController: NavController,
    clinicId: String = "",
    billingRepository: BillingRepository? = null
) {
    val context = LocalContext.current
    val effectiveClinicId = remember(clinicId) {
        if (clinicId.isNotBlank() && clinicId != "c1") clinicId
        else com.dactor.clinic.data.local.UserSessionManager(context).getSavedClinicId() ?: ""
    }

    var catalogItems by remember(effectiveClinicId) { mutableStateOf<List<CatalogItem>>(emptyList()) }

    var searchQuery by remember { mutableStateOf("") }
    var selectedCategory by remember { mutableStateOf("All") }
    var showAddDialog by remember { mutableStateOf(false) }

    var newItemName by remember { mutableStateOf("") }
    var newItemCategory by remember { mutableStateOf("Consultation") }
    var newItemPrice by remember { mutableStateOf("") }
    var isAdding by remember { mutableStateOf(false) }

    val categories = listOf("All", "Consultation", "Laboratory", "Procedure", "Pharmacy", "Other")
    val coroutineScope = rememberCoroutineScope()
    val focusManager = LocalFocusManager.current

    LaunchedEffect(effectiveClinicId) {
        if (billingRepository != null && effectiveClinicId.isNotBlank()) {
            val remoteItems = billingRepository.getCatalog(effectiveClinicId)
            catalogItems = remoteItems
        }
    }

    val filteredItems = catalogItems.filter { item ->
        val matchesCategory = selectedCategory == "All" || item.category.equals(selectedCategory, ignoreCase = true)
        val matchesQuery = searchQuery.isBlank() || item.itemName.contains(searchQuery, ignoreCase = true)
        matchesCategory && matchesQuery
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Billing & Services Catalog", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { showAddDialog = true }) {
                        Icon(Icons.Default.Add, contentDescription = "Add Catalog Item")
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showAddDialog = true },
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary
            ) {
                Icon(Icons.Default.Add, contentDescription = "Add Item")
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Search Bar
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                label = { Text("Search catalog items") },
                placeholder = { Text("e.g. ECG, Consultation, CBC") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                trailingIcon = {
                    if (searchQuery.isNotEmpty()) {
                        IconButton(onClick = { searchQuery = "" }) {
                            Icon(Icons.Default.Clear, contentDescription = "Clear")
                        }
                    }
                },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            )

            // Category Filter Row
            ScrollableTabRow(
                selectedTabIndex = categories.indexOf(selectedCategory).coerceAtLeast(0),
                edgePadding = 0.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                categories.forEach { cat ->
                    Tab(
                        selected = selectedCategory == cat,
                        onClick = { selectedCategory = cat },
                        text = { Text(cat, fontWeight = if (selectedCategory == cat) FontWeight.Bold else FontWeight.Normal) }
                    )
                }
            }

            // Catalog Items Count
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "${filteredItems.size} items listed",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = "Tap to add to bill",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.primary
                )
            }

            // Items List
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 80.dp)
            ) {
                items(filteredItems, key = { it.id }) { item ->
                    Card(
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier
                                .padding(16.dp)
                                .fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(item.itemName, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    modifier = Modifier.padding(top = 4.dp)
                                ) {
                                    Surface(
                                        shape = RoundedCornerShape(6.dp),
                                        color = MaterialTheme.colorScheme.surfaceVariant
                                    ) {
                                        Text(
                                            text = item.category ?: "Service",
                                            fontSize = 11.sp,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                            fontWeight = FontWeight.Medium
                                        )
                                    }
                                }
                            }

                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Text(
                                    text = CurrencyFormatter.formatNPR(item.price),
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 16.sp,
                                    color = MaterialTheme.colorScheme.primary
                                )

                                IconButton(
                                    onClick = {
                                        coroutineScope.launch {
                                            billingRepository?.deleteCatalogItem(item.id)
                                            catalogItems = catalogItems.filter { it.id != item.id }
                                        }
                                    }
                                ) {
                                    Icon(
                                        Icons.Default.DeleteOutline,
                                        contentDescription = "Delete Item",
                                        tint = MaterialTheme.colorScheme.error.copy(alpha = 0.7f),
                                        modifier = Modifier.size(20.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // ADD ITEM DIALOG
    if (showAddDialog) {
        AlertDialog(
            onDismissRequest = { showAddDialog = false },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Default.PlaylistAdd, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Text("Add Service / Test / Med", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                }
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(
                        value = newItemName,
                        onValueChange = { newItemName = it },
                        label = { Text("Item Name *") },
                        placeholder = { Text("e.g. Thyroid Panel (T3/T4/TSH)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = newItemPrice,
                        onValueChange = { input ->
                            if (input.all { it.isDigit() || it == '.' }) newItemPrice = input
                        },
                        label = { Text("Price (NPR) *") },
                        placeholder = { Text("e.g. 1500") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    Text("Category", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        listOf("Consultation", "Laboratory", "Procedure", "Pharmacy").forEach { cat ->
                            FilterChip(
                                selected = newItemCategory == cat,
                                onClick = { newItemCategory = cat },
                                label = { Text(cat, fontSize = 10.sp) }
                            )
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val parsedPrice = newItemPrice.toDoubleOrNull() ?: 0.0
                        if (newItemName.isNotBlank() && parsedPrice > 0) {
                            isAdding = true
                            val newItem = CatalogItem(
                                id = UUID.randomUUID().toString(),
                                clinicId = effectiveClinicId,
                                itemName = newItemName.trim(),
                                category = newItemCategory,
                                price = parsedPrice
                            )

                            coroutineScope.launch {
                                billingRepository?.addCatalogItem(newItem)
                                catalogItems = listOf(newItem) + catalogItems
                                isAdding = false
                                showAddDialog = false
                                newItemName = ""
                                newItemPrice = ""
                            }
                        }
                    },
                    enabled = newItemName.isNotBlank() && newItemPrice.isNotBlank() && !isAdding
                ) {
                    if (isAdding) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), color = MaterialTheme.colorScheme.onPrimary, strokeWidth = 2.dp)
                    } else {
                        Text("Add to Catalog")
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { showAddDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}
