package com.example.service

import android.util.Base64
import com.example.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.FormBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import java.util.UUID
import java.util.concurrent.TimeUnit

data class PayPalOrderResponse(
    val paypalOrderId: String,
    val status: String,
    val approvalUrl: String,
    val rawSummary: String
)

data class PayPalCaptureResponse(
    val paypalOrderId: String,
    val captureId: String,
    val status: String,
    val capturedAmount: Double,
    val capturedCurrency: String,
    val payerEmail: String,
    val verificationSummary: String
)

/**
 * Real PayPal Sandbox REST API v2 Service (`https://api-m.sandbox.paypal.com`).
 * Uses BuildConfig.PAYPAL_SANDBOX_CLIENT_ID and BuildConfig.PAYPAL_SANDBOX_CLIENT_SECRET
 * injected via the AI Studio Secrets Panel (.env / .env.example).
 * Never fabricates payment success.
 */
class PayPalSandboxService(
    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(25, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .build()
) {
    private val baseUrl = "https://api-m.sandbox.paypal.com"

    fun isConfigured(): Boolean {
        val clientId = BuildConfig.PAYPAL_SANDBOX_CLIENT_ID
        val secret = BuildConfig.PAYPAL_SANDBOX_CLIENT_SECRET
        return clientId.isNotBlank() &&
                secret.isNotBlank() &&
                clientId != "YOUR_PAYPAL_SANDBOX_CLIENT_ID" &&
                secret != "YOUR_PAYPAL_SANDBOX_CLIENT_SECRET"
    }

    private suspend fun fetchAccessToken(): String = withContext(Dispatchers.IO) {
        if (!isConfigured()) {
            throw IllegalStateException(
                "PayPal Sandbox credentials are not configured. Please set PAYPAL_SANDBOX_CLIENT_ID and PAYPAL_SANDBOX_CLIENT_SECRET in the AI Studio Secrets panel."
            )
        }
        val clientId = BuildConfig.PAYPAL_SANDBOX_CLIENT_ID.trim()
        val secret = BuildConfig.PAYPAL_SANDBOX_CLIENT_SECRET.trim()
        val basicAuth = Base64.encodeToString(
            "$clientId:$secret".toByteArray(Charsets.UTF_8),
            Base64.NO_WRAP
        )

        val formBody = FormBody.Builder()
            .add("grant_type", "client_credentials")
            .build()

        val request = Request.Builder()
            .url("$baseUrl/v1/oauth2/token")
            .header("Authorization", "Basic $basicAuth")
            .header("Accept", "application/json")
            .post(formBody)
            .build()

        httpClient.newCall(request).execute().use { response ->
            val bodyStr = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw IllegalStateException("PayPal Sandbox OAuth failed (HTTP ${response.code}): $bodyStr")
            }
            val json = JSONObject(bodyStr)
            json.getString("access_token")
        }
    }

    /**
     * Verifies PayPal Sandbox OAuth 2.0 authentication against /v1/oauth2/token
     * without ever logging, returning, or exposing client secrets or raw tokens.
     */
    suspend fun verifySandboxOAuthConnection(): Result<String> = withContext(Dispatchers.IO) {
        try {
            if (!isConfigured()) {
                return@withContext Result.failure(
                    IllegalStateException(
                        "FAIL: PAYPAL_SANDBOX_CLIENT_ID and PAYPAL_SANDBOX_CLIENT_SECRET are set to default placeholders. Configure valid Sandbox credentials in the AI Studio Secrets panel."
                    )
                )
            }
            val token = fetchAccessToken()
            if (token.isNotBlank()) {
                Result.success("PASS: Authenticated with https://api-m.sandbox.paypal.com/v1/oauth2/token (Bearer token verified, secret protected).")
            } else {
                Result.failure(IllegalStateException("FAIL: OAuth 2.0 response returned an empty access_token."))
            }
        } catch (e: Exception) {
            Result.failure(IllegalStateException("FAIL: ${e.localizedMessage ?: "OAuth 2.0 verification failed"}"))
        }
    }

    /**
     * Creates a real PayPal Sandbox order via POST /v2/checkout/orders.
     */
    suspend fun createSandboxOrder(
        exportOrderNumber: String,
        amount: Double,
        currency: String,
        description: String
    ): Result<PayPalOrderResponse> = withContext(Dispatchers.IO) {
        try {
            require(amount > 0.0) { "Payable amount must be greater than zero." }
            val supportedCurrencies = setOf("USD", "EUR", "GBP", "AUD", "CAD", "SGD", "JPY")
            val normalizedCurrency = currency.uppercase(Locale.US).trim()
            require(normalizedCurrency in supportedCurrencies) {
                "Currency $normalizedCurrency is not directly supported by PayPal Sandbox checkout. Use USD, EUR, GBP, AUD, CAD, SGD, or JPY."
            }

            val token = fetchAccessToken()
            val formattedAmount = String.format(Locale.US, "%.2f", amount)

            val purchaseUnit = JSONObject().apply {
                put("reference_id", exportOrderNumber)
                put("description", description.take(120))
                put("amount", JSONObject().apply {
                    put("currency_code", normalizedCurrency)
                    put("value", formattedAmount)
                })
            }

            val requestJson = JSONObject().apply {
                put("intent", "CAPTURE")
                put("purchase_units", JSONArray().put(purchaseUnit))
                put("application_context", JSONObject().apply {
                    put("brand_name", "NiryatFlow AI Export OS")
                    put("user_action", "PAY_NOW")
                    put("return_url", "https://example.com/niryatflow/paypal/return")
                    put("cancel_url", "https://example.com/niryatflow/paypal/cancel")
                })
            }

            val idempotencyKey = "nf-create-$exportOrderNumber-${UUID.randomUUID()}"
            val request = Request.Builder()
                .url("$baseUrl/v2/checkout/orders")
                .header("Authorization", "Bearer $token")
                .header("Content-Type", "application/json")
                .header("PayPal-Request-Id", idempotencyKey)
                .post(requestJson.toString().toRequestBody("application/json".toMediaType()))
                .build()

            httpClient.newCall(request).execute().use { response ->
                val bodyStr = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    return@withContext Result.failure(
                        IllegalStateException("PayPal Create Order failed (HTTP ${response.code}): $bodyStr")
                    )
                }
                val json = JSONObject(bodyStr)
                val orderId = json.getString("id")
                val status = json.optString("status", "CREATED")
                var approvalUrl = ""
                val links = json.optJSONArray("links")
                if (links != null) {
                    for (i in 0 until links.length()) {
                        val linkObj = links.getJSONObject(i)
                        if (linkObj.optString("rel") == "approve" || linkObj.optString("rel") == "payer-action") {
                            approvalUrl = linkObj.optString("href")
                            break
                        }
                    }
                }
                Result.success(
                    PayPalOrderResponse(
                        paypalOrderId = orderId,
                        status = status,
                        approvalUrl = approvalUrl,
                        rawSummary = "Sandbox Order $orderId ($status) for $normalizedCurrency $formattedAmount"
                    )
                )
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Retrieves actual order status from GET /v2/checkout/orders/{id} for reconciliation.
     */
    suspend fun getSandboxOrderStatus(paypalOrderId: String): Result<PayPalCaptureResponse> = withContext(Dispatchers.IO) {
        try {
            require(paypalOrderId.isNotBlank()) { "PayPal Order ID is required." }
            val token = fetchAccessToken()
            val request = Request.Builder()
                .url("$baseUrl/v2/checkout/orders/${paypalOrderId.trim()}")
                .header("Authorization", "Bearer $token")
                .header("Accept", "application/json")
                .get()
                .build()

            httpClient.newCall(request).execute().use { response ->
                val bodyStr = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    return@withContext Result.failure(
                        IllegalStateException("PayPal Get Order failed (HTTP ${response.code}): $bodyStr")
                    )
                }
                val json = JSONObject(bodyStr)
                Result.success(parseOrderOrCaptureJson(json))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Captures an approved PayPal Sandbox order via POST /v2/checkout/orders/{id}/capture.
     * Validates the capture response before marking payment as CAPTURED.
     */
    suspend fun captureSandboxOrder(paypalOrderId: String): Result<PayPalCaptureResponse> = withContext(Dispatchers.IO) {
        try {
            require(paypalOrderId.isNotBlank()) { "PayPal Order ID is required to capture payment." }
            val token = fetchAccessToken()
            val idempotencyKey = "nf-capture-${paypalOrderId.trim()}"

            val request = Request.Builder()
                .url("$baseUrl/v2/checkout/orders/${paypalOrderId.trim()}/capture")
                .header("Authorization", "Bearer $token")
                .header("Content-Type", "application/json")
                .header("PayPal-Request-Id", idempotencyKey)
                .post("{}".toRequestBody("application/json".toMediaType()))
                .build()

            httpClient.newCall(request).execute().use { response ->
                val bodyStr = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    return@withContext Result.failure(
                        IllegalStateException("PayPal Capture failed (HTTP ${response.code}): $bodyStr")
                    )
                }
                val json = JSONObject(bodyStr)
                val parsed = parseOrderOrCaptureJson(json)
                if (parsed.status != "COMPLETED" || parsed.captureId.isBlank()) {
                    return@withContext Result.failure(
                        IllegalStateException("PayPal order status is '${parsed.status}' without a completed capture ID.")
                    )
                }
                Result.success(parsed)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun parseOrderOrCaptureJson(json: JSONObject): PayPalCaptureResponse {
        val orderId = json.optString("id", "")
        val status = json.optString("status", "UNKNOWN")
        val payerEmail = json.optJSONObject("payer")?.optString("email_address", "").orEmpty()

        var captureId = ""
        var capturedAmount = 0.0
        var capturedCurrency = "USD"

        val purchaseUnits = json.optJSONArray("purchase_units")
        if (purchaseUnits != null && purchaseUnits.length() > 0) {
            val firstUnit = purchaseUnits.getJSONObject(0)
            val amountObj = firstUnit.optJSONObject("amount")
            if (amountObj != null) {
                capturedAmount = amountObj.optString("value", "0.0").toDoubleOrNull() ?: 0.0
                capturedCurrency = amountObj.optString("currency_code", "USD")
            }
            val captures = firstUnit.optJSONObject("payments")?.optJSONArray("captures")
            if (captures != null && captures.length() > 0) {
                val firstCapture = captures.getJSONObject(0)
                captureId = firstCapture.optString("id", "")
                val capAmtObj = firstCapture.optJSONObject("amount")
                if (capAmtObj != null) {
                    capturedAmount = capAmtObj.optString("value", "$capturedAmount").toDoubleOrNull() ?: capturedAmount
                    capturedCurrency = capAmtObj.optString("currency_code", capturedCurrency)
                }
            }
        }

        val summary = buildString {
            append("PayPal Order $orderId [$status]")
            if (captureId.isNotBlank()) append(" • Capture ID: $captureId")
            if (capturedAmount > 0.0) append(" • Verified $capturedCurrency $capturedAmount")
            if (payerEmail.isNotBlank()) append(" • Buyer: $payerEmail")
        }

        return PayPalCaptureResponse(
            paypalOrderId = orderId,
            captureId = captureId,
            status = status,
            capturedAmount = capturedAmount,
            capturedCurrency = capturedCurrency,
            payerEmail = payerEmail,
            verificationSummary = summary
        )
    }
}
