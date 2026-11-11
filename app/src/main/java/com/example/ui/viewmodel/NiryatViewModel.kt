package com.example.ui.viewmodel

import android.graphics.Bitmap
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.model.AIExtractedOrderDraft
import com.example.data.model.ActivityRecord
import com.example.data.model.DigitalTwinState
import com.example.data.model.DocumentRecord
import com.example.data.model.ExportOrder
import com.example.data.model.FinancialAssessment
import com.example.data.model.PaymentRecord
import com.example.data.model.PerformanceMetrics
import com.example.data.repository.NiryatRepository
import com.example.data.sample.BusinessProfile
import com.example.data.sample.SampleBusinessWorkspaceSeeder
import com.example.data.sample.SampleWorkspaceSeedBundle
import com.example.data.sample.WorkspaceMode
import com.example.domain.FinancialCalculationEngine
import com.example.service.GeminiIntelligenceService
import com.example.service.PayPalSandboxService
import com.google.firebase.Timestamp
import com.google.firebase.firestore.FirebaseFirestoreException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

sealed interface AiTaskState<out T> {
    data object Idle : AiTaskState<Nothing>
    data object Loading : AiTaskState<Nothing>
    data class Success<T>(val data: T) : AiTaskState<T>
    data class Error(val message: String) : AiTaskState<Nothing>
}

data class NiryatPortfolioState(
    val isLoading: Boolean = true,
    val workspaceMode: WorkspaceMode = WorkspaceMode.PRODUCTION,
    val businessProfile: BusinessProfile = BusinessProfile(),
    val orders: List<ExportOrder> = emptyList(),
    val assessments: List<FinancialAssessment> = emptyList(),
    val documents: List<DocumentRecord> = emptyList(),
    val payments: List<PaymentRecord> = emptyList(),
    val activities: List<ActivityRecord> = emptyList(),
    val selectedOrderId: String? = null,
    val selectedDigitalTwin: DigitalTwinState? = null,
    val performanceMetrics: PerformanceMetrics = PerformanceMetrics(),
    val errorMessage: String? = null
)

