package app.nomadic.applybrowser;

import android.annotation.SuppressLint;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import androidx.appcompat.app.AppCompatActivity;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;
import org.json.JSONObject;

/**
 * Stands in for the Capacitor app in the instrumentation test: a host WebView runs the app's
 * engine code (harness.js) and reaches the real ApplyBrowserController through the
 * AndroidHarness JS interface, the way the Capacitor bridge reaches ApplyBrowserPlugin.
 */
public class TestHostActivity extends AppCompatActivity implements ApplyBrowserController.Listener {

    static final String TAG = "NomadicAgentTest";

    private final Handler main = new Handler(Looper.getMainLooper());
    private WebView host;
    private ApplyBrowserController controller;
    private volatile Consumer<String> onDone;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        FrameLayout root = new FrameLayout(this);
        host = new WebView(this);
        root.addView(host, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        controller = new ApplyBrowserController(this, this);
    }

    @SuppressLint({ "SetJavaScriptEnabled", "AddJavascriptInterface" })
    void startHarness(String url, Consumer<String> done) {
        onDone = done;
        host.getSettings().setJavaScriptEnabled(true);
        host.setWebViewClient(new WebViewClient());
        host.setWebChromeClient(
            new android.webkit.WebChromeClient() {
                @Override
                public boolean onConsoleMessage(android.webkit.ConsoleMessage m) {
                    Log.i(TAG, "host console " + m.messageLevel() + ": " + m.message() + " (" + m.sourceId() + ":" + m.lineNumber() + ")");
                    return true;
                }
            }
        );
        host.addJavascriptInterface(new HarnessBridge(), "AndroidHarness");
        host.loadUrl(url);
    }

    @Override
    protected void onDestroy() {
        controller.dispose();
        host.destroy();
        super.onDestroy();
    }

    // ── controller -> host JS (what notifyListeners does for the Capacitor app) ──

    private void toHost(String data) {
        host.evaluateJavascript("window.__nomadicHarness && window.__nomadicHarness.receive(" + JSONObject.quote(data) + ")", null);
    }

    @Override
    public void onMessage(String data) {
        toHost(data);
    }

    @Override
    public void onNavigation(String url, boolean loading) {}

    @Override
    public void onBlocked(String reason, String url) {
        Log.w(TAG, "blocked " + reason + " " + url);
    }

    @Override
    public void onHidden() {}

    @Override
    public void onClosed(String reason) {
        Log.w(TAG, "apply WebView closed: " + reason);
    }

    // ── host JS -> controller (what the Capacitor plugin methods do) ──

    private final class HarnessBridge {

        @JavascriptInterface
        public void open(String url, String agentScript) {
            main.post(() -> {
                try {
                    controller.open(url, agentScript, "Test");
                } catch (RuntimeException e) {
                    Log.e(TAG, "open failed", e);
                }
            });
        }

        /** Runs on the JavaBridge thread; waits for the UI thread so the caller learns if the frame is gone. */
        @JavascriptInterface
        public boolean post(String frameId, String data) {
            AtomicBoolean ok = new AtomicBoolean(false);
            CountDownLatch latch = new CountDownLatch(1);
            main.post(() -> {
                try {
                    controller.post(frameId, data);
                    ok.set(true);
                } catch (RuntimeException e) {
                    ok.set(false);
                } finally {
                    latch.countDown();
                }
            });
            try {
                latch.await(10, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return ok.get();
        }

        @JavascriptInterface
        public void close() {
            main.post(() -> controller.close());
        }

        @JavascriptInterface
        public void log(String message) {
            Log.i(TAG, message);
        }

        @JavascriptInterface
        public void done(String json) {
            Consumer<String> d = onDone;
            if (d != null) d.accept(json);
        }
    }
}
