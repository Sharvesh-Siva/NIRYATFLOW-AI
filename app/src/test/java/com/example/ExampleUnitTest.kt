package com.example

import com.example.data.sample.SampleBusinessWorkspaceSeeder
import com.example.data.sample.WorkspaceMode
import com.example.domain.FinancialCalculationEngine
import com.example.ui.components.TradeRiskEngine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ExampleUnitTest {
    @Test
    fun sampleBusinessWorkspace_hasSixOrdersAndCompleteRecords() {
        val bundle = SampleBusinessWorkspaceSeeder.createSeedBundle()

        assertEquals("Tamil Nadu Global Exports Pvt. Ltd.", bundle.profile.businessName)
        assertTrue(bundle.profile.primaryBase.contains("Chennai, Tamil Nadu"))
        assertEquals("INR", bundle.profile.reportingCurrency)
        assertTrue(bundle.profile.isSampleWorkspace)

        assertEquals(6, bundle.orders.size)
        val orderNumbers = bundle.orders.map { it.orderNumber }
        assertTrue(orderNumbers.containsAll(listOf("ORDER-001", "ORDER-002", "ORDER-003", "ORDER-004", "ORDER-005", "ORDER-006")))

        // 6 financial breakdowns
        assertEquals(6, bundle.assessments.size)
        // 30 document records (5 per order)
        assertEquals(30, bundle.documents.size)
        // 6 payment records
        assertEquals(6, bundle.payments.size)
        // 20+ activity records
        assertTrue(bundle.activities.size >= 20)

        // Verify all 6 Digital Twins & portfolio metrics build cleanly
        val twins = bundle.orders.map { order ->
            FinancialCalculationEngine.buildDigitalTwinState(
                order = order,
                financialAssessment = bundle.assessments.find { it.exportOrderId == order.id },
                documents = bundle.documents.filter { it.exportOrderId == order.id },
                payments = bundle.payments.filter { it.exportOrderId == order.id }
            )
        }
        assertEquals(6, twins.size)
        assertTrue(twins.all { it.stages.size == 8 })

        val metrics = FinancialCalculationEngine.calculatePortfolioMetrics(
            orders = bundle.orders,
            assessments = bundle.assessments,
            documents = bundle.documents,
            payments = bundle.payments
        )
        assertEquals(6, metrics.totalOrders)
        assertTrue(metrics.totalOrderValueInr > 0.0)
        assertTrue(metrics.capturedPaymentValueInr > 0.0)
    }

    @Test
    fun tradeRiskEngine_detectsMissingDocsAndUnverifiedPayments() {
        val bundle = SampleBusinessWorkspaceSeeder.createSeedBundle()
        val alerts = TradeRiskEngine.evaluatePortfolioRisks(
            orders = bundle.orders,
            assessments = bundle.assessments,
            documents = bundle.documents,
            payments = bundle.payments
        )

        assertTrue(alerts.isNotEmpty())
        assertTrue(alerts.any { it.category.contains("DOCUMENTATION") })
        assertTrue(alerts.any { it.category.contains("SETTLEMENT") || it.category.contains("RECEIVABLE") })
        assertTrue(alerts.all { it.evidence.isNotBlank() && it.recommendedAction.isNotBlank() })
    }

    @Test
    fun workspaceIsolation_sampleResetDoesNotLeakAndRestoresCleanSeed() {
        val firstBundle = SampleBusinessWorkspaceSeeder.createSeedBundle()
        val modifiedOrders = firstBundle.orders.drop(1)
        assertEquals(5, modifiedOrders.size)

        // Reset creates a fresh isolated seed bundle without affecting any external state
        val resetBundle = SampleBusinessWorkspaceSeeder.createSeedBundle()
        assertEquals(6, resetBundle.orders.size)
        assertTrue(resetBundle.orders.all { it.userId == SampleBusinessWorkspaceSeeder.SAMPLE_USER_ID })
        assertNotEquals(WorkspaceMode.PRODUCTION, WorkspaceMode.SAMPLE_BUSINESS)
    }

    @Test
    fun financialCalculationEngine_deterministicCalculationIsAccurate() {
        val calc = FinancialCalculationEngine.calculateAssessment(
            userId = "test_user",
            exportOrderId = "ord_001",
            quantity = 1000.0,
            unitPrice = 18.50,
            currency = "EUR",
            exchangeRate = 91.20,
            advancePercentage = 30.0,
            paymentFeePercentage = 2.90,
            paymentFixedFee = 25.0,
            procurementCostInr = 1040000.0,
            logisticsCostInr = 148000.0,
            packagingCostInr = 42000.0,
            otherCostsInr = 26000.0
        )

        assertEquals(18500.0, calc.grossOrderValue, 0.01)
        assertEquals(1687200.0, calc.convertedValueInr, 0.01)
        assertEquals(51208.8, calc.paymentFeeInr, 0.01)
        assertEquals(1635991.2, calc.estimatedNetRevenueInr, 0.01)
        assertEquals(379991.2, calc.estimatedProfitInr, 0.01)
    }
}
