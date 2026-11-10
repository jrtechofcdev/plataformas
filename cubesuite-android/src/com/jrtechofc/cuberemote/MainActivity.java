package com.jrtechofc.cuberemote;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.media.midi.MidiDevice;
import android.media.midi.MidiDeviceInfo;
import android.media.midi.MidiManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Tela principal: mostra a interface (assets/www/index.html) e faz a ponte
 * entre o JavaScript e a pedaleira (USB-MIDI).
 *
 * O JavaScript chama:  CubeNative.call(id, "metodo", "{json}")
 * e recebe a resposta em: window.cubeResolve(id, ok, resultado)
 * Avisos de conexão chegam em: window.cubeEvent(nome, dados)
 */
public class MainActivity extends Activity {
    private static final int PICK_FILE = 41;

    private WebView web;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private MidiManager midi;
    private MidiLink link;
    private CubeDevice cube;
    private MidiDeviceInfo cubeInfo;
    private volatile boolean connecting = false;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); // tela não apaga no palco
        getWindow().setStatusBarColor(Color.parseColor("#0b0d10"));
        getWindow().setNavigationBarColor(Color.parseColor("#0b0d10"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0b0d10"));
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setAllowFileAccess(true);
        web.addJavascriptInterface(new Bridge(), "CubeNative");
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try { startActivityForResult(Intent.createChooser(i, "Escolha o arquivo"), PICK_FILE); }
                catch (Exception e) { fileCallback = null; return false; }
                return true;
            }
        });
        setContentView(web);
        web.loadUrl("file:///android_asset/www/index.html");

        midi = (MidiManager) getSystemService(Context.MIDI_SERVICE);
        if (midi != null) {
            midi.registerDeviceCallback(new MidiManager.DeviceCallback() {
                @Override public void onDeviceAdded(MidiDeviceInfo info) {
                    if (cube == null) main.postDelayed(MainActivity.this::connectAsync, 600);
                }
                @Override public void onDeviceRemoved(MidiDeviceInfo info) {
                    if (cubeInfo != null && info.getId() == cubeInfo.getId()) {
                        worker.execute(() -> { disconnect(); event("status", status("off", "Pedaleira desconectada")); });
                    }
                }
            }, main);
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == PICK_FILE && fileCallback != null) {
            Uri u = (res == RESULT_OK && data != null) ? data.getData() : null;
            fileCallback.onReceiveValue(u != null ? new Uri[]{u} : null);
            fileCallback = null;
        }
        super.onActivityResult(req, res, data);
    }

    @Override
    protected void onDestroy() {
        worker.execute(this::disconnect);
        worker.shutdown();
        super.onDestroy();
    }

    // ------------------------------------------------------------ conexão
    private void connectAsync() {
        if (connecting) return;
        connecting = true;
        worker.execute(() -> {
            try { connectNow(); } finally { connecting = false; }
        });
    }

    @SuppressWarnings("deprecation")
    private void connectNow() {
        disconnect();
        if (midi == null) { event("status", status("error", "Este celular não tem suporte a MIDI (Android 6 ou mais novo é necessário).")); return; }
        event("status", status("search", "Procurando a pedaleira…"));
        List<MidiDeviceInfo> list = new ArrayList<>();
        for (MidiDeviceInfo i : midi.getDevices()) if (i.getType() == MidiDeviceInfo.TYPE_USB) list.add(i);
        for (MidiDeviceInfo i : midi.getDevices()) if (i.getType() != MidiDeviceInfo.TYPE_USB) list.add(i);
        StringBuilder log = new StringBuilder();
        for (MidiDeviceInfo info : list) {
            if (info.getInputPortCount() < 1 || info.getOutputPortCount() < 1) continue;
            String label = deviceLabel(info);
            MidiDevice dev = openDevice(info);
            if (dev == null) { log.append(label).append(": não abriu\n"); continue; }
            try {
                MidiLink l = new MidiLink(dev, 0, 0);
                CubeDevice c = new CubeDevice(l);
                try {
                    c.connect();
                    link = l; cube = c; cubeInfo = info;
                    event("status", fullState());
                    return;
                } catch (Exception e) {
                    log.append(label).append(": ").append(e.getMessage()).append('\n');
                    l.close();
                }
            } catch (Exception e) {
                log.append(label).append(": ").append(e.getMessage()).append('\n');
                try { dev.close(); } catch (Exception ignored) {}
            }
        }
        String msg = list.isEmpty()
                ? "Nenhum aparelho MIDI encontrado. Ligue a pedaleira com o cabo/adaptador OTG."
                : "Pedaleira não encontrada.\n" + log;
        event("status", status("off", msg.trim()));
    }

    private MidiDevice openDevice(MidiDeviceInfo info) {
        final MidiDevice[] out = new MidiDevice[1];
        final CountDownLatch done = new CountDownLatch(1);
        midi.openDevice(info, d -> { out[0] = d; done.countDown(); }, main);
        try { done.await(5, TimeUnit.SECONDS); } catch (InterruptedException ignored) {}
        return out[0];
    }

    private static String deviceLabel(MidiDeviceInfo info) {
        Bundle p = info.getProperties();
        String n = p.getString(MidiDeviceInfo.PROPERTY_NAME);
        if (n == null) n = p.getString(MidiDeviceInfo.PROPERTY_PRODUCT);
        return n != null ? n : "MIDI " + info.getId();
    }

    private void disconnect() {
        if (link != null) link.close();
        link = null; cube = null; cubeInfo = null;
    }

    // ------------------------------------------------------------ respostas para o JS
    private JSONObject status(String state, String message) {
        JSONObject o = new JSONObject();
        try { o.put("state", state); o.put("message", message); } catch (Exception ignored) {}
        return o;
    }

    private JSONObject fullState() {
        JSONObject o = status("on", "Conectada");
        try {
            CubeDevice c = cube;
            o.put("device", deviceLabel(cubeInfo));
            o.put("name", c.name);
            o.put("version", c.version);
            o.put("model", c.model);
            o.put("productId", String.format("0x%04X", c.productId));
            o.put("generation", c.generation);
            if (c.generation == 2) {
                o.put("presets", presetsJson(c.readPresets()));
                o.put("loopback", c.getLoopback());
            }
        } catch (Exception e) {
            try { o.put("warning", e.getMessage()); } catch (Exception ignored) {}
        }
        return o;
    }

    private static JSONArray presetsJson(int[][] p) {
        JSONArray a = new JSONArray();
        for (int[] row : p) {
            JSONArray r = new JSONArray();
            for (int v : row) r.put(v);
            a.put(r);
        }
        return a;
    }

    private void event(String name, JSONObject data) {
        js("window.cubeEvent && window.cubeEvent(" + JSONObject.quote(name) + "," + data + ")");
    }

    private void js(final String code) {
        main.post(() -> web.evaluateJavascript(code, null));
    }

    // ------------------------------------------------------------ ponte JavaScript -> Java
    private class Bridge {
        @JavascriptInterface
        public void call(final String id, final String method, final String argsJson) {
            if ("connect".equals(method)) {   // conexão tem fila própria
                connectAsync();
                resolve(id, true, "null");
                return;
            }
            worker.execute(new Runnable() {
                @Override public void run() { execute(id, method, argsJson); }
            });
        }

        private void execute(String id, String method, String argsJson) {
            try {
                JSONObject a = new JSONObject(argsJson == null || argsJson.isEmpty() ? "{}" : argsJson);
                resolve(id, true, run(method, a));
            } catch (Exception e) {
                if (e instanceof java.io.IOException || e instanceof IllegalStateException) {
                    disconnect();
                    event("status", status("off", "Conexão perdida: " + e.getMessage()));
                }
                String msg = e.getMessage() == null ? e.toString() : e.getMessage();
                resolve(id, false, JSONObject.quote(msg));
            }
        }

        private String run(String m, JSONObject a) throws Exception {
            if ("state".equals(m)) return cube == null ? status("off", "Desconectada").toString() : fullState().toString();
            CubeDevice c = cube;
            if (c == null) throw new CubeDevice.DeviceException("Pedaleira não conectada");
            switch (m) {
                case "param":
                    c.setParam(a.getInt("preset"), a.getInt("offset"), a.getInt("value"));
                    return "true";
                case "presets":
                    return presetsJson(c.readPresets()).toString();
                case "factoryPresets":
                    return presetsJson(c.factoryPresets()).toString();
                case "loopback":
                    c.setLoopback(a.getBoolean("on"));
                    return String.valueOf(c.getLoopback());
                case "irPreview":
                    c.irPreview(floats(a.getJSONArray("samples")), a.getInt("distance"));
                    return "true";
                case "irDistance":
                    c.irDistance(a.getInt("distance"));
                    return "true";
                case "irSave":
                    c.irSave(a.getInt("slot"), floats(a.getJSONArray("samples")), a.getInt("distance"));
                    return "true";
                default:
                    throw new CubeDevice.DeviceException("função desconhecida: " + m);
            }
        }

        private float[] floats(JSONArray arr) throws Exception {
            float[] f = new float[arr.length()];
            for (int i = 0; i < f.length; i++) f[i] = (float) arr.getDouble(i);
            return f;
        }

        private void resolve(String id, boolean ok, String json) {
            js("window.cubeResolve && window.cubeResolve(" + JSONObject.quote(id) + "," + ok + "," + json + ")");
        }
    }
}
