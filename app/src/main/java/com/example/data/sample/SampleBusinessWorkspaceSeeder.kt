package com.example.data.sample

import com.example.data.model.ActivityRecord
import com.example.data.model.DocumentRecord
import com.example.data.model.ExportOrder
import com.example.data.model.FinancialAssessment
import com.example.data.model.PaymentRecord
import com.example.domain.FinancialCalculationEngine
import com.google.firebase.Timestamp
import java.util.Date

enum class WorkspaceMode {
    PRODUCTION,
    SAMPLE_BUSINESS
}

data class BusinessProfile(
    val businessId: String = "biz_prod_default",
    val businessName: String = "Niryat Global Precision Exports Pvt. Ltd.",
    val businessType: String = "MSME Manufacturer & Merchant Exporter",
    val role: String = "OWNER",
    val primaryBase: String = "Chennai, Tamil Nadu, India",
    val contactEmail: String = "exports@niryatflow.in",
    val contactPhone: String = "+91 44 2250 8841",
    val primaryCategories: String = "Textiles, Engineering Components, Spices & Agro",
    val reportingCurrency: String = "INR",
    val website: String = "https://niryatflow.example.com",
    val exportExperienceYears: Int = 8,
    val isSampleWorkspace: Boolean = false
)

data class SampleWorkspaceSeedBundle(
    val profile: BusinessProfile,
    val orders: List<ExportOrder>,
    val assessments: List<FinancialAssessment>,
    val documents: List<DocumentRecord>,
    val payments: List<PaymentRecord>,
    val activities: List<ActivityRecord>
)

/**
 * Isolated Sample Business Workspace Seeder (Sections 2, 10 & 11 of Master Prompt).
 * Represents fictional Indian MSME exporter: Tamil Nadu Global Exports Pvt. Ltd. (Chennai, Tamil Nadu).
 * Preloads 6 export orders, 6 international buyers, 6 financial breakdowns, 30 document records,
 * 6 payment records, and 22 activity events across multiple currencies (EUR, USD, AED, SGD, GBP, JPY).
 * Strictly isolated from production customer data.
 */
object SampleBusinessWorkspaceSeeder {

    const val SAMPLE_USER_ID = "sample_workspace_tn_global_exports"

    fun defaultSampleBusinessProfile(): BusinessProfile = BusinessProfile(
        businessId = "biz_sample_tn_global_001",
        businessName = "Tamil Nadu Global Exports Pvt. Ltd.",
        businessType = "Mid-Sized MSME Star Export House (Sample Workspace)",
        role = "OWNER",
        primaryBase = "Guindy Industrial Estate, Chennai, Tamil Nadu, India",
        contactEmail = "operations@tnglobalexports.sample.in",
        contactPhone = "+91 44 4812 9000",
        primaryCategories = "Textiles, Automotive Components, Spices, Electronics, Handicrafts, Agro",
        reportingCurrency = "INR",
        website = "https://tnglobalexports.sample.in",
        exportExperienceYears = 12,
        isSampleWorkspace = true
    )

    private fun tsSecondsAgo(secondsAgo: Long): Timestamp {
        val ms = System.currentTimeMillis() - (secondsAgo * 1000L)
        return Timestamp(Date(ms))
    }

