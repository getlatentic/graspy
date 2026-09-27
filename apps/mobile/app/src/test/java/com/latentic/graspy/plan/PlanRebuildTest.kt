package com.latentic.graspy.plan

import android.app.Application
import com.latentic.graspy.lesson.PLAN
import com.latentic.graspy.mcp.FakeGraspyServer
import com.latentic.graspy.settleMain
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Before
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/**
 * A rebuilt plan appears once its first lesson is ready, as on the web: until then Home shows it being made, and
 * a lesson that fails or a server out of reach leaves the learner the plan they had, with a way to try again.
 */
@RunWith(RobolectricTestRunner::class)
class PlanRebuildTest {
    private val server = RebuildServer()
    private val application: Application = RuntimeEnvironment.getApplication()
    private lateinit var plans: PlanViewModel

    @Before
    fun open() {
        plans = PlanViewModel(application, "uid-1/aaaaaaaaaaaa", server.calls)
        settleMain { plans.state.value is PlanState.Ready }
    }

    @After
    fun close() {
        server.lessonHeld.countDown()
        server.web.shutdown()
    }

    @Test
    fun `the rebuilt plan is shown and kept only once its first lesson is ready, set to start there`() {
        server.holdLesson()

        assertTrue(plans.rebuild())
        settleMain { server.lessonAsked.count == 0L }

        assertEquals(PLAN.planId, plans.plan?.planId)
        assertTrue(server.kept.isEmpty())
        assertEquals(listOf("Mathematics"), plans.makingState.value?.plan?.subjects?.map { it.name })

        server.lessonHeld.countDown()
        settleMain { plans.makingState.value == null }

        val rebuilt = requireNotNull(plans.plan)
        assertEquals(LearningSession("Mathematics", "Ratios", 0, "explanation"), rebuilt.activeSession)
        assertEquals(listOf("Ratios", "Percentages"), rebuilt.topicsOf("mathematics"))
        assertEquals(rebuilt.planId, server.kept.single().planId)
        assertEquals(rebuilt.planId, server.lessonPlanId)
        assertEquals(rebuilt.activeSession, server.kept.single().activeSession)
    }

    @Test
    fun `a first lesson that fails keeps the plan the learner had, and trying again rebuilds it`() {
        server.lessonFails = true

        plans.rebuild()
        settleMain { plans.makingState.value?.failed == true }

        assertEquals(PLAN.planId, plans.plan?.planId)
        assertNull(plans.plan?.activeSession)
        assertTrue(server.kept.isEmpty())

        server.lessonFails = false
        plans.retryMaking()
        settleMain { plans.makingState.value == null }

        assertEquals("Ratios", plans.plan?.activeSession?.topic)
        assertEquals(1, server.kept.size)
    }

    @Test
    fun `out of reach while the first lesson is made, the plan the learner had stays`() {
        server.lessonUnreachable = true

        plans.rebuild()
        settleMain { plans.makingState.value?.failed == true }

        assertEquals(PLAN.planId, plans.plan?.planId)
        assertNull(plans.plan?.activeSession)
        assertTrue(server.kept.isEmpty())
        assertNotNull(plans.makingState.value?.plan)
    }
}

/**
 * graspy's server for a rebuild: the plan and lessons of [FakeGraspyServer], a curriculum stream with new
 * topics, the plans it is sent to keep, and a first lesson that can be held, fail or be out of reach.
 */
private class RebuildServer : Dispatcher() {
    private val base = FakeGraspyServer(PLAN, LearnerRecord())
    val kept: MutableList<LearnerPlan> = CopyOnWriteArrayList()
    val lessonAsked = CountDownLatch(1)
    var lessonHeld = CountDownLatch(0)
    @Volatile var lessonFails = false
    @Volatile var lessonUnreachable = false
    @Volatile var lessonPlanId: String? = null
    val web = MockWebServer().also { it.dispatcher = this }

    val calls: Call.Factory = OkHttpClient().let { client ->
        Call.Factory { request ->
            client.newCall(request.newBuilder().url(request.url.newBuilder().scheme("http").host(web.hostName).port(web.port).build()).build())
        }
    }

    fun holdLesson() {
        lessonHeld = CountDownLatch(1)
    }

    override fun dispatch(request: RecordedRequest): MockResponse {
        val path = request.requestUrl?.encodedPath.orEmpty()
        return when {
            path == "/api/curriculum/generate-stream" -> stream()
            path == "/api/learner/curriculum" && request.method == "PUT" -> keep(request)
            path == "/api/learner/plan" -> json("{}")
            path == "/mcp" && lessonTarget(request) != null -> lesson(request)
            else -> base.dispatch(request)
        }
    }

    private fun stream() = MockResponse().setHeader("Content-Type", "text/event-stream").setBody(
        """
        data: {"type":"result","subjects":["Mathematics"]}

        data: {"type":"result","topics":{"mathematics":["Ratios","Percentages"]}}

        data: [DONE]

        """.trimIndent(),
    )

    private fun keep(request: RecordedRequest): MockResponse {
        val plan = LearnerPlan.of(planJson.parseToJsonElement(request.body.readUtf8()).jsonObject)
        kept += plan
        return json("""{"plan":${plan.toJson()}}""")
    }

    private fun lesson(request: RecordedRequest): MockResponse {
        lessonPlanId = lessonTarget(request)?.get("planId")?.jsonPrimitive?.content
        lessonAsked.countDown()
        lessonHeld.await(5, TimeUnit.SECONDS)
        return when {
            lessonUnreachable -> MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START)
            lessonFails -> MockResponse().setResponseCode(503)
            else -> base.dispatch(request)
        }
    }

    /** The lesson a tool call asks for, if it asks for one. */
    private fun lessonTarget(request: RecordedRequest): JsonObject? {
        val body = runCatching { planJson.parseToJsonElement(request.body.clone().readUtf8()).jsonObject }.getOrNull() ?: return null
        return body["params"]?.jsonObject?.get("arguments")?.jsonObject?.get("target")?.jsonObject
    }

    private fun json(body: String) = MockResponse().setHeader("Content-Type", "application/json").setBody(body)
}
