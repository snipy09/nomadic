package app.nomadic.applybrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.util.Log;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Fills all 22 form-bench fixtures in a real Android WebView through ApplyBrowserController:
 * the agent is injected at document start into every frame (including a cross-origin iframe),
 * pages are served with a CSP that blocks eval, and the host engine is the app's TypeScript.
 * Passes only with every field correct, nothing auto-submitted, the login wall reported, and a
 * reviewed submission that reaches the page.
 */
@RunWith(AndroidJUnit4.class)
public class AgentFixturesTest {

    private static final String CSP = "script-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'";

    @Test
    public void fillsEveryFixtureLikeTheDesktopBench() throws Exception {
        assertTrue("WebView lacks DOCUMENT_START_SCRIPT / WEB_MESSAGE_LISTENER", ApplyBrowserController.isSupported());
        Context ctx = InstrumentationRegistry.getInstrumentation().getContext();
        try (
            FixtureServer a = new FixtureServer(ctx.getAssets(), "www", CSP);
            FixtureServer b = new FixtureServer(ctx.getAssets(), "www", CSP);
            ActivityScenario<TestHostActivity> scenario = ActivityScenario.launch(TestHostActivity.class)
        ) {
            // 127.0.0.1 vs localhost: two origins, so the iframe fixture is cross-origin like on a real career site.
            String originB = "http://localhost:" + b.port();
            a.setOriginB(originB);
            b.setOriginB(originB);

            CountDownLatch done = new CountDownLatch(1);
            AtomicReference<String> result = new AtomicReference<>();
            scenario.onActivity(activity ->
                activity.startHarness("http://127.0.0.1:" + a.port() + "/_harness/index.html", json -> {
                    result.set(json);
                    done.countDown();
                })
            );
            assertTrue("harness did not finish in 15 minutes", done.await(15, TimeUnit.MINUTES));

            String json = result.get();
            writeReport(json);
            JSONObject out = new JSONObject(json);
            assertFalse("harness crashed: " + out.optString("fatal"), out.has("fatal"));

            JSONObject s = out.getJSONObject("summary");
            Log.i(TestHostActivity.TAG, "SUMMARY " + s);
            Log.i(TestHostActivity.TAG, "REVIEW " + out.getJSONObject("review"));
            assertEquals("forms", 22, s.getInt("forms"));
            assertEquals("wrong answers", 0, s.getInt("wrong"));
            assertEquals("correct fields (of " + s.getInt("fields") + "): " + s, s.getInt("fields"), s.getInt("correct"));
            assertEquals("forms submitted without review", 0, s.getInt("submitClicked"));
            assertEquals("walls reported", s.getInt("wallsExpected"), s.getInt("wallsDetected"));

            JSONObject review = out.getJSONObject("review");
            assertTrue("reviewed submission flow failed: " + review, review.getBoolean("ok"));
        }
    }

    private static void writeReport(String json) {
        try {
            Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
            File dir = target.getExternalFilesDir(null);
            if (dir == null) return;
            try (FileOutputStream f = new FileOutputStream(new File(dir, "agent-report.json"))) {
                f.write(json.getBytes(StandardCharsets.UTF_8));
            }
            Log.i(TestHostActivity.TAG, "report written to " + new File(dir, "agent-report.json"));
        } catch (Exception e) {
            Log.w(TestHostActivity.TAG, "could not write report", e);
        }
    }
}