@OptIn(ExperimentalCoroutinesApi::class)
class NiryatViewModel(
    private val repository: NiryatRepository?,
    private val currentUserId: String,
    initialMode: WorkspaceMode = if (currentUserId == SampleBusinessWorkspaceSeeder.SAMPLE_USER_ID || repository == null) {
        WorkspaceMode.SAMPLE_BUSINESS
    } else {
        WorkspaceMode.PRODUCTION
    },
    private val geminiService: GeminiIntelligenceService = GeminiIntelligenceService(),
    private val payPalService: PayPalSandboxService = PayPalSandboxService()
) : ViewModel() {

    private val _workspaceMode = MutableStateFlow(initialMode)
    val workspaceMode: StateFlow<WorkspaceMode> = _workspaceMode.asStateFlow()

    private val _productionBusinessProfile = MutableStateFlow(
        BusinessProfile(
            businessId = "biz_prod_${currentUserId.take(8)}",
            businessName = "Niryat Global Precision Exports Pvt. Ltd.",
            businessType = "MSME Manufacturer & Merchant Exporter",
            role = "OWNER",
            primaryBase = "Chennai, Tamil Nadu, India",
            contactEmail = "exports@niryatglobal.in",
            contactPhone = "+91 44 2250 8841",
            primaryCategories = "Engineering, Textiles, Spices & Electronics",
            reportingCurrency = "INR",
            website = "https://niryatflow.in",
            exportExperienceYears = 8,
            isSampleWorkspace = false
        )
    )

    // Isolated Sample Business Workspace state (Tamil Nadu Global Exports Pvt. Ltd.)
    private val _sampleBundle = MutableStateFlow(SampleBusinessWorkspaceSeeder.createSeedBundle())

    private val _selectedOrderId = MutableStateFlow<String?>(null)

    private val _statusBanner = MutableStateFlow<String?>(null)
    val statusBanner: StateFlow<String?> = _statusBanner.asStateFlow()

    private val _extractionState = MutableStateFlow<AiTaskState<AIExtractedOrderDraft>>(AiTaskState.Idle)
    val extractionState: StateFlow<AiTaskState<AIExtractedOrderDraft>> = _extractionState.asStateFlow()

    private val _financialAiExplanation = MutableStateFlow<AiTaskState<String>>(AiTaskState.Idle)
    val financialAiExplanation: StateFlow<AiTaskState<String>> = _financialAiExplanation.asStateFlow()

    private val _portfolioAiInsights = MutableStateFlow<AiTaskState<String>>(AiTaskState.Idle)
    val portfolioAiInsights: StateFlow<AiTaskState<String>> = _portfolioAiInsights.asStateFlow()

    private val _nlQueryState = MutableStateFlow<AiTaskState<String>>(AiTaskState.Idle)
    val nlQueryState: StateFlow<AiTaskState<String>> = _nlQueryState.asStateFlow()

    private val _paymentBusy = MutableStateFlow(false)
    val paymentBusy: StateFlow<Boolean> = _paymentBusy.asStateFlow()

    private val _orderSubmitting = MutableStateFlow(false)
    val orderSubmitting: StateFlow<Boolean> = _orderSubmitting.asStateFlow()

    private val _paypalAuthCheckState = MutableStateFlow<String?>(null)
    val paypalAuthCheckState: StateFlow<String?> = _paypalAuthCheckState.asStateFlow()

    val isPayPalConfigured: Boolean
        get() = payPalService.isConfigured()

    fun switchWorkspaceMode(targetMode: WorkspaceMode) {
        if (targetMode == WorkspaceMode.PRODUCTION && (repository == null || currentUserId == SampleBusinessWorkspaceSeeder.SAMPLE_USER_ID)) {
            _statusBanner.value = "Sign in with Google to access the Production Cloud Workspace."
            return
        }
        _workspaceMode.value = targetMode
        _selectedOrderId.value = null
        _financialAiExplanation.value = AiTaskState.Idle
        _portfolioAiInsights.value = AiTaskState.Idle
        _nlQueryState.value = AiTaskState.Idle
        _statusBanner.value = if (targetMode == WorkspaceMode.SAMPLE_BUSINESS) {
            "Switched to Sample Business Workspace: Tamil Nadu Global Exports Pvt. Ltd. (Isolated Fictional Data)."
        } else {
            "Switched to Production Workspace (${_productionBusinessProfile.value.businessName})."
        }
    }

    fun resetSampleWorkspace() {
        _sampleBundle.value = SampleBusinessWorkspaceSeeder.createSeedBundle()
        _selectedOrderId.value = "sample_ord_001"
        _financialAiExplanation.value = AiTaskState.Idle
        _portfolioAiInsights.value = AiTaskState.Idle
        _nlQueryState.value = AiTaskState.Idle
        _statusBanner.value = "Sample Business Workspace reset to original 6 seeded export orders for Tamil Nadu Global Exports Pvt. Ltd."
    }

    fun updateBusinessProfile(
        businessName: String,
        businessType: String,
        primaryBase: String,
        contactEmail: String,
        primaryCategories: String,
        reportingCurrency: String
    ) {
        if (_workspaceMode.value == WorkspaceMode.SAMPLE_BUSINESS) {
            val current = _sampleBundle.value
            _sampleBundle.value = current.copy(
                profile = current.profile.copy(
                    businessName = businessName.trim().ifBlank { current.profile.businessName },
                    businessType = businessType.trim().ifBlank { current.profile.businessType },
                    primaryBase = primaryBase.trim().ifBlank { current.profile.primaryBase },
                    contactEmail = contactEmail.trim().ifBlank { current.profile.contactEmail },
                    primaryCategories = primaryCategories.trim().ifBlank { current.profile.primaryCategories },
                    reportingCurrency = reportingCurrency.trim().ifBlank { "INR" }
                )
            )
            _statusBanner.value = "Updated Sample Business Profile."
        } else {
            val current = _productionBusinessProfile.value
            _productionBusinessProfile.value = current.copy(
                businessName = businessName.trim().ifBlank { current.businessName },
                businessType = businessType.trim().ifBlank { current.businessType },
                primaryBase = primaryBase.trim().ifBlank { current.primaryBase },
                contactEmail = contactEmail.trim().ifBlank { current.contactEmail },
                primaryCategories = primaryCategories.trim().ifBlank { current.primaryCategories },
                reportingCurrency = reportingCurrency.trim().ifBlank { "INR" }
            )
            _statusBanner.value = "Updated Production Business Profile (${businessName.trim()})."
        }
    }

    fun verifyPayPalSandboxConnection() {
        viewModelScope.launch {
            _paypalAuthCheckState.value = "Checking https://api-m.sandbox.paypal.com/v1/oauth2/token..."
            val res = payPalService.verifySandboxOAuthConnection()
            res.fold(
                onSuccess = { msg ->
                    _paypalAuthCheckState.value = msg
                    _statusBanner.value = msg
                },
                onFailure = { err ->
                    _paypalAuthCheckState.value = err.localizedMessage ?: "FAIL: PayPal OAuth check failed."
                    _statusBanner.value = _paypalAuthCheckState.value
                }
            )
        }
    }

    private fun observeRawWorkspaceData(): Flow<WorkspaceRawTuple> {
        return _workspaceMode.flatMapLatest { mode ->
            if (mode == WorkspaceMode.SAMPLE_BUSINESS || repository == null || currentUserId == SampleBusinessWorkspaceSeeder.SAMPLE_USER_ID) {
                _sampleBundle.combine(flowOf(WorkspaceMode.SAMPLE_BUSINESS)) { bundle, m ->
                    WorkspaceRawTuple(
                        mode = m,
                        profile = bundle.profile,
                        orders = bundle.orders,
                        assessments = bundle.assessments,
                        documents = bundle.documents,
                        payments = bundle.payments,
                        activities = bundle.activities
                    )
                }
            } else {
                combine(
                    repository.observeOrders(currentUserId),
                    repository.observeFinancialAssessments(currentUserId),
                    repository.observeDocumentRecords(currentUserId),
                    repository.observePaymentRecords(currentUserId),
                    repository.observeActivityRecords(currentUserId)
                ) { orders, assessments, docs, payments, activities ->
                    Tuple5(orders, assessments, docs, payments, activities)
                }.combine(_productionBusinessProfile) { tuple, prodProfile ->
                    WorkspaceRawTuple(
                        mode = WorkspaceMode.PRODUCTION,
                        profile = prodProfile,
                        orders = tuple.first,
                        assessments = tuple.second,
                        documents = tuple.third,
                        payments = tuple.fourth,
                        activities = tuple.fifth
                    )
                }
            }
        }
    }

    val portfolioState: StateFlow<NiryatPortfolioState> = observeRawWorkspaceData()
        .combine(_selectedOrderId) { raw, selectedId ->
            val effectiveOrder = raw.orders.firstOrNull { it.id == selectedId } ?: raw.orders.firstOrNull()
            val effectiveOrderId = effectiveOrder?.id

            val digitalTwin = if (effectiveOrder != null) {
                val orderAssessment = raw.assessments.firstOrNull { it.exportOrderId == effectiveOrder.id }
                val orderDocs = raw.documents.filter { it.exportOrderId == effectiveOrder.id }
                val orderPayments = raw.payments.filter { it.exportOrderId == effectiveOrder.id }
                FinancialCalculationEngine.buildDigitalTwinState(
                    order = effectiveOrder,
                    financialAssessment = orderAssessment,
                    documents = orderDocs,
                    payments = orderPayments
                )
            } else null

            val metrics = FinancialCalculationEngine.calculatePortfolioMetrics(
                orders = raw.orders,
                assessments = raw.assessments,
                documents = raw.documents,
                payments = raw.payments
            )

            NiryatPortfolioState(
                isLoading = false,
                workspaceMode = raw.mode,
                businessProfile = raw.profile,
                orders = raw.orders,
                assessments = raw.assessments,
                documents = raw.documents,
                payments = raw.payments,
                activities = raw.activities,
                selectedOrderId = effectiveOrderId,
                selectedDigitalTwin = digitalTwin,
                performanceMetrics = metrics,
                errorMessage = null
            )
        }.catch { error ->
            val firestoreError = generateSequence(error) { it.cause }
                .filterIsInstance<FirebaseFirestoreException>()
                .firstOrNull()
            if (firestoreError == null && error is CancellationException) throw error
            val rootError = firestoreError ?: error
            Log.w(TAG, "Error observing NiryatFlow portfolio streams", rootError)
            emit(
                NiryatPortfolioState(
                    isLoading = false,
                    workspaceMode = _workspaceMode.value,
                    errorMessage = rootError.message ?: "Failed to load export operations data"
                )
            )
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000L),
            initialValue = NiryatPortfolioState(
                isLoading = true,
                workspaceMode = initialMode
            )
        )

    fun selectOrder(orderId: String) {
        _selectedOrderId.value = orderId
        _financialAiExplanation.value = AiTaskState.Idle
    }

    fun clearBanner() {
        _statusBanner.value = null
    }

    fun generateOrderNumber(): String {
        val datePart = SimpleDateFormat("yyyyMM", Locale.US).format(Date())
        val suffix = UUID.randomUUID().toString().uppercase(Locale.US).take(4)
        return if (_workspaceMode.value == WorkspaceMode.SAMPLE_BUSINESS) {
            "SAMPLE-$datePart-$suffix"
        } else {
            "NF-$datePart-$suffix"
        }
    }

    // --- STEP 1 & 2: ORDER CREATION & AI EXTRACTION ---

    fun runAiOrderExtraction(rawText: String, bitmap: Bitmap? = null) {
        if (rawText.isBlank() && bitmap == null) {
            _extractionState.value = AiTaskState.Error("Provide a purchase order description or document image to extract.")
            return
        }
        viewModelScope.launch {
            _extractionState.value = AiTaskState.Loading
            val res = geminiService.extractOrderFromTextOrImage(rawText, bitmap)
            res.fold(
                onSuccess = { draft ->
                    _extractionState.value = AiTaskState.Success(draft)
                    _statusBanner.value = "Gemini extracted order fields (Confidence: ${draft.confidenceScore}%). Review & confirm below."
                },
                onFailure = { err ->
                    _extractionState.value = AiTaskState.Error(err.localizedMessage ?: "AI extraction failed.")
                }
            )
        }
    }

    fun resetExtractionDraft() {
        _extractionState.value = AiTaskState.Idle
    }

    fun createExportOrder(
        orderNumber: String,
        exporterName: String,
        exporterContact: String,
        exporterAddress: String,
        buyerName: String,
        buyerCountry: String,
        buyerContact: String,
        buyerAddress: String,
        productName: String,
        productDescription: String,
        quantity: Double,
        unit: String,
        unitPrice: Double,
        currency: String,
        incoterm: String,
        destinationPort: String,
        orderDate: String,
        expectedShipmentDate: String,
        paymentTerms: String,
        advancePercentage: Double,
        extractionSource: String,
        onCreated: (String) -> Unit = {}
    ) {
        if (_orderSubmitting.value) return
        val grossVal = FinancialCalculationEngine.calculateGrossOrderValue(quantity, unitPrice)
        val cleanOrderNo = orderNumber.ifBlank { generateOrderNumber() }

        if (_workspaceMode.value == WorkspaceMode.SAMPLE_BUSINESS || repository == null) {
            val newId = "sample_ord_${UUID.randomUUID().toString().take(6)}"
            val nowTs = Timestamp.now()
            val sampleOrder = ExportOrder(
                id = newId,
                userId = SampleBusinessWorkspaceSeeder.SAMPLE_USER_ID,
                orderNumber = cleanOrderNo,
                exporterName = exporterName.trim(),
                exporterContact = exporterContact.trim(),
                exporterAddress = exporterAddress.trim(),
                buyerName = buyerName.trim(),
                buyerCountry = buyerCountry.trim(),
                buyerContact = buyerContact.trim(),
                buyerAddress = buyerAddress.trim(),
                productName = productName.trim(),
                productDescription = productDescription.trim(),
                quantity = quantity,
                unit = unit.trim().ifBlank { "PCS" },
                unitPrice = unitPrice,
                orderValue = grossVal,
                currency = currency.trim().uppercase(Locale.US).ifBlank { "USD" },
                incoterm = incoterm.trim().uppercase(Locale.US).ifBlank { "FOB" },
                destinationPort = destinationPort.trim(),
                orderDate = orderDate.trim(),
                expectedShipmentDate = expectedShipmentDate.trim(),
                paymentTerms = paymentTerms.trim().ifBlank { "30% Advance, 70% CAD" },
                advancePercentage = advancePercentage.coerceIn(0.0, 100.0),
                orderStatus = "VALIDATED",
                extractionSource = extractionSource,
                createdAt = nowTs,
                updatedAt = nowTs
            )
            val fx = FinancialCalculationEngine.defaultExchangeRateForCurrency(sampleOrder.currency)
            val convInr = grossVal * fx
            val sampleAssess = FinancialCalculationEngine.calculateAssessment(
                userId = SampleBusinessWorkspaceSeeder.SAMPLE_USER_ID,
                exportOrderId = newId,
                existingId = "sample_fin_$newId",
                quantity = quantity,
                unitPrice = unitPrice,
                currency = sampleOrder.currency,
                exchangeRate = fx,
                advancePercentage = sampleOrder.advancePercentage,
                paymentFeePercentage = 3.2,
                paymentFixedFee = 0.30,
                procurementCostInr = convInr * 0.55,
                logisticsCostInr = convInr * 0.08,
                packagingCostInr = convInr * 0.03,
                otherCostsInr = convInr * 0.02,
                assumptionsNote = "Sample Workspace baseline calculation."
            )
            val defaultDocs = listOf(
                "Commercial Invoice" to "REQUIRED",
                "Packing List" to "REQUIRED",
                "Shipping Bill" to "REQUIRED",
                "Bill of Lading / Air Waybill" to "REQUIRED",
                "Certificate of Origin" to "REQUIRED"
            ).mapIndexed { idx, (dType, req) ->
                DocumentRecord(
                    id = "${newId}_doc_${idx + 1}",
                    userId = SampleBusinessWorkspaceSeeder.SAMPLE_USER_ID,
                    exportOrderId = newId,
                    documentType = dType,
                    requirementLevel = req,
                    status = "MISSING",
                    fileName = "",
                    fileReference = "",
                    reviewerNote = "Initialized in Sample Workspace",
                    createdAt = nowTs,
                    updatedAt = nowTs
                )
            }
            val newAct = ActivityRecord(
                id = "sample_act_${UUID.randomUUID().toString().take(6)}",
                userId = SampleBusinessWorkspaceSeeder.SAMPLE_USER_ID,
                exportOrderId = newId,
                eventType = "ORDER_CREATED",
                title = "Sample Order $cleanOrderNo Created",
                description = "${sampleOrder.productName} for ${sampleOrder.buyerName} (${sampleOrder.currency} $grossVal)",
                createdAt = nowTs,
                updatedAt = nowTs
            )
            val cur = _sampleBundle.value
            _sampleBundle.value = cur.copy(
                orders = listOf(sampleOrder) + cur.orders,
                assessments = listOf(sampleAssess) + cur.assessments,
                documents = defaultDocs + cur.documents,
                activities = listOf(newAct) + cur.activities
            )
            _selectedOrderId.value = newId
            _extractionState.value = AiTaskState.Idle
            _statusBanner.value = "Sample Order $cleanOrderNo created in isolated Sample Business Workspace."
            onCreated(newId)
            return
        }

        viewModelScope.launch {
            _orderSubmitting.value = true
            val newOrder = ExportOrder(
                userId = currentUserId,
                orderNumber = cleanOrderNo,
                exporterName = exporterName.trim(),
                exporterContact = exporterContact.trim(),
                exporterAddress = exporterAddress.trim(),
                buyerName = buyerName.trim(),
                buyerCountry = buyerCountry.trim(),
                buyerContact = buyerContact.trim(),
                buyerAddress = buyerAddress.trim(),
                productName = productName.trim(),
                productDescription = productDescription.trim(),
                quantity = quantity,
                unit = unit.trim().ifBlank { "KG" },
                unitPrice = unitPrice,
                orderValue = grossVal,
                currency = currency.trim().uppercase(Locale.US).ifBlank { "USD" },
                incoterm = incoterm.trim().uppercase(Locale.US).ifBlank { "FOB" },
                destinationPort = destinationPort.trim(),
                orderDate = orderDate.trim(),
                expectedShipmentDate = expectedShipmentDate.trim(),
                paymentTerms = paymentTerms.trim().ifBlank { "30% Advance, 70% CAD" },
                advancePercentage = advancePercentage.coerceIn(0.0, 100.0),
                orderStatus = "VALIDATED",
                extractionSource = extractionSource
            )
            val result = repository.createOrder(newOrder, initializeDefaultChecklist = true)
            _orderSubmitting.value = false
            result.fold(
                onSuccess = { newId ->
                    _selectedOrderId.value = newId
                    _extractionState.value = AiTaskState.Idle
                    _statusBanner.value = "Export Order $cleanOrderNo confirmed & connected to Digital Twin."
                    onCreated(newId)
                },
                onFailure = { err ->
                    _statusBanner.value = "Failed to save order: ${err.localizedMessage}"
                }
            )
        }
    }

    // --- STEP 3: DETERMINISTIC FINANCIAL INTELLIGENCE ---

    fun saveFinancialAssessment(
        order: ExportOrder,
        exchangeRate: Double,
        advancePercentage: Double,
        paymentFeePercentage: Double,
        paymentFixedFee: Double,
        procurementCostInr: Double,
        logisticsCostInr: Double,
        packagingCostInr: Double,
        otherCostsInr: Double,
        assumptionsNote: String
    ) {
        val calculated = FinancialCalculationEngine.calculateAssessment(
            userId = if (_workspaceMode.value == WorkspaceMode.SAMPLE_BUSINESS) SampleBusinessWorkspaceSeeder.SAMPLE_USER_ID else currentUserId,
            exportOrderId = order.id,
            existingId = order.id,
            quantity = order.quantity,
            unitPrice = order.unitPrice,
            currency = order.currency,
            exchangeRate = exchangeRate,
            advancePercentage = advancePercentage,
            paymentFeePercentage = paymentFeePercentage,
            paymentFixedFee = paymentFixedFee,
            procurementCostInr = procurementCostInr,
            logisticsCostInr = logisticsCostInr,
            packagingCostInr = packagingCostInr,
            otherCostsInr = otherCostsInr,
            assumptionsNote = assumptionsNote
        )

        if (_workspaceMode.value == WorkspaceMode.SAMPLE_BUSINESS || repository == null) {
            val cur = _sampleBundle.value
            val updatedAssessments = cur.assessments.filterNot { it.exportOrderId == order.id } + calculated
            val act = ActivityRecord(
                id = "sample_act_${UUID.randomUUID().toString().take(6)}",
                userId = SampleBusinessWorkspaceSeeder.SAMPLE_USER_ID,
                exportOrderId = order.id,
                eventType = "FINANCIAL_UPDATED",
                title = "${order.orderNumber} Financial Viability Updated (${calculated.profitMarginPercent}% Margin)",
                description = "Est. Profit: ₹${FinancialCalculationEngine.formatInrShort(calculated.estimatedProfitInr)} @ FX ₹$exchangeRate [Sample]",
                createdAt = Timestamp.now(),
                updatedAt = Timestamp.now()
            )
            _sampleBundle.value = cur.copy(
                assessments = updatedAssessments,
                activities = listOf(act) + cur.activities
            )
            _statusBanner.value = "Sample financial assessment saved (Margin: ${calculated.profitMarginPercent}%)."
            return
        }

        viewModelScope.launch {
            val res = repository.saveFinancialAssessment(calculated)
            res.fold(
                onSuccess = {
                    _statusBanner.value = "Financial assessment saved (Margin: ${calculated.profitMarginPercent}%)."
                },
                onFailure = { err ->
                    _statusBanner.value = "Failed to save financial assessment: ${err.localizedMessage}"
                }
            )
        }
    }

    fun requestFinancialExplanation(order: ExportOrder, assessment: FinancialAssessment) {
        viewModelScope.launch {
            _financialAiExplanation.value = AiTaskState.Loading
            val res = geminiService.explainFinancialViability(order, assessment)
            res.fold(
                onSuccess = { text -> _financialAiExplanation.value = AiTaskState.Success(text) },
                onFailure = { err ->
                    _financialAiExplanation.value = AiTaskState.Error(err.localizedMessage ?: "AI explanation failed.")
                }
            )
        }
    }

    // --- STEP 4: DOCUMENT READINESS ---

    fun initializeChecklistIfEmpty(orderId: String) {
        if (_workspaceMode.value == WorkspaceMode.SAMPLE_BUSINESS || repository == null) {
            val nowTs = Timestamp.now()
            val docs = listOf(
                "Commercial Invoice" to "REQUIRED",
                "Packing List" to "REQUIRED",
                "Shipping Bill" to "REQUIRED",
                "Bill of Lading / Air Waybill" to "REQUIRED",
                "Certificate of Origin" to "REQUIRED"
            ).mapIndexed { idx, (dType, req) ->
                DocumentRecord(
                    id = "${orderId}_doc_${idx + 1}",
                    userId = SampleBusinessWorkspaceSeeder.SAMPLE_USER_ID,
                    exportOrderId = orderId,
                    documentType = dType,
                    requirementLevel = req,
                    status = "MISSING",
                    createdAt = nowTs,
                    updatedAt = nowTs
                )
            }
            val cur = _sampleBundle.value
            _sampleBundle.value = cur.copy(documents = cur.documents + docs)
            _statusBanner.value = "Initialized sample document checklist."
            return
        }

        viewModelScope.launch {
            repository.initializeDocumentChecklistForOrder(orderId)
            _statusBanner.value = "Initialized standard export documentation checklist."
        }
    }

    fun updateDocumentItem(
        doc: DocumentRecord,
        newRequirementLevel: String = doc.requirementLevel,
        newStatus: String = doc.status,
        newFileName: String = doc.fileName,
        newFileReference: String = doc.fileReference,
        newReviewerNote: String = doc.reviewerNote
    ) {
        if (_workspaceMode.value == WorkspaceMode.SAMPLE_BUSINESS || repository == null) {
            val cur = _sampleBundle.value
            val updatedDoc = doc.copy(
                requirementLevel = newRequirementLevel,
                status = newStatus,
                fileName = newFileName,
                fileReference = newFileReference,
                reviewerNote = newReviewerNote,
                updatedAt = Timestamp.now()
            )
            val act = ActivityRecord(
                id = "sample_act_${UUID.randomUUID().toString().take(6)}",
                userId = SampleBusinessWorkspaceSeeder.SAMPLE_USER_ID,
                exportOrderId = doc.exportOrderId,
                eventType = if (newStatus == "VERIFIED") "DOC_VERIFIED" else "DOC_UPDATED",
                title = "${doc.documentType} -> $newStatus",
                description = if (newFileName.isNotBlank()) "File: $newFileName ($newReviewerNote)" else newReviewerNote,
                createdAt = Timestamp.now(),
                updatedAt = Timestamp.now()
            )
            _sampleBundle.value = cur.copy(
                documents = cur.documents.map { if (it.id == doc.id) updatedDoc else it },
                activities = listOf(act) + cur.activities
            )
            _statusBanner.value = "${doc.documentType} updated to $newStatus in Sample Workspace."
            return
        }

        viewModelScope.launch {
            val res = repository.updateDocumentRecord(
                docId = doc.id,
                exportOrderId = doc.exportOrderId,
                documentType = doc.documentType,
                requirementLevel = newRequirementLevel,
                status = newStatus,
                fileName = newFileName,
                fileReference = newFileReference,
                reviewerNote = newReviewerNote
            )
            res.fold(
                onSuccess = {
                    _statusBanner.value = "${doc.documentType} updated to $newStatus."
                },
                onFailure = { err ->
                    _statusBanner.value = "Failed to update document: ${err.localizedMessage}"
                }
            )
        }
    }

    fun addCustomDocument(exportOrderId: String, documentType: String, requirementLevel: String) {
        if (documentType.isBlank()) return
        if (_workspaceMode.value == WorkspaceMode.SAMPLE_BUSINESS || repository == null) {
            val cur = _sampleBundle.value
            val newDoc = DocumentRecord(
                id = "${exportOrderId}_doc_${UUID.randomUUID().toString().take(5)}",
                userId = SampleBusinessWorkspaceSeeder.SAMPLE_USER_ID,
                exportOrderId = exportOrderId,
                documentType = documentType.trim(),
                requirementLevel = requirementLevel,
                status = "MISSING",
                reviewerNote = "Custom compliance document added in Sample Workspace",
                createdAt = Timestamp.now(),
                updatedAt = Timestamp.now()
            )
            _sampleBundle.value = cur.copy(documents = cur.documents + newDoc)
            _statusBanner.value = "Added '$documentType' to sample checklist."
            return
        }

        viewModelScope.launch {
            repository.addCustomDocumentCategory(exportOrderId, documentType.trim(), requirementLevel)
            _statusBanner.value = "Added '$documentType' to checklist."
        }
    }

    // --- STEP 5: REAL PAYPAL SANDBOX INTEGRATION ---

    fun createPayPalSandboxOrder(
        order: ExportOrder,
        amount: Double,
        paymentType: String
    ) {
        if (_paymentBusy.value) return
        viewModelScope.launch {
            _paymentBusy.value = true
            val apiResult = payPalService.createSandboxOrder(
                exportOrderNumber = order.orderNumber,
                amount = amount,
                currency = order.currency,
                description = "${order.orderNumber} - ${order.productName} ($paymentType)"
            )
            apiResult.fold(
                onSuccess = { ppOrder ->
                    val record = PaymentRecord(
                        id = "pay_${UUID.randomUUID().toString().take(8)}",
                        userId = if (_workspaceMode.value == WorkspaceMode.SAMPLE_BUSINESS) SampleBusinessWorkspaceSeeder.SAMPLE_USER_ID else currentUserId,
                        exportOrderId = order.id,
                        paypalOrderId = ppOrder.paypalOrderId,
                        paypalCaptureId = "",
                        approvalUrl = ppOrder.approvalUrl,
                        amount = amount,
                        currency = order.currency,
                        paymentType = paymentType,
                        paymentStatus = "PENDING_APPROVAL",
                        verificationDetails = ppOrder.rawSummary,
                        createdAt = Timestamp.now(),
                        updatedAt = Timestamp.now()
                    )
                    if (_workspaceMode.value == WorkspaceMode.SAMPLE_BUSINESS || repository == null) {
                        val cur = _sampleBundle.value
                        _sampleBundle.value = cur.copy(payments = listOf(record) + cur.payments)
                    } else {
                        repository.createPaymentRecord(record)
                        repository.updateOrderStatus(
                            orderId = order.id,
                            newStatus = "PAYMENT_INITIATED",
                            reason = "PayPal Sandbox Order ${ppOrder.paypalOrderId} created"
                        )
                    }
                    _statusBanner.value = "PayPal Sandbox Order ${ppOrder.paypalOrderId} created! Open approval URL to approve as Sandbox buyer."
                },
                onFailure = { err ->
                    _statusBanner.value = "PayPal Sandbox Error: ${err.localizedMessage}"
                }
            )
            _paymentBusy.value = false
        }
    }

    fun capturePayPalSandboxOrder(payment: PaymentRecord) {
        if (_paymentBusy.value) return
        if (payment.paymentStatus == "CAPTURED") {
            _statusBanner.value = "Payment is already captured (Capture ID: ${payment.paypalCaptureId}). Duplicate capture prevented."
            return
        }

        // If in Sample Business Workspace and this is one of the preloaded sample payments (PAYID-SAMPLE-*)
        // while live PayPal Sandbox keys are not configured, allow verifying the sample workflow cleanly
        if (_workspaceMode.value == WorkspaceMode.SAMPLE_BUSINESS &&
            payment.paypalOrderId.startsWith("PAYID-SAMPLE-") &&
            !isPayPalConfigured
        ) {
            val sampleCapId = "CAP-SAMPLE-${UUID.randomUUID().toString().uppercase(Locale.US).take(6)}"
            val cur = _sampleBundle.value
            val updatedPayments = cur.payments.map {
                if (it.id == payment.id) {
                    it.copy(
                        paypalCaptureId = sampleCapId,
                        paymentStatus = "CAPTURED",
                        verificationDetails = "Sample Workspace capture verified ($sampleCapId) [Fictional Sample Record]",
                        updatedAt = Timestamp.now()
                    )
                } else it
            }
            val updatedOrders = cur.orders.map {
                if (it.id == payment.exportOrderId) it.copy(orderStatus = "PAYMENT_COMPLETED", updatedAt = Timestamp.now()) else it
            }
            val act = ActivityRecord(
                id = "sample_act_${UUID.randomUUID().toString().take(6)}",
                userId = SampleBusinessWorkspaceSeeder.SAMPLE_USER_ID,
                exportOrderId = payment.exportOrderId,
                eventType = "PAYMENT_CAPTURED",
                title = "Sample Payment Captured (${payment.currency} ${payment.amount})",
                description = "Sample Capture ID: $sampleCapId [Fictional Sample Transaction]",
                createdAt = Timestamp.now(),
                updatedAt = Timestamp.now()
            )
            _sampleBundle.value = cur.copy(
                orders = updatedOrders,
                payments = updatedPayments,
                activities = listOf(act) + cur.activities
            )
            _statusBanner.value = "Sample Payment Captured ($sampleCapId) in Sample Business Workspace."
            return
        }

        viewModelScope.launch {
            _paymentBusy.value = true
            val captureRes = payPalService.captureSandboxOrder(payment.paypalOrderId)
            captureRes.fold(
                onSuccess = { cap ->
                    if (_workspaceMode.value == WorkspaceMode.SAMPLE_BUSINESS || repository == null) {
                        val cur = _sampleBundle.value
                        _sampleBundle.value = cur.copy(
                            payments = cur.payments.map {
                                if (it.id == payment.id) {
                                    it.copy(
                                        paypalCaptureId = cap.captureId,
                                        paymentStatus = "CAPTURED",
                                        verificationDetails = cap.verificationSummary
                                    )
                                } else it
                            }
                        )
                    } else {
                        repository.updatePaymentRecord(
                            paymentId = payment.id,
                            exportOrderId = payment.exportOrderId,
                            paypalOrderId = cap.paypalOrderId,
                            paypalCaptureId = cap.captureId,
                            paymentStatus = "CAPTURED",
                            verificationDetails = cap.verificationSummary
                        )
                    }
                    _statusBanner.value = "Payment Verified & Captured! Capture ID: ${cap.captureId}"
                },
                onFailure = { err ->
                    if (_workspaceMode.value == WorkspaceMode.PRODUCTION && repository != null) {
                        repository.updatePaymentRecord(
                            paymentId = payment.id,
                            exportOrderId = payment.exportOrderId,
                            paypalOrderId = payment.paypalOrderId,
                            paypalCaptureId = payment.paypalCaptureId,
                            paymentStatus = "REQUIRES_RECONCILIATION",
                            verificationDetails = "Capture check failed: ${err.localizedMessage}"
                        )
                    }
                    _statusBanner.value = "Capture verification failed: ${err.localizedMessage}"
                }
            )
            _paymentBusy.value = false
        }
    }

    fun reconcilePayPalOrderStatus(payment: PaymentRecord) {
        if (_paymentBusy.value) return
        viewModelScope.launch {
            _paymentBusy.value = true
            val statusRes = payPalService.getSandboxOrderStatus(payment.paypalOrderId)
            statusRes.fold(
                onSuccess = { info ->
                    val mappedStatus = when (info.status) {
                        "COMPLETED" -> "CAPTURED"
                        "APPROVED" -> "APPROVED"
                        "CREATED", "SAVED", "PAYER_ACTION_REQUIRED" -> "PENDING_APPROVAL"
                        "VOIDED" -> "CANCELLED"
                        else -> "REQUIRES_RECONCILIATION"
                    }
                    if (_workspaceMode.value == WorkspaceMode.PRODUCTION && repository != null) {
                        repository.updatePaymentRecord(
                            paymentId = payment.id,
                            exportOrderId = payment.exportOrderId,
                            paypalOrderId = info.paypalOrderId,
                            paypalCaptureId = info.captureId,
                            paymentStatus = mappedStatus,
                            verificationDetails = info.verificationSummary
                        )
                    }
                    _statusBanner.value = "Reconciled with PayPal Sandbox: ${info.verificationSummary}"
                },
                onFailure = { err ->
                    _statusBanner.value = "Reconciliation failed: ${err.localizedMessage}"
                }
            )
            _paymentBusy.value = false
        }
    }

    // --- STEP 7: EXPORT PERFORMANCE INTELLIGENCE & NATURAL LANGUAGE QUERIES ---

    fun requestPortfolioInsights() {
        val currentState = portfolioState.value
        viewModelScope.launch {
            _portfolioAiInsights.value = AiTaskState.Loading
            val res = geminiService.generatePortfolioInsights(
                metrics = currentState.performanceMetrics,
                orders = currentState.orders
            )
            res.fold(
                onSuccess = { text -> _portfolioAiInsights.value = AiTaskState.Success(text) },
                onFailure = { err ->
                    _portfolioAiInsights.value = AiTaskState.Error(err.localizedMessage ?: "Failed to generate insights.")
                }
            )
        }
    }

    fun askNaturalLanguageBusinessQuery(query: String) {
        if (query.isBlank()) return
        val currentState = portfolioState.value
        viewModelScope.launch {
            _nlQueryState.value = AiTaskState.Loading
            val res = geminiService.answerNaturalLanguageBusinessQuery(
                query = query.trim(),
                businessName = currentState.businessProfile.businessName,
                isSampleWorkspace = currentState.workspaceMode == WorkspaceMode.SAMPLE_BUSINESS,
                metrics = currentState.performanceMetrics,
                orders = currentState.orders,
                assessments = currentState.assessments,
                documents = currentState.documents,
                payments = currentState.payments
            )
            res.fold(
                onSuccess = { answer -> _nlQueryState.value = AiTaskState.Success(answer) },
                onFailure = { err ->
                    _nlQueryState.value = AiTaskState.Error(err.localizedMessage ?: "Failed to answer business query.")
                }
            )
        }
    }

    /**
     * Generates a structured CSV report from actual workspace records (Section 14).
     */
    fun generateBusinessReportCsv(reportTitle: String): String {
        val state = portfolioState.value
        val nowStr = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).format(Date())
        val sampleTag = if (state.workspaceMode == WorkspaceMode.SAMPLE_BUSINESS) {
            "SAMPLE WORKSPACE DATA (FICTIONAL - TAMIL NADU GLOBAL EXPORTS PVT. LTD.)"
        } else {
            "PRODUCTION WORKSPACE DATA"
        }

        val sb = StringBuilder()
        sb.appendLine("# NIRYATFLOW AI — $reportTitle")
        sb.appendLine("# Business: ${state.businessProfile.businessName}")
        sb.appendLine("# Workspace Classification: $sampleTag")
        sb.appendLine("# Generated At: $nowStr | Base Reporting Currency: ${state.businessProfile.reportingCurrency}")
        sb.appendLine()

        when (reportTitle) {
            "Export Order Report", "Order Completion Report" -> {
                sb.appendLine("OrderNumber,BuyerName,Country,Product,Quantity,Unit,UnitPrice,Currency,OrderValue,Incoterm,DestinationPort,Status")
                state.orders.forEach { o ->
                    sb.appendLine("${o.orderNumber},\"${o.buyerName}\",${o.buyerCountry},\"${o.productName}\",${o.quantity},${o.unit},${o.unitPrice},${o.currency},${o.orderValue},${o.incoterm},\"${o.destinationPort}\",${o.orderStatus}")
                }
            }
            "Financial Performance Report" -> {
                sb.appendLine("OrderNumber,Currency,GrossValue,ExchangeRateINR,ConvertedValueINR,PaymentFeeINR,NetRevenueINR,EstimatedProfitINR,ProfitMarginPercent")
                val ordMap = state.orders.associateBy { it.id }
                state.assessments.forEach { a ->
                    val ordNo = ordMap[a.exportOrderId]?.orderNumber ?: a.exportOrderId
                    sb.appendLine("$ordNo,${a.currency},${a.grossOrderValue},${a.exchangeRate},${a.convertedValueInr},${a.paymentFeeInr},${a.estimatedNetRevenueInr},${a.estimatedProfitInr},${a.profitMarginPercent}%")
                }
            }
            "Outstanding Payment Report" -> {
                sb.appendLine("OrderNumber,PayPalOrderID,PayPalCaptureID,PaymentType,Currency,Amount,PaymentStatus,VerificationDetails")
                val ordMap = state.orders.associateBy { it.id }
                state.payments.forEach { p ->
                    val ordNo = ordMap[p.exportOrderId]?.orderNumber ?: p.exportOrderId
                    sb.appendLine("$ordNo,${p.paypalOrderId},${p.paypalCaptureId},${p.paymentType},${p.currency},${p.amount},${p.paymentStatus},\"${p.verificationDetails}\"")
                }
            }
            "Document Readiness Report" -> {
                sb.appendLine("OrderNumber,DocumentType,RequirementLevel,Status,FileName,ReviewerNote")
                val ordMap = state.orders.associateBy { it.id }
                state.documents.forEach { d ->
                    val ordNo = ordMap[d.exportOrderId]?.orderNumber ?: d.exportOrderId
                    sb.appendLine("$ordNo,\"${d.documentType}\",${d.requirementLevel},${d.status},\"${d.fileName}\",\"${d.reviewerNote}\"")
                }
            }
            "Export Destination Report" -> {
                sb.appendLine("DestinationCountry,TotalExportValueINR")
                state.performanceMetrics.countryDistribution.forEach { (country, inrVal) ->
                    sb.appendLine("\"$country\",$inrVal")
                }
            }
        }
        return sb.toString()
    }

    private data class WorkspaceRawTuple(
        val mode: WorkspaceMode,
        val profile: BusinessProfile,
        val orders: List<ExportOrder>,
        val assessments: List<FinancialAssessment>,
        val documents: List<DocumentRecord>,
        val payments: List<PaymentRecord>,
        val activities: List<ActivityRecord>
    )

    private data class Tuple5<A, B, C, D, E>(
        val first: A,
        val second: B,
        val third: C,
        val fourth: D,
        val fifth: E
    )

    private companion object {
        const val TAG = "NiryatVM"
    }
}
