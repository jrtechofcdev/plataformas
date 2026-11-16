/*
 * Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
 */
package com.jrtechofc.cuberemote;

import android.content.Context;
import android.util.Log;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * AppLog — sistema de log do app.
 *  • guarda as últimas 3000 linhas na memória (para mostrar na tela);
 *  • grava em arquivo (cuberemote.log, até ~1 MB, depois recomeça) para não perder após fechar;
 *  • avisa a tela a cada linha nova, mas só enquanto o painel Log estiver aberto (setLive).
 *
 * Desempenho (versão 2.8): log() só guarda a linha e volta na hora. A gravação no arquivo acontece
 * numa thread própria, em lotes (no máximo 1 vez por segundo), com o arquivo aberto uma vez só.
 * Antes o arquivo era aberto e fechado a cada linha, o que deixava a fila do USB e a ponte lentas.
 */
public final class AppLog implements CubeDevice.Logger {
    public interface Listener { void onLine(String line); }

    private static final int MAX_LINES = 3000;
    private static final long MAX_FILE = 1024 * 1024;
    private final ArrayDeque<String> lines = new ArrayDeque<>();
    private final SimpleDateFormat fmt = new SimpleDateFormat("HH:mm:ss.SSS", Locale.US);
    private final File file;
    private final StringBuilder pending = new StringBuilder();
    private final ScheduledExecutorService disk = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "cuberemote-log");
        t.setPriority(Thread.MIN_PRIORITY);
        return t;
    });
    private boolean flushScheduled = false;
    private BufferedWriter out;
    private volatile Listener listener;
    private volatile boolean live = false;

    public AppLog(Context ctx) {
        file = new File(ctx.getFilesDir(), "cuberemote.log");
        disk.execute(() -> { if (file.length() > MAX_FILE) file.delete(); });
    }

    public void setListener(Listener l) { listener = l; }

    /** Liga ou desliga o envio das linhas para a tela (painel Log aberto ou fechado). */
    public void setLive(boolean on) { live = on; }

    @Override public void log(String msg) {
        String line;
        synchronized (lines) {
            line = fmt.format(new Date()) + "  " + msg;
            lines.addLast(line);
            while (lines.size() > MAX_LINES) lines.removeFirst();
            pending.append(line).append('\n');
            if (!flushScheduled) {
                flushScheduled = true;
                disk.schedule(this::flush, 1, TimeUnit.SECONDS);
            }
        }
        Listener l = listener;
        if (live && l != null) l.onLine(line);
    }

    /** Grava agora o que estiver pendente (chamado ao pausar o app). Não bloqueia quem chama. */
    public void flushSoon() { disk.execute(this::flush); }

    private void flush() {
        String chunk;
        synchronized (lines) {
            chunk = pending.toString();
            pending.setLength(0);
            flushScheduled = false;
        }
        if (chunk.isEmpty()) return;
        try {
            if (out != null && file.length() > MAX_FILE) { out.close(); out = null; file.delete(); }
            if (out == null) out = new BufferedWriter(new OutputStreamWriter(new FileOutputStream(file, true), StandardCharsets.UTF_8), 16384);
            out.write(chunk);
            out.flush();
        } catch (Exception e) {
            try { if (out != null) out.close(); } catch (Exception ignored) {}
            out = null;
        }
        for (String s : chunk.split("\n")) Log.i("CubeRemote", s);
    }

    public String all() {
        StringBuilder sb = new StringBuilder();
        synchronized (lines) { for (String s : lines) sb.append(s).append('\n'); }
        return sb.toString();
    }

    public void clear() {
        synchronized (lines) { lines.clear(); pending.setLength(0); }
        disk.execute(() -> {
            try { if (out != null) out.close(); } catch (Exception ignored) {}
            out = null;
            file.delete();
        });
    }
}
