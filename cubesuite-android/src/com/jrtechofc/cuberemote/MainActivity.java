package com.jrtechofc.cuberemote;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.media.midi.MidiDevice;
import android.media.midi.MidiDeviceInfo;
import android.media.midi.MidiManager;
import android.net.Uri;
import android.os.Build;
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
 * entre o JavaScript e a pedaleira.
 *
 * Conexão em 2 métodos:
 *   1) MIDI do Android (MidiManager) — testa todas as portas de cada aparelho MIDI;
 *   2) USB direto (UsbManager) — plano B quando o celular não lista a pedaleira como MIDI.
 *
 * Tudo é registrado no log (AppLog), visível no botão 📋 do app.
 */
public class MainActivity extends Activity {
    static final String VERSION = "1.2.0";
    private static final int PICK_FILE = 41;
    private static final String ACTION_USB_PERMISSION = "com.jrtechofc.cuberemote.USB_PERMISSION";

    private WebView web;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private AppLog log;
    private MidiManager midi;
    private UsbManager usb;
    private CubeDevice.Link link;
    private MidiDevice openMidiDevice;
    private CubeDevice cube;
    private String cubeSource = "";
    private int cubeMidiId = -1;
    private String cubeUsbName = null;
    private volatile boolean connecting = false;
    private ValueCallback<Uri[]> fileCallback;

