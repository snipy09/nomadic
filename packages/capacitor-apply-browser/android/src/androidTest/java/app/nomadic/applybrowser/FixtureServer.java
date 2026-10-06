package app.nomadic.applybrowser;

import android.content.res.AssetManager;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

/**
 * Minimal static HTTP server for the instrumentation test, the Android twin of
 * packages/form-bench/src/server.ts: serves the generated "www" assets, replaces
 * {{ORIGIN_B}} in HTML (the second origin, for cross-origin iframes) and sends the CSP.
 */
final class FixtureServer implements AutoCloseable {

    private final AssetManager assets;
    private final String root;
    private final String csp;
    private final ServerSocket socket;
    private volatile String originB = "";
    private volatile boolean running = true;

    FixtureServer(AssetManager assets, String root, String csp) throws IOException {
        this.assets = assets;
        this.root = root;
        this.csp = csp;
        this.socket = new ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"));
        Thread t = new Thread(this::acceptLoop, "fixture-server-" + socket.getLocalPort());
        t.setDaemon(true);
        t.start();
    }

    int port() {
        return socket.getLocalPort();
    }

    void setOriginB(String origin) {
        this.originB = origin;
    }

    private void acceptLoop() {
        while (running) {
            try {
                Socket s = socket.accept();
                Thread t = new Thread(() -> handle(s), "fixture-conn");
                t.setDaemon(true);
                t.start();
            } catch (IOException e) {
                if (!running) return;
            }
        }
    }

    private void handle(Socket s) {
        try (Socket conn = s) {
            BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.ISO_8859_1));
            String line = in.readLine();
            if (line == null) return;
            String header;
            while ((header = in.readLine()) != null && !header.isEmpty()) {
                // headers are not needed
            }
            String[] parts = line.split(" ");
            String target = parts.length > 1 ? parts[1] : "/";
            int q = target.indexOf('?');
            if (q >= 0) target = target.substring(0, q);
            String path = URLDecoder.decode(target, "UTF-8");
            if (path.contains("..")) {
                send(conn.getOutputStream(), 404, "text/plain", "Not found".getBytes(StandardCharsets.UTF_8), false);
                return;
            }
            if (path.endsWith("/")) path += "index.html";
            byte[] body;
            try (InputStream asset = assets.open(root + path)) {
                body = readAll(asset);
            } catch (IOException e) {
                android.util.Log.w("NomadicAgentTest", "404 " + path);
                send(conn.getOutputStream(), 404, "text/plain", "Not found".getBytes(StandardCharsets.UTF_8), false);
                return;
            }
            boolean html = path.endsWith(".html");
            if (html) body = new String(body, StandardCharsets.UTF_8).replace("{{ORIGIN_B}}", originB).getBytes(StandardCharsets.UTF_8);
            send(conn.getOutputStream(), 200, contentType(path), body, html);
        } catch (IOException ignored) {
            // client went away
        }
    }

    private void send(OutputStream out, int status, String type, byte[] body, boolean withCsp) throws IOException {
        StringBuilder h = new StringBuilder();
        h.append("HTTP/1.1 ").append(status).append(status == 200 ? " OK" : " Not Found").append("\r\n");
        h.append("Content-Type: ").append(type).append("\r\n");
        h.append("Content-Length: ").append(body.length).append("\r\n");
        h.append("Cache-Control: no-store\r\n");
        if (withCsp && csp != null) h.append("Content-Security-Policy: ").append(csp).append("\r\n");
        h.append("Connection: close\r\n\r\n");
        out.write(h.toString().getBytes(StandardCharsets.ISO_8859_1));
        out.write(body);
        out.flush();
    }

    private static String contentType(String path) {
        if (path.endsWith(".html")) return "text/html; charset=utf-8";
        if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
        if (path.endsWith(".css")) return "text/css; charset=utf-8";
        if (path.endsWith(".json")) return "application/json; charset=utf-8";
        if (path.endsWith(".pdf")) return "application/pdf";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".png")) return "image/png";
        return "application/octet-stream";
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] chunk = new byte[16384];
        int n;
        while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
        return buf.toByteArray();
    }

    @Override
    public void close() throws IOException {
        running = false;
        socket.close();
    }
}