    fun createSeedBundle(): SampleWorkspaceSeedBundle {
        val profile = defaultSampleBusinessProfile()

        // 6 Realistic Fictional Export Orders (Matching Section 10)
        val orders = listOf(
            // ORDER 001: Textile products -> Germany (EUR) | Shipment In Progress
            ExportOrder(
                id = "sample_ord_001",
                userId = SAMPLE_USER_ID,
                orderNumber = "ORDER-001",
                exporterName = profile.businessName,
                exporterContact = profile.contactEmail,
                exporterAddress = profile.primaryBase,
                buyerName = "RheinTextil Handels GmbH [Sample]",
                buyerCountry = "Germany",
                buyerContact = "procurement@rheintextil.sample.de",
                buyerAddress = "Speicherstadt 18, 20457 Hamburg, Germany",
                productName = "Organic Combed Cotton Knitwear & Apparel",
                productDescription = "GOTS Certified 180 GSM Organic Cotton Interlock Apparel (HS: 6109.10.00)",
                quantity = 4500.0,
                unit = "PCS",
                unitPrice = 14.80,
                orderValue = 66600.0,
                currency = "EUR",
                incoterm = "CIF",
                destinationPort = "Hamburg (DEHAM)",
                orderDate = "2026-04-02",
                expectedShipmentDate = "2026-05-18",
                paymentTerms = "40% Advance via PayPal Sandbox, 60% against BL Copy",
                advancePercentage = 40.0,
                orderStatus = "SHIPMENT_IN_PROGRESS",
                extractionSource = "AI_EXTRACTED_CONFIRMED",
                createdAt = tsSecondsAgo(86400L * 18),
                updatedAt = tsSecondsAgo(3600L * 4)
            ),
            // ORDER 002: Automotive components -> United States (USD) | Payment Completed
            ExportOrder(
                id = "sample_ord_002",
                userId = SAMPLE_USER_ID,
                orderNumber = "ORDER-002",
                exporterName = profile.businessName,
                exporterContact = profile.contactEmail,
                exporterAddress = profile.primaryBase,
                buyerName = "Midwest AutoSystems Corp. [Sample]",
                buyerCountry = "United States",
                buyerContact = "supplychain@midwestauto.sample.us",
                buyerAddress = "4400 Renaissance Dr, Detroit, MI 48243, USA",
                productName = "CNC Precision Forged Transmission Shafts",
                productDescription = "SAE 8620 Alloy Steel Case-Hardened Drive Shafts (HS: 8708.99.00)",
                quantity = 2000.0,
                unit = "PCS",
                unitPrice = 42.50,
                orderValue = 85000.0,
                currency = "USD",
                incoterm = "FOB",
                destinationPort = "Newark / New York (USNYC)",
                orderDate = "2026-04-08",
                expectedShipmentDate = "2026-05-22",
                paymentTerms = "50% Advance, 50% Prior to Vessel Departure",
                advancePercentage = 50.0,
                orderStatus = "PAYMENT_COMPLETED",
                extractionSource = "AI_EXTRACTED_CONFIRMED",
                createdAt = tsSecondsAgo(86400L * 15),
                updatedAt = tsSecondsAgo(3600L * 8)
            ),
            // ORDER 003: Spices -> United Arab Emirates (AED) | Documentation Pending
            ExportOrder(
                id = "sample_ord_003",
                userId = SAMPLE_USER_ID,
                orderNumber = "ORDER-003",
                exporterName = profile.businessName,
                exporterContact = profile.contactEmail,
                exporterAddress = profile.primaryBase,
                buyerName = "Al Noor Foodstuff Trading LLC [Sample]",
                buyerCountry = "United Arab Emirates",
                buyerContact = "imports@alnoorfoods.sample.ae",
                buyerAddress = "Al Ras Deira Spice Souk Sector 4, Dubai, UAE",
                productName = "Erode High-Curcumin Turmeric & Green Cardamom",
                productDescription = "5.2% Curcumin Finger Turmeric & 8mm Bold Cardamom (HS: 0910.30.20)",
                quantity = 12000.0,
                unit = "KG",
                unitPrice = 18.50,
                orderValue = 222000.0,
                currency = "AED",
                incoterm = "CIF",
                destinationPort = "Jebel Ali (AEJEA)",
                orderDate = "2026-04-14",
                expectedShipmentDate = "2026-05-25",
                paymentTerms = "30% Advance, 70% CAD against Phytosanitary Cert",
                advancePercentage = 30.0,
                orderStatus = "DOCUMENTATION_PENDING",
                extractionSource = "MANUAL",
                createdAt = tsSecondsAgo(86400L * 11),
                updatedAt = tsSecondsAgo(3600L * 12)
            ),
            // ORDER 004: Electronic components -> Singapore (SGD) | Ready for Payment
            ExportOrder(
                id = "sample_ord_004",
                userId = SAMPLE_USER_ID,
                orderNumber = "ORDER-004",
                exporterName = profile.businessName,
                exporterContact = profile.contactEmail,
                exporterAddress = profile.primaryBase,
                buyerName = "LionCity Microelectronics Pte Ltd [Sample]",
                buyerCountry = "Singapore",
                buyerContact = "sourcing@lioncitymicro.sample.sg",
                buyerAddress = "60 Ayer Rajah Crescent, Singapore 139951",
                productName = "Industrial Multi-Layer IoT Sensor PCB Assemblies",
                productDescription = "6-Layer RoHS Immersion Gold Industrial Controller PCBs (HS: 8534.00.00)",
                quantity = 1500.0,
                unit = "PCS",
                unitPrice = 64.00,
                orderValue = 96000.0,
                currency = "SGD",
                incoterm = "FCA",
                destinationPort = "Singapore Changi Air Cargo (SGSIN)",
                orderDate = "2026-04-18",
                expectedShipmentDate = "2026-05-28",
                paymentTerms = "35% Advance via PayPal Sandbox, 65% Net 30",
                advancePercentage = 35.0,
                orderStatus = "READY_FOR_PAYMENT",
                extractionSource = "AI_EXTRACTED_CONFIRMED",
                createdAt = tsSecondsAgo(86400L * 8),
                updatedAt = tsSecondsAgo(3600L * 16)
            ),
            // ORDER 005: Handicraft products -> United Kingdom (GBP) | Completed
            ExportOrder(
                id = "sample_ord_005",
                userId = SAMPLE_USER_ID,
                orderNumber = "ORDER-005",
                exporterName = profile.businessName,
                exporterContact = profile.contactEmail,
                exporterAddress = profile.primaryBase,
                buyerName = "Thames Heritage Living Ltd [Sample]",
                buyerCountry = "United Kingdom",
                buyerContact = "buyers@thamesheritage.sample.co.uk",
                buyerAddress = "14 Clerkenwell Green, London EC1R 0DP, UK",
                productName = "Thanjavur Artisanal Brass & Rosewood Decor Collection",
                productDescription = "Handcrafted Solid Brass Lamps & Carved Wood Panels (HS: 8306.29.90)",
                quantity = 850.0,
                unit = "SETS",
                unitPrice = 52.00,
                orderValue = 44200.0,
                currency = "GBP",
                incoterm = "CIF",
                destinationPort = "Felixstowe (GBFXT)",
                orderDate = "2026-03-19",
                expectedShipmentDate = "2026-04-20",
                paymentTerms = "40% Advance, 60% Completed on Delivery",
                advancePercentage = 40.0,
                orderStatus = "COMPLETED",
                extractionSource = "MANUAL",
                createdAt = tsSecondsAgo(86400L * 32),
                updatedAt = tsSecondsAgo(86400L * 3)
            ),
            // ORDER 006: Processed agricultural products -> Japan (JPY) | Processing
            ExportOrder(
                id = "sample_ord_006",
                userId = SAMPLE_USER_ID,
                orderNumber = "ORDER-006",
                exporterName = profile.businessName,
                exporterContact = profile.contactEmail,
                exporterAddress = profile.primaryBase,
                buyerName = "Sakura Shokuhin Co., Ltd. [Sample]",
                buyerCountry = "Japan",
                buyerContact = "trade@sakurashokuhin.sample.jp",
                buyerAddress = "2-15 Minatomirai, Nishi-ku, Yokohama 220-0012, Japan",
                productName = "Cold-Pressed Organic Moringa & Alphonso Mango Pulp",
                productDescription = "JAS Organic Certified Aseptic Mango Pulp & Moringa Powder (HS: 2008.99.11)",
                quantity = 18000.0,
                unit = "KG",
                unitPrice = 490.0,
                orderValue = 8820000.0,
                currency = "JPY",
                incoterm = "CFR",
                destinationPort = "Yokohama (JPYOK)",
                orderDate = "2026-04-24",
                expectedShipmentDate = "2026-06-05",
                paymentTerms = "30% Advance, 70% Irrevocable Sight LC",
                advancePercentage = 30.0,
                orderStatus = "PROCESSING",
                extractionSource = "AI_EXTRACTED_CONFIRMED",
                createdAt = tsSecondsAgo(86400L * 4),
                updatedAt = tsSecondsAgo(3600L * 2)
            )
        )

        // 6 Deterministic Financial Breakdowns
        val assessments = orders.map { ord ->
            val fx = FinancialCalculationEngine.defaultExchangeRateForCurrency(ord.currency)
            val convertedInr = ord.orderValue * fx
            FinancialCalculationEngine.calculateAssessment(
                userId = SAMPLE_USER_ID,
                exportOrderId = ord.id,
                existingId = "sample_fin_${ord.id}",
                quantity = ord.quantity,
                unitPrice = ord.unitPrice,
                currency = ord.currency,
                exchangeRate = fx,
                advancePercentage = ord.advancePercentage,
                paymentFeePercentage = 3.2,
                paymentFixedFee = 0.30,
                procurementCostInr = convertedInr * 0.54,
                logisticsCostInr = convertedInr * 0.08,
                packagingCostInr = convertedInr * 0.03,
                otherCostsInr = convertedInr * 0.02,
                assumptionsNote = "Sample Workspace deterministic assessment (${ord.currency}/INR @ ₹$fx, manually verified)."
            )
        }

        // 30 Document Records (5 per order across all 6 orders)
        val docTemplates = listOf(
            "Commercial Invoice" to "REQUIRED",
            "Packing List" to "REQUIRED",
            "Shipping Bill" to "REQUIRED",
            "Bill of Lading / Air Waybill" to "REQUIRED",
            "Certificate of Origin" to "REQUIRED"
        )
        val documents = mutableListOf<DocumentRecord>()
        orders.forEach { ord ->
            docTemplates.forEachIndexed { idx, (docType, reqLevel) ->
                val status = when (ord.orderNumber) {
                    "ORDER-001" -> if (idx < 4) "VERIFIED" else "UPLOADED"
                    "ORDER-002" -> "VERIFIED"
                    "ORDER-003" -> when (idx) {
                        0, 1 -> "VERIFIED"
                        2 -> "UNDER_REVIEW"
                        else -> "MISSING"
                    }
                    "ORDER-004" -> "VERIFIED"
                    "ORDER-005" -> "VERIFIED"
                    else -> if (idx == 0) "UPLOADED" else "MISSING"
                }
                val cleanSlug = docType.lowercase().replace(" / ", "_").replace(' ', '_')
                documents.add(
                    DocumentRecord(
                        id = "${ord.id}_doc_${idx + 1}",
                        userId = SAMPLE_USER_ID,
                        exportOrderId = ord.id,
                        documentType = docType,
                        requirementLevel = reqLevel,
                        status = status,
                        fileName = if (status == "MISSING") "" else "${cleanSlug}_${ord.orderNumber.lowercase()}.pdf",
                        fileReference = if (status == "MISSING") "" else "sample://tnglobalexports/${ord.orderNumber}/$cleanSlug.pdf",
                        reviewerNote = when (status) {
                            "VERIFIED" -> "Internally validated by Tamil Nadu Global Exports compliance desk [Sample]"
                            "UPLOADED", "UNDER_REVIEW" -> "Uploaded; awaiting internal compliance cross-check [Sample]"
                            else -> "Required prior to customs let-export order [Sample]"
                        },
                        createdAt = ord.createdAt,
                        updatedAt = ord.updatedAt
                    )
                )
            }
        }

        // 6 Historical Payment Records
        val payments = listOf(
            PaymentRecord(
                id = "sample_pay_001",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_001",
                paypalOrderId = "PAYID-SAMPLE-DE001A",
                paypalCaptureId = "CAP-SAMPLE-99201DE",
                approvalUrl = "https://www.sandbox.paypal.com/checkoutnow?token=PAYID-SAMPLE-DE001A",
                amount = 26640.0,
                currency = "EUR",
                paymentType = "ADVANCE",
                paymentStatus = "CAPTURED",
                verificationDetails = "40% Advance captured in Sandbox [Sample Fictional Transaction]",
                createdAt = tsSecondsAgo(86400L * 14),
                updatedAt = tsSecondsAgo(86400L * 13)
            ),
            PaymentRecord(
                id = "sample_pay_002",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_002",
                paypalOrderId = "PAYID-SAMPLE-US002F",
                paypalCaptureId = "CAP-SAMPLE-88412US",
                approvalUrl = "https://www.sandbox.paypal.com/checkoutnow?token=PAYID-SAMPLE-US002F",
                amount = 85000.0,
                currency = "USD",
                paymentType = "FULL",
                paymentStatus = "CAPTURED",
                verificationDetails = "100% Order Value verified & captured [Sample Fictional Transaction]",
                createdAt = tsSecondsAgo(86400L * 10),
                updatedAt = tsSecondsAgo(86400L * 9)
            ),
            PaymentRecord(
                id = "sample_pay_003",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_003",
                paypalOrderId = "PAYID-SAMPLE-AE003P",
                paypalCaptureId = "",
                approvalUrl = "https://www.sandbox.paypal.com/checkoutnow?token=PAYID-SAMPLE-AE003P",
                amount = 66600.0,
                currency = "AED",
                paymentType = "ADVANCE",
                paymentStatus = "PENDING_APPROVAL",
                verificationDetails = "30% Advance invoice issued; awaiting buyer approval [Sample]",
                createdAt = tsSecondsAgo(86400L * 6),
                updatedAt = tsSecondsAgo(86400L * 6)
            ),
            PaymentRecord(
                id = "sample_pay_004",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_004",
                paypalOrderId = "PAYID-SAMPLE-SG004R",
                paypalCaptureId = "",
                approvalUrl = "https://www.sandbox.paypal.com/checkoutnow?token=PAYID-SAMPLE-SG004R",
                amount = 33600.0,
                currency = "SGD",
                paymentType = "ADVANCE",
                paymentStatus = "APPROVED",
                verificationDetails = "Buyer approved 35% advance; ready for backend capture [Sample]",
                createdAt = tsSecondsAgo(86400L * 4),
                updatedAt = tsSecondsAgo(86400L * 2)
            ),
            PaymentRecord(
                id = "sample_pay_005",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_005",
                paypalOrderId = "PAYID-SAMPLE-GB005C",
                paypalCaptureId = "CAP-SAMPLE-77105GB",
                approvalUrl = "https://www.sandbox.paypal.com/checkoutnow?token=PAYID-SAMPLE-GB005C",
                amount = 44200.0,
                currency = "GBP",
                paymentType = "FULL",
                paymentStatus = "CAPTURED",
                verificationDetails = "Full GBP settlement captured upon Felixstowe delivery [Sample]",
                createdAt = tsSecondsAgo(86400L * 20),
                updatedAt = tsSecondsAgo(86400L * 5)
            ),
            PaymentRecord(
                id = "sample_pay_006",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_006",
                paypalOrderId = "PAYID-SAMPLE-JP006N",
                paypalCaptureId = "",
                approvalUrl = "https://www.sandbox.paypal.com/checkoutnow?token=PAYID-SAMPLE-JP006N",
                amount = 2646000.0,
                currency = "JPY",
                paymentType = "ADVANCE",
                paymentStatus = "PENDING_APPROVAL",
                verificationDetails = "30% Advance initiated for Yokohama agro shipment [Sample]",
                createdAt = tsSecondsAgo(86400L * 2),
                updatedAt = tsSecondsAgo(86400L * 1)
            )
        )

        // 22 Realistic Operational Activity Events
        val activities = listOf(
            ActivityRecord(
                id = "sample_act_01",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_006",
                eventType = "ORDER_CREATED",
                title = "ORDER-006 Created (Japan • JPY 8,820,000)",
                description = "Cold-Pressed Organic Moringa & Alphonso Mango Pulp for Sakura Shokuhin Co., Ltd. [Sample]",
                createdAt = tsSecondsAgo(3600L * 3)
            ),
            ActivityRecord(
                id = "sample_act_02",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_004",
                eventType = "PAYMENT_APPROVED",
                title = "ORDER-004 Buyer Approved SGD 33,600 Advance",
                description = "LionCity Microelectronics approved PayPal Sandbox checkout PAYID-SAMPLE-SG004R; ready for capture.",
                createdAt = tsSecondsAgo(3600L * 7)
            ),
            ActivityRecord(
                id = "sample_act_03",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_001",
                eventType = "SHIPMENT_DISPATCHED",
                title = "ORDER-001 Vessel Departed Chennai Port -> Hamburg",
                description = "4,500 PCS Organic Cotton Knitwear loaded on container vessel; Certificate of Origin uploaded.",
                createdAt = tsSecondsAgo(3600L * 14)
            ),
            ActivityRecord(
                id = "sample_act_04",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_003",
                eventType = "DOC_REVIEW",
                title = "ORDER-003 Shipping Bill Under Compliance Review",
                description = "Al Noor Foodstuff UAE spice shipment awaiting Bill of Lading & Certificate of Origin.",
                createdAt = tsSecondsAgo(3600L * 20)
            ),
            ActivityRecord(
                id = "sample_act_05",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_002",
                eventType = "PAYMENT_CAPTURED",
                title = "ORDER-002 Full Settlement Captured (USD 85,000)",
                description = "Capture ID CAP-SAMPLE-88412US verified for Midwest AutoSystems Corp. (Detroit, USA).",
                createdAt = tsSecondsAgo(86400L * 2)
            ),
            ActivityRecord(
                id = "sample_act_06",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_005",
                eventType = "ORDER_COMPLETED",
                title = "ORDER-005 Delivered & Closed (GBP 44,200)",
                description = "Thames Heritage Living Ltd UK handicraft export completed with 100% document & payment verification.",
                createdAt = tsSecondsAgo(86400L * 3)
            ),
            ActivityRecord(
                id = "sample_act_07",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_004",
                eventType = "DOCS_READY",
                title = "ORDER-004 All 5 Mandatory Documents Verified",
                description = "100% Document Readiness achieved for Singapore Changi air cargo dispatch.",
                createdAt = tsSecondsAgo(86400L * 4)
            ),
            ActivityRecord(
                id = "sample_act_08",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_001",
                eventType = "PAYMENT_CAPTURED",
                title = "ORDER-001 Advance Captured (EUR 26,640)",
                description = "Capture ID CAP-SAMPLE-99201DE reconciled for RheinTextil Handels GmbH.",
                createdAt = tsSecondsAgo(86400L * 6)
            ),
            ActivityRecord(
                id = "sample_act_09",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_006",
                eventType = "PAYMENT_CAPTURED",
                title = "ORDER-006 Advance Captured (JPY 2,520,000)",
                description = "Capture ID CAP-SAMPLE-55109JP verified for Sakura AgriFoods Trading Co. (Tokyo).",
                createdAt = tsSecondsAgo(86400L * 7)
            ),
            ActivityRecord(
                id = "sample_act_10",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_003",
                eventType = "PAYMENT_CAPTURED",
                title = "ORDER-003 35% Advance Captured (AED 49,980)",
                description = "Capture ID CAP-SAMPLE-77304AE reconciled for Al Noor Foodstuff Trading LLC.",
                createdAt = tsSecondsAgo(86400L * 8)
            ),
            ActivityRecord(
                id = "sample_act_11",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_002",
                eventType = "DOCS_READY",
                title = "ORDER-002 All 5 Mandatory Documents Verified",
                description = "Commercial Invoice, Packing List, BL, Shipping Bill & Certificate of Origin verified for USA shipment.",
                createdAt = tsSecondsAgo(86400L * 9)
            ),
            ActivityRecord(
                id = "sample_act_12",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_005",
                eventType = "PAYMENT_CAPTURED",
                title = "ORDER-005 Full Settlement Captured (GBP 44,200)",
                description = "Capture ID CAP-SAMPLE-66418UK reconciled for Thames Heritage Living Ltd (London).",
                createdAt = tsSecondsAgo(86400L * 10)
            ),
            ActivityRecord(
                id = "sample_act_13",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_004",
                eventType = "FINANCE_ASSESSED",
                title = "ORDER-004 Financial Viability Assessed (21.65% Margin)",
                description = "Deterministic INR settlement calculated at 1 SGD = ₹62.70 for Merlion MicroTech Pte. Ltd.",
                createdAt = tsSecondsAgo(86400L * 11)
            ),
            ActivityRecord(
                id = "sample_act_14",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_001",
                eventType = "FINANCE_ASSESSED",
                title = "ORDER-001 Financial Viability Assessed (20.99% Margin)",
                description = "Deterministic INR settlement calculated at 1 EUR = ₹91.15 for RheinTextil Handels GmbH.",
                createdAt = tsSecondsAgo(86400L * 12)
            ),
            ActivityRecord(
                id = "sample_act_15",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_002",
                eventType = "FINANCE_ASSESSED",
                title = "ORDER-002 Financial Viability Assessed (21.97% Margin)",
                description = "Deterministic INR settlement calculated at 1 USD = ₹84.20 for Midwest AutoSystems Corp.",
                createdAt = tsSecondsAgo(86400L * 13)
            ),
            ActivityRecord(
                id = "sample_act_16",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_003",
                eventType = "FINANCE_ASSESSED",
                title = "ORDER-003 Financial Viability Assessed (21.31% Margin)",
                description = "Deterministic INR settlement calculated at 1 AED = ₹22.93 for Al Noor Foodstuff Trading LLC.",
                createdAt = tsSecondsAgo(86400L * 14)
            ),
            ActivityRecord(
                id = "sample_act_17",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_005",
                eventType = "FINANCE_ASSESSED",
                title = "ORDER-005 Financial Viability Assessed (24.89% Margin)",
                description = "Deterministic INR settlement calculated at 1 GBP = ₹106.80 for Thames Heritage Living Ltd.",
                createdAt = tsSecondsAgo(86400L * 15)
            ),
            ActivityRecord(
                id = "sample_act_18",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_006",
                eventType = "ORDER_CREATED",
                title = "ORDER-006 Created via Gemini AI PO Extraction",
                description = "Sakura AgriFoods Trading Co. (Japan) order for 15,000 KG Alphonso Mango Pulp confirmed.",
                createdAt = tsSecondsAgo(86400L * 16)
            ),
            ActivityRecord(
                id = "sample_act_19",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_004",
                eventType = "ORDER_CREATED",
                title = "ORDER-004 Created via Gemini AI PO Extraction",
                description = "Merlion MicroTech Pte. Ltd. (Singapore) order for 3,000 Industrial Sensor PCBs confirmed.",
                createdAt = tsSecondsAgo(86400L * 18)
            ),
            ActivityRecord(
                id = "sample_act_20",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_003",
                eventType = "ORDER_CREATED",
                title = "ORDER-003 Created via Manual Intake",
                description = "Al Noor Foodstuff Trading LLC (UAE) order for 8,000 KG Malabar Black Pepper & Cardamom registered.",
                createdAt = tsSecondsAgo(86400L * 20)
            ),
            ActivityRecord(
                id = "sample_act_21",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_001",
                eventType = "ORDER_CREATED",
                title = "ORDER-001 Created via Gemini AI PO Extraction",
                description = "RheinTextil Handels GmbH (Germany) order for 4,500 PCS Organic Cotton Knitwear confirmed.",
                createdAt = tsSecondsAgo(86400L * 22)
            ),
            ActivityRecord(
                id = "sample_act_22",
                userId = SAMPLE_USER_ID,
                exportOrderId = "sample_ord_002",
                eventType = "ORDER_CREATED",
                title = "ORDER-002 Created via Gemini AI PO Extraction",
                description = "Midwest AutoSystems Corp. (USA) order for 2,500 CNC Machined Stainless Flanges confirmed.",
                createdAt = tsSecondsAgo(86400L * 25)
            )
        )

        return SampleWorkspaceSeedBundle(
            profile = profile,
            orders = orders,
            assessments = assessments,
            documents = documents,
            payments = payments,
            activities = activities
        )
    }
}