    // linhas de log que ainda vão para a tela (mandadas em lote, a cada 250 ms)
    private final StringBuilder pendingLog = new StringBuilder();
    private boolean logFlushScheduled = false;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); // tela não apaga no palco
        getWindow().setStatusBarColor(Color.parseColor("#0b0d10"));
        getWindow().setNavigationBarColor(Color.parseColor("#0b0d10"));

        log = new AppLog(this);
        CubeDevice.logger = log;
        log.setListener(this::queueLogToScreen);
        log.log("===== Cube Remote " + VERSION + " iniciado =====");
        log.log("Celular: " + Build.MANUFACTURER + " " + Build.MODEL + " · Android " + Build.VERSION.RELEASE
                + " (API " + Build.VERSION.SDK_INT + ")");
        PackageManager pm = getPackageManager();
        log.log("Suporte MIDI: " + pm.hasSystemFeature(PackageManager.FEATURE_MIDI)
                + " · USB host (OTG): " + pm.hasSystemFeature(PackageManager.FEATURE_USB_HOST));

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

        usb = (UsbManager) getSystemService(Context.USB_SERVICE);
        midi = (MidiManager) getSystemService(Context.MIDI_SERVICE);
        if (midi != null) {
            midi.registerDeviceCallback(new MidiManager.DeviceCallback() {
                @Override public void onDeviceAdded(MidiDeviceInfo info) {
                    log.log("Sistema MIDI: aparelho adicionado → " + describe(info));
                    if (cube == null) main.postDelayed(MainActivity.this::connectAsync, 800);
                }
                @Override public void onDeviceRemoved(MidiDeviceInfo info) {
                    log.log("Sistema MIDI: aparelho removido → " + describe(info));
                    if (info.getId() == cubeMidiId) lost("Pedaleira desconectada");
                }
            }, main);
        } else {
            log.log("ATENÇÃO: MidiManager indisponível (o celular não tem MIDI do Android). Só o modo USB direto funcionará.");
        }
        IntentFilter f = new IntentFilter(UsbManager.ACTION_USB_DEVICE_DETACHED);
        registerReceiverCompat(new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent i) {
                UsbDevice d = i.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                log.log("USB: aparelho removido " + (d != null ? d.getDeviceName() : ""));
                if (d != null && d.getDeviceName().equals(cubeUsbName)) lost("Pedaleira desconectada (USB)");
            }
        }, f, true);
        handleUsbIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleUsbIntent(intent);
    }

    private void handleUsbIntent(Intent intent) {
        if (intent != null && UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(intent.getAction())) {
            UsbDevice d = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
            log.log("Aberto ao plugar USB: " + (d != null ? usbSummary(d) : "?"));
            if (cube == null) main.postDelayed(this::connectAsync, 1200);
        }
    }

    private void lost(String why) {
        worker.execute(() -> { disconnect(); event("status", status("off", why)); });
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

    private void registerReceiverCompat(BroadcastReceiver r, IntentFilter f, boolean exported) {
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(r, f, exported ? 2 /*RECEIVER_EXPORTED*/ : 4 /*NOT_EXPORTED*/);
        else registerReceiver(r, f);
    }

    // ================================================================ conexão
    private void connectAsync() {
        if (connecting) return;
        connecting = true;
        worker.execute(() -> {
            try { connectNow(); }
            catch (Throwable t) { log.log("ERRO inesperado na conexão: " + t); event("status", status("off", "Erro: " + t.getMessage())); }
            finally { connecting = false; }
        });
    }

    private void connectNow() {
        disconnect();
        event("status", status("search", "Procurando a pedaleira…"));
        log.log("---------- Nova tentativa de conexão ----------");

        if (tryMidiManager()) return;
        if (tryUsbDirect()) return;

        log.log("✗ Pedaleira NÃO encontrada. Toque em 📋 → Compartilhar e envie este log.");
        event("status", status("off", "Pedaleira não encontrada.\nToque em 📋 Log para ver os detalhes e compartilhar."));
    }

    /** Método 1: sistema MIDI do Android. */
    @SuppressWarnings("deprecation")
    private boolean tryMidiManager() {
        if (midi == null) { log.log("Método 1 (MIDI Android): indisponível neste celular"); return false; }
        MidiDeviceInfo[] all = midi.getDevices();
        log.log("Método 1 (MIDI Android): " + all.length + " aparelho(s) MIDI no sistema");
        List<MidiDeviceInfo> list = new ArrayList<>();
        for (MidiDeviceInfo i : all) if (i.getType() == MidiDeviceInfo.TYPE_USB) list.add(i);
        for (MidiDeviceInfo i : all) if (i.getType() != MidiDeviceInfo.TYPE_USB) list.add(i);
        for (MidiDeviceInfo info : list) {
            log.log("  • " + describe(info));
            if (info.getInputPortCount() < 1 || info.getOutputPortCount() < 1) { log.log("    (sem par entrada/saída — pulando)"); continue; }
            MidiDevice dev = openDevice(info);
            if (dev == null) { log.log("    ✗ não abriu (openDevice retornou nada em 5 s)"); continue; }
            for (int in = 0; in < info.getInputPortCount(); in++) {
                MidiLink l = null;
                try {
                    l = new MidiLink(dev, in, false);
                    sleep(250);
                    CubeDevice c = new CubeDevice(l);
                    c.connect();
                    link = l; cube = c; openMidiDevice = dev; cubeMidiId = info.getId();
                    cubeSource = "MIDI Android · " + name(info) + " · porta " + in;
                    connected();
                    return true;
                } catch (Exception e) {
                    log.log("    ✗ porta " + in + ": " + e.getMessage());
                    if (l != null) l.close();
                }
            }
            try { dev.close(); } catch (Exception ignored) {}
        }
        return false;
    }

    /** Método 2: USB direto, sem passar pelo sistema MIDI. */
    private boolean tryUsbDirect() {
        if (usb == null) { log.log("Método 2 (USB direto): UsbManager indisponível"); return false; }
        java.util.Collection<UsbDevice> devs = usb.getDeviceList().values();
        log.log("Método 2 (USB direto): " + devs.size() + " aparelho(s) USB conectado(s)");
        if (devs.isEmpty())
            log.log("  Nenhum aparelho USB visto. Verifique cabo/adaptador OTG e se o OTG está ativado nas configurações do celular.");
        for (UsbDevice d : devs) {
            logUsbDevice(d);
            UsbInterface[] cands = UsbRawLink.candidateInterfaces(d);
            if (cands.length == 0) { log.log("    (nenhuma interface MIDI/bulk utilizável)"); continue; }
            if (!ensurePermission(d)) continue;
            for (UsbInterface it : cands) {
                UsbRawLink l = null;
                try {
                    l = new UsbRawLink(usb, d, it, 0);
                    sleep(250);
                    CubeDevice c = new CubeDevice(l);
                    c.connect();
                    link = l; cube = c; cubeUsbName = d.getDeviceName();
                    cubeSource = "USB direto · " + productName(d) + " · interface " + it.getId();
                    connected();
                    return true;
                } catch (Exception e) {
                    log.log("    ✗ interface " + it.getId() + ": " + e.getMessage());
                    if (l != null) l.close();
                }
            }
        }
        return false;
    }

    private boolean ensurePermission(UsbDevice d) {
        if (usb.hasPermission(d)) { log.log("    permissão USB: já concedida"); return true; }
        log.log("    pedindo permissão USB ao usuário…");
        event("status", status("search", "Toque em PERMITIR na janela do Android para acessar a pedaleira"));
        final boolean[] ok = {false};
        final CountDownLatch done = new CountDownLatch(1);
        BroadcastReceiver r = new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent i) {
                ok[0] = i.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
                done.countDown();
            }
        };
        registerReceiverCompat(r, new IntentFilter(ACTION_USB_PERMISSION), false);
        int flags = Build.VERSION.SDK_INT >= 31 ? 0x02000000 /*FLAG_MUTABLE*/ : 0;
        Intent i = new Intent(ACTION_USB_PERMISSION).setPackage(getPackageName());
        usb.requestPermission(d, PendingIntent.getBroadcast(this, 0, i, flags));
        try { done.await(40, TimeUnit.SECONDS); } catch (InterruptedException ignored) {}
        try { unregisterReceiver(r); } catch (Exception ignored) {}
        boolean granted = ok[0] || usb.hasPermission(d);
        log.log("    permissão USB: " + (granted ? "concedida" : "NEGADA ou sem resposta"));
        return granted;
    }

    private void connected() {
        log.log("✓ CONECTADA via " + cubeSource + " — " + cube.model + String.format(" (ID 0x%04X, geração %d)", cube.productId, cube.generation));
        event("status", fullState());
    }

    private MidiDevice openDevice(MidiDeviceInfo info) {
        final MidiDevice[] out = new MidiDevice[1];
        final CountDownLatch done = new CountDownLatch(1);
        midi.openDevice(info, d -> { out[0] = d; done.countDown(); }, main);
        try { done.await(5, TimeUnit.SECONDS); } catch (InterruptedException ignored) {}
        return out[0];
    }

    private void disconnect() {
        if (link instanceof MidiLink) ((MidiLink) link).close();
        if (link instanceof UsbRawLink) ((UsbRawLink) link).close();
        if (openMidiDevice != null) try { openMidiDevice.close(); } catch (Exception ignored) {}
        if (cube != null) log.log("Desconectado.");
        link = null; cube = null; openMidiDevice = null; cubeMidiId = -1; cubeUsbName = null;
    }

    private static void sleep(long ms) { try { Thread.sleep(ms); } catch (InterruptedException ignored) {} }

    // ================================================================ descrição p/ log
    private static String name(MidiDeviceInfo info) {
        Bundle p = info.getProperties();
        String n = p.getString(MidiDeviceInfo.PROPERTY_NAME);
        if (n == null) n = p.getString(MidiDeviceInfo.PROPERTY_PRODUCT);
        return n != null ? n : "MIDI " + info.getId();
    }

    private static String describe(MidiDeviceInfo info) {
        Bundle p = info.getProperties();
        String type = info.getType() == MidiDeviceInfo.TYPE_USB ? "USB"
                : info.getType() == MidiDeviceInfo.TYPE_BLUETOOTH ? "Bluetooth" : "virtual";
        StringBuilder sb = new StringBuilder();
        sb.append('"').append(name(info)).append("\" id=").append(info.getId()).append(" tipo=").append(type)
          .append(" fabricante=").append(p.getString(MidiDeviceInfo.PROPERTY_MANUFACTURER))
          .append(" entradas=").append(info.getInputPortCount()).append(" saídas=").append(info.getOutputPortCount());
        for (MidiDeviceInfo.PortInfo pi : info.getPorts())
            sb.append(" [").append(pi.getType() == MidiDeviceInfo.PortInfo.TYPE_INPUT ? "in" : "out")
              .append(pi.getPortNumber()).append(':').append(pi.getName()).append(']');
        return sb.toString();
    }

    private static String productName(UsbDevice d) {
        String n = Build.VERSION.SDK_INT >= 21 ? d.getProductName() : null;
        return n != null ? n : d.getDeviceName();
    }

    private static String usbSummary(UsbDevice d) {
        return String.format("\"%s\" VID:PID=%04X:%04X", productName(d), d.getVendorId(), d.getProductId());
    }

    private void logUsbDevice(UsbDevice d) {
        String mf = Build.VERSION.SDK_INT >= 21 ? d.getManufacturerName() : null;
        log.log("  • " + usbSummary(d) + " fabricante=" + mf + " classe=" + d.getDeviceClass() + " " + d.getDeviceName()
                + " interfaces=" + d.getInterfaceCount());
        for (int i = 0; i < d.getInterfaceCount(); i++) {
            UsbInterface it = d.getInterface(i);
            StringBuilder sb = new StringBuilder();
            for (int e = 0; e < it.getEndpointCount(); e++) {
                UsbEndpoint ep = it.getEndpoint(e);
                String t = ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK ? "bulk"
                        : ep.getType() == UsbConstants.USB_ENDPOINT_XFER_INT ? "int"
                        : ep.getType() == UsbConstants.USB_ENDPOINT_XFER_ISOC ? "isoc" : "ctrl";
                sb.append(String.format(" ep%02X(%s %s %dB)", ep.getAddress(),
                        ep.getDirection() == UsbConstants.USB_DIR_IN ? "IN" : "OUT", t, ep.getMaxPacketSize()));
            }
            String kind = it.getInterfaceClass() == 1 && it.getInterfaceSubclass() == 3 ? " ← MIDI"
                    : it.getInterfaceClass() == 1 && it.getInterfaceSubclass() == 1 ? " (áudio controle)"
                    : it.getInterfaceClass() == 1 && it.getInterfaceSubclass() == 2 ? " (áudio stream)" : "";
            log.log(String.format("      if%d alt%d classe=%d sub=%d%s%s", it.getId(),
                    Build.VERSION.SDK_INT >= 21 ? it.getAlternateSetting() : 0,
                    it.getInterfaceClass(), it.getInterfaceSubclass(), kind, sb));
        }
    }

    // ================================================================ testes (laboratório)
    /** Abre a primeira forma de falar com a pedaleira: MIDI Android, depois USB direto. */
    @SuppressWarnings("deprecation")
    private List<Object> openTestLinks() {
        List<Object> out = new ArrayList<>();
        if (midi != null) {
            for (MidiDeviceInfo info : midi.getDevices()) {
                if (info.getType() != MidiDeviceInfo.TYPE_USB || info.getInputPortCount() < 1 || info.getOutputPortCount() < 1) continue;
                MidiDevice dev = openDevice(info);
                if (dev == null) continue;
                try { out.add(new Object[]{new MidiLink(dev, 0, true), "MIDI Android · " + name(info)}); }
                catch (Exception e) { log.log("  MIDI Android: " + e.getMessage()); try { dev.close(); } catch (Exception ignored) {} }
                break;
            }
        }
        return out;
    }

    private Object[] openUsbTestLink() {
        if (usb == null) return null;
        for (UsbDevice d : usb.getDeviceList().values()) {
            UsbInterface[] c = UsbRawLink.candidateInterfaces(d);
            if (c.length == 0 || !ensurePermission(d)) continue;
            try { return new Object[]{new UsbRawLink(usb, d, c[0], 0), "USB direto · " + productName(d)}; }
            catch (Exception e) { log.log("  USB direto: " + e.getMessage()); }
        }
        return null;
    }

    private static long received(Object link) {
        return link instanceof MidiLink ? ((MidiLink) link).receivedBytes() : ((UsbRawLink) link).receivedBytes();
    }

    private static byte[] b(int... v) { byte[] r = new byte[v.length]; for (int i = 0; i < v.length; i++) r[i] = (byte) v[i]; return r; }

    /** Envia várias variantes de "quem é você?" e registra quais recebem resposta. */
    private void probe() {
        disconnect();
        event("status", status("search", "Testando protocolos… (veja o 📋 Log)"));
        boolean oldTrace = CubeDevice.traceBytes;
        CubeDevice.traceBytes = true;
        log.log("========== TESTE DE PROTOCOLOS ==========");
        byte[] idPc = CubeProtocol.reqIdentify();                       // 59 00 11 00 00 00 FF
        byte[] idNew = b(0x00, 0x59, 0x11, 0, 0, 0, 0xFF);             // cabeçalho do app novo
        byte[] fwNew = b(0x00, 0x59, 0x13, 0, 0, 0, 0xFF);             // versão do firmware (app novo)
        Object[][] tests = {
            {"1 PC (59 00) SysEx 7 bits", CubeProtocol.toSysex(idPc), false},
            {"2 Novo (00 59) SysEx 7 bits", CubeProtocol.toSysex(idNew), false},
            {"3 PC (59 00) SysEx sem empacotar", b(0xF0, 0x59, 0, 0x11, 0, 0, 0, 0xFF, 0xF7), false},
            {"4 Novo (00 59) SysEx sem empacotar", b(0xF0, 0, 0x59, 0x11, 0, 0, 0, 0xFF, 0xF7), false},
            {"5 Identidade MIDI universal", b(0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7), false},
            {"6 Handshake modo 2 do PC", b(0xF0, 0x59, 0x12, 0x00, 0x34, 0xF7), false},
            {"7 Novo firmware (00 59 13) 7 bits", CubeProtocol.toSysex(fwNew), false},
            {"8 Bruto 00 59 11 (estilo Bluetooth)", idNew, true},
            {"9 Bruto 59 00 11", idPc, true},
        };
        StringBuilder summary = new StringBuilder();
        List<Object[]> links = new ArrayList<>();
        for (Object o : openTestLinks()) links.add((Object[]) o);
        boolean usbDone = false;
        for (int round = 0; round < 2; round++) {
            if (round == 1) {
                for (Object[] l : links) close(l[0]);
                links.clear();
                Object[] u = openUsbTestLink();
                if (u != null) { links.add(u); usbDone = true; }
            }
            for (Object[] l : links) {
                Object link = l[0];
                log.log("---- Via " + l[1] + " ----");
                for (Object[] t : tests) {
                    boolean rawOnly = (Boolean) t[2];
                    if (rawOnly && !(link instanceof UsbRawLink)) continue;
                    long before = received(link);
                    log.log("Teste " + t[0]);
                    try {
                        if (rawOnly) ((UsbRawLink) link).sendRaw((byte[]) t[1]);
                        else if (link instanceof MidiLink) ((MidiLink) link).sendRaw((byte[]) t[1]);
                        else ((UsbRawLink) link).send((byte[]) t[1]);
                    } catch (Exception e) { log.log("   erro ao enviar: " + e.getMessage()); }
                    sleep(1500);
                    long got = received(link) - before;
                    String r = got > 0 ? "RESPONDEU (" + got + " bytes)" : "sem resposta";
                    log.log("   → " + r);
                    summary.append(String.format("%-38s %-18s %s%n", t[0], l[1].toString().startsWith("USB") ? "[USB direto]" : "[MIDI Android]", r));
                }
            }
        }
        for (Object[] l : links) close(l[0]);
        if (!usbDone) log.log("(modo USB direto não pôde ser testado)");
        log.log("========== RESUMO ==========\n" + summary + "============================");
        CubeDevice.traceBytes = oldTrace;
        event("status", status("off", "Teste concluído. Abra o 📋 Log e toque em Compartilhar."));
    }

    /** Escuta tudo que a pedaleira mandar durante N segundos. */
    private void monitor(int seconds) {
        disconnect();
        boolean oldTrace = CubeDevice.traceBytes;
        CubeDevice.traceBytes = true;
        List<Object> ls = openTestLinks();
        Object[] l = ls.isEmpty() ? openUsbTestLink() : (Object[]) ls.get(0);
        if (l == null) { log.log("Monitor: nenhuma porta da pedaleira abriu"); CubeDevice.traceBytes = oldTrace; return; }
        log.log("========== MONITOR " + seconds + " s via " + l[1] + " ==========");
        log.log("Agora: gire os knobs, aperte os 3 footswitches, segure EDIT, troque preset…");
        event("status", status("search", "Monitorando " + seconds + " s: mexa na pedaleira agora!"));
        long start = received(l[0]);
        for (int i = seconds; i > 0; i--) {
            sleep(1000);
            if (i % 10 == 0) log.log("   … " + i + " s restantes (" + (received(l[0]) - start) + " bytes recebidos)");
        }
        long got = received(l[0]) - start;
        log.log("========== FIM DO MONITOR: " + got + " bytes recebidos ==========");
        close(l[0]);
        CubeDevice.traceBytes = oldTrace;
        event("status", status("off", "Monitor concluído (" + got + " bytes). Compartilhe o 📋 Log."));
    }

    private static void close(Object link) {
        if (link instanceof MidiLink) ((MidiLink) link).close();
        else if (link instanceof UsbRawLink) ((UsbRawLink) link).close();
    }

    /** Relatório completo do que o celular enxerga (sem conectar). */
    @SuppressWarnings("deprecation")
    private void diagnostics() {
        log.log("========== DIAGNÓSTICO ==========");
        log.log("App " + VERSION + " · " + Build.MANUFACTURER + " " + Build.MODEL + " · Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")");
        if (midi != null) {
            MidiDeviceInfo[] all = midi.getDevices();
            log.log("Sistema MIDI: " + all.length + " aparelho(s)");
            for (MidiDeviceInfo i : all) log.log("  • " + describe(i));
        } else log.log("Sistema MIDI: indisponível");
        if (usb != null) {
            log.log("USB: " + usb.getDeviceList().size() + " aparelho(s)");
            for (UsbDevice d : usb.getDeviceList().values()) {
                logUsbDevice(d);
                log.log("    permissão USB: " + (usb.hasPermission(d) ? "sim" : "não"));
            }
        }
        log.log("Conectada agora: " + (cube != null ? cubeSource : "não"));
        log.log("=================================");
    }

    // ================================================================ respostas para o JS
    private JSONObject status(String state, String message) {
        JSONObject o = new JSONObject();
        try { o.put("state", state); o.put("message", message); } catch (Exception ignored) {}
        return o;
    }

    private JSONObject fullState() {
        JSONObject o = status("on", "Conectada");
        try {
            CubeDevice c = cube;
            o.put("device", cubeSource);
            o.put("name", c.name);
            o.put("version", c.version);
            o.put("model", c.model);
            o.put("productId", String.format("0x%04X", c.productId));
            o.put("generation", c.generation);
            o.put("appVersion", VERSION);
            if (c.generation == 2) {
                o.put("presets", presetsJson(c.readPresets()));
                o.put("loopback", c.getLoopback());
            }
        } catch (Exception e) {
            log.log("Aviso ao ler o estado: " + e.getMessage());
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

    private void queueLogToScreen(String line) {
        synchronized (pendingLog) {
            pendingLog.append(line).append('\n');
            if (logFlushScheduled) return;
            logFlushScheduled = true;
        }
        main.postDelayed(() -> {
            String chunk;
            synchronized (pendingLog) {
                chunk = pendingLog.toString();
                pendingLog.setLength(0);
                logFlushScheduled = false;
            }
            web.evaluateJavascript("window.cubeLog && window.cubeLog(" + JSONObject.quote(chunk) + ")", null);
        }, 250);
    }

    // ================================================================ ponte JavaScript -> Java
    private class Bridge {
        @JavascriptInterface
        public void call(final String id, final String method, final String argsJson) {
            switch (method) {   // estas não precisam esperar a fila da pedaleira
                case "connect": connectAsync(); resolve(id, true, "null"); return;
                case "getLog": resolve(id, true, JSONObject.quote(log.all())); return;
                case "clearLog": log.clear(); log.log("Log limpo."); resolve(id, true, "null"); return;
                case "copyLog": copyLog(); resolve(id, true, "null"); return;
                case "shareLog": shareLog(); resolve(id, true, "null"); return;
                case "diag": new Thread(MainActivity.this::diagnostics).start(); resolve(id, true, "null"); return;
                case "probe": worker.execute(MainActivity.this::probe); resolve(id, true, "null"); return;
                case "monitor": worker.execute(() -> monitor(30)); resolve(id, true, "null"); return;
                case "setTrace":
                    try { CubeDevice.traceBytes = new JSONObject(argsJson).getBoolean("on"); } catch (Exception ignored) {}
                    log.log("Registro de bytes (TX/RX): " + (CubeDevice.traceBytes ? "ligado" : "desligado"));
                    resolve(id, true, "null"); return;
                default: break;
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
                String msg = e.getMessage() == null ? e.toString() : e.getMessage();
                log.log("Erro em '" + method + "': " + msg);
                if (e instanceof java.io.IOException || e instanceof IllegalStateException) {
                    disconnect();
                    event("status", status("off", "Conexão perdida: " + msg));
                }
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
                    log.log("Restaurando presets de fábrica");
                    return presetsJson(c.factoryPresets()).toString();
                case "loopback":
                    c.setLoopback(a.getBoolean("on"));
                    return String.valueOf(c.getLoopback());
                case "irPreview":
                    log.log("Enviando prévia de IR");
                    c.irPreview(floats(a.getJSONArray("samples")), a.getInt("distance"));
                    return "true";
                case "irDistance":
                    c.irDistance(a.getInt("distance"));
                    return "true";
                case "irSave":
                    log.log("Salvando IR no slot " + (a.getInt("slot") + 1));
                    c.irSave(a.getInt("slot"), floats(a.getJSONArray("samples")), a.getInt("distance"));
                    log.log("IR salvo");
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

    private String logForSharing() {
        String all = log.all();
        // WhatsApp e afins aceitam textos grandes, mas limitamos às últimas ~60 mil letras
        return all.length() > 60000 ? "…(início cortado)\n" + all.substring(all.length() - 60000) : all;
    }

    private void copyLog() {
        main.post(() -> {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            cm.setPrimaryClip(ClipData.newPlainText("Cube Remote log", logForSharing()));
        });
    }

    private void shareLog() {
        main.post(() -> {
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType("text/plain");
            i.putExtra(Intent.EXTRA_SUBJECT, "Log do Cube Remote " + VERSION);
            i.putExtra(Intent.EXTRA_TEXT, logForSharing());
            startActivity(Intent.createChooser(i, "Compartilhar log"));
        });
    }
}
