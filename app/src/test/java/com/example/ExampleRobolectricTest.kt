package com.example

import android.content.Context
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.example.ui.components.AppBottomNavigation
import com.example.ui.components.CinematicLaunchScreen
import com.example.ui.components.PrimaryNavTab
import com.example.ui.theme.MyApplicationTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class ExampleRobolectricTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `read string from context`() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val appName = context.getString(R.string.app_name)
        assertEquals("NiryatFlow AI", appName)
    }

    @Test
    fun `tapping launch screen NiryatFlow AI emblem opens Sample Business Workspace`() {
        var enteredSampleWorkspace = false

        composeTestRule.setContent {
            MyApplicationTheme {
                CinematicLaunchScreen(
                    onLaunchComplete = {},
                    onEnterSampleWorkspace = { enteredSampleWorkspace = true }
                )
            }
        }

        composeTestRule.onNodeWithTag("niryat_emblem_sample_entry").assertIsDisplayed()
        composeTestRule.onNodeWithText("Explore Sample Business").assertIsDisplayed()
        composeTestRule.onNodeWithTag("niryat_emblem_sample_entry").performClick()

        composeTestRule.mainClock.advanceTimeBy(250L)
        composeTestRule.waitForIdle()
        assertTrue(enteredSampleWorkspace)
    }

    @Test
    fun `AppBottomNavigation navigates across all five modules`() {
        val tabs = listOf(
            PrimaryNavTab("dashboard", "Home", Icons.Default.Home),
            PrimaryNavTab("orders", "Orders", Icons.Default.Inventory2),
            PrimaryNavTab("financial_intelligence", "Finance", Icons.Default.AccountBalance),
            PrimaryNavTab("document_centre", "Documents", Icons.Default.Description),
            PrimaryNavTab("more", "More", Icons.Default.MoreHoriz)
        )
        var currentRoute by mutableStateOf("dashboard")

        composeTestRule.setContent {
            MyApplicationTheme {
                AppBottomNavigation(
                    tabs = tabs,
                    activeTabRoute = currentRoute,
                    onSelectTab = { currentRoute = it }
                )
            }
        }

        composeTestRule.onNodeWithTag("nav_orders").performClick()
        assertEquals("orders", currentRoute)

        composeTestRule.onNodeWithTag("nav_financial_intelligence").performClick()
        assertEquals("financial_intelligence", currentRoute)

        composeTestRule.onNodeWithTag("nav_document_centre").performClick()
        assertEquals("document_centre", currentRoute)

        composeTestRule.onNodeWithTag("nav_more").performClick()
        assertEquals("more", currentRoute)

        composeTestRule.onNodeWithTag("nav_dashboard").performClick()
        assertEquals("dashboard", currentRoute)
    }
}
