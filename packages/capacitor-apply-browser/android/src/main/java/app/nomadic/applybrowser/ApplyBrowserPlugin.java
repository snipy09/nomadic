package app.nomadic.applybrowser;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor bridge for {@link ApplyBrowserController}. JS API: packages/capacitor-apply-browser/src/definitions.ts.
 * Every method runs on the main thread; agent messages go to JS as "message" events.
 */
@CapacitorPlugin(name = "ApplyBrowser")
public class ApplyBrowserPlugin extends Plugin implements ApplyBrowserController.Listener {

    private ApplyBrowserController controller;

    private ApplyBrowserController controller() {
        if (controller == null) controller = new ApplyBrowserController(getActivity(), this);
        return controller;
    }

    private void onMain(PluginCall call, Runnable action) {
        getActivity()
            .runOnUiThread(() -> {
                try {
                    action.run();
                } catch (Exception e) {
                    call.reject(e.getMessage() == null ? e.toString() : e.getMessage());
                }
            });
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        boolean ok = ApplyBrowserController.isSupported();
        JSObject res = new JSObject();
        res.put("supported", ok);
        String version = ApplyBrowserController.webViewVersion(getContext());
        if (version != null) res.put("webViewVersion", version);
        if (!ok) res.put("reason", "Update \"Android System WebView\" from the Play Store, then try again.");
        call.resolve(res);
    }

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        String script = call.getString("agentScript");
        if (url == null || script == null || script.isEmpty()) {
            call.reject("url and agentScript are required");
            return;
        }
        String title = call.getString("title");
        onMain(call, () -> {
            controller().open(url, script, title);
            call.resolve();
        });
    }

    @PluginMethod
    public void postMessage(PluginCall call) {
        String frameId = call.getString("frameId");
        String data = call.getString("data");
        if (frameId == null || data == null) {
            call.reject("frameId and data are required");
            return;
        }
        onMain(call, () -> {
            if (controller == null || !controller.isOpen()) throw new IllegalStateException("The apply page is not open.");
            controller.post(frameId, data);
            call.resolve();
        });
    }

    @PluginMethod
    public void show(PluginCall call) {
        onMain(call, () -> {
            if (controller != null) controller.show();
            call.resolve();
        });
    }

    @PluginMethod
    public void hide(PluginCall call) {
        onMain(call, () -> {
            if (controller != null) controller.hide(false);
            call.resolve();
        });
    }

    @PluginMethod
    public void close(PluginCall call) {
        onMain(call, () -> {
            if (controller != null) controller.close();
            call.resolve();
        });
    }

    // ── controller events -> JS ──────────────────────────────────────────────

    @Override
    public void onMessage(String data) {
        JSObject e = new JSObject();
        e.put("data", data);
        notifyListeners("message", e);
    }

    @Override
    public void onNavigation(String url, boolean loading) {
        JSObject e = new JSObject();
        e.put("url", url);
        e.put("loading", loading);
        notifyListeners("navigation", e);
    }

    @Override
    public void onBlocked(String reason, String url) {
        JSObject e = new JSObject();
        e.put("reason", reason);
        e.put("url", url);
        notifyListeners("blocked", e);
    }

    @Override
    public void onHidden() {
        notifyListeners("hidden", new JSObject());
    }

    @Override
    public void onClosed(String reason) {
        JSObject e = new JSObject();
        e.put("reason", reason);
        notifyListeners("closed", e);
    }

    // ── lifecycle ────────────────────────────────────────────────────────────

    @Override
    protected void handleOnPause() {
        if (controller != null) controller.onPause();
    }

    @Override
    protected void handleOnResume() {
        if (controller != null) controller.onResume();
    }

    @Override
    protected void handleOnDestroy() {
        if (controller != null) {
            controller.dispose();
            controller = null;
        }
    }
}
