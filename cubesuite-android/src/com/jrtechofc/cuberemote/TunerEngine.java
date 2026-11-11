/*
 * Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
 */
package com.jrtechofc.cuberemote;

import android.content.Context;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Motor do afinador: grava o áudio (microfone do celular ou entrada USB da pedaleira),
 * analisa com o PitchDetector e entrega {hz, clareza, nível} cerca de 23 vezes por segundo.
 */
public class TunerEngine {
    public interface Listener {
        void onPitch(double hz, double clarity, double rms);
        void onError(String message);
        void onInfo(String message);
    }

    private static final int SR = 48000, BLOCK = 4096, HOP = 2048;

    private final Context ctx;
    private final Listener listener;
    private volatile boolean running = false;
    private Thread thread;
    private String activeSource = "";

    public TunerEngine(Context ctx, Listener listener) {
        this.ctx = ctx;
        this.listener = listener;
    }

    /** Entradas de áudio disponíveis, para a tela de ajustes. */
    public JSONArray inputs() {
        JSONArray out = new JSONArray();
        try {
            out.put(new JSONObject().put("id", "mic").put("name", "Microfone do celular"));
            AudioDeviceInfo usb = findUsbInput();
            if (usb != null)
                out.put(new JSONObject().put("id", "usb").put("name", "Entrada USB: " + usb.getProductName()));
        } catch (Exception ignored) {}
        return out;
    }

    public AudioDeviceInfo findUsbInput() {
        AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_INPUTS)) {
            int t = d.getType();
            if (t == AudioDeviceInfo.TYPE_USB_DEVICE || t == AudioDeviceInfo.TYPE_USB_HEADSET
                    || (Build.VERSION.SDK_INT >= 26 && t == AudioDeviceInfo.TYPE_USB_ACCESSORY)) return d;
        }
        return null;
    }

    public synchronized String start(String source) {
        stop();
        AudioDeviceInfo usb = "usb".equals(source) ? findUsbInput() : null;
        if ("usb".equals(source) && usb == null) {
            listener.onError("Entrada de áudio USB da pedaleira não encontrada. Usando o microfone.");
        }
        // microfone: VOICE_RECOGNITION (sem controle automático de ganho); USB: MIC, a fonte que todo
        // celular aceita direcionar para um aparelho USB com setPreferredDevice
        int audioSource = usb != null ? MediaRecorder.AudioSource.MIC : MediaRecorder.AudioSource.VOICE_RECOGNITION;
        if (usb == null && Build.VERSION.SDK_INT >= 24) {
            AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            if ("true".equals(am.getProperty(AudioManager.PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED)))
                audioSource = MediaRecorder.AudioSource.UNPROCESSED;
        }
        int min = AudioRecord.getMinBufferSize(SR, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        final AudioRecord rec;
        try {
            rec = new AudioRecord(audioSource, SR, AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT, Math.max(min, BLOCK * 4));
            if (usb != null) rec.setPreferredDevice(usb);
            if (rec.getState() != AudioRecord.STATE_INITIALIZED) {
                rec.release();
                listener.onError("Não foi possível abrir a entrada de áudio.");
                return "";
            }
            rec.startRecording();
        } catch (SecurityException e) {
            listener.onError("Permissão de microfone negada. Libere em Configurações do Android > Apps > Cube Remote.");
            return "";
        } catch (Exception e) {
            listener.onError("Erro ao abrir o áudio: " + e.getMessage());
            return "";
        }
        activeSource = usb != null ? "usb" : "mic";
        running = true;
        final boolean isUsb = usb != null;
        thread = new Thread(() -> loop(rec, isUsb), "tuner");
        thread.start();
        return activeSource;
    }

    private void loop(AudioRecord rec, boolean isUsb) {
        PitchDetector pd = new PitchDetector(SR, BLOCK);
        short[] pcm = new short[HOP];
        float[] block = new float[BLOCK];
        long samples = 0;
        int peak = 0;
        boolean reported = false;
        try {
            AudioDeviceInfo routed = Build.VERSION.SDK_INT >= 24 ? rec.getRoutedDevice() : null;
            listener.onInfo("gravando de " + (routed != null ? "\"" + routed.getProductName() + "\" (tipo " + routed.getType() + ")" : "dispositivo padrão")
                    + ", " + rec.getSampleRate() + " Hz");
            if (isUsb && routed != null && routed.getType() != AudioDeviceInfo.TYPE_USB_DEVICE
                    && routed.getType() != AudioDeviceInfo.TYPE_USB_HEADSET)
                listener.onError("O Android não direcionou a gravação para a pedaleira (está usando " + routed.getProductName() + ").");
            while (running) {
                int n = rec.read(pcm, 0, HOP);
                if (n <= 0) continue;
                if (!reported) {
                    for (int i = 0; i < n; i++) { int a = Math.abs(pcm[i]); if (a > peak) peak = a; }
                    samples += n;
                    if (samples >= SR * 3) {   // depois de 3 s, registra o nível de entrada (ajuda a diagnosticar)
                        reported = true;
                        double db = peak > 0 ? 20 * Math.log10(peak / 32768.0) : -120;
                        listener.onInfo(String.format(java.util.Locale.US, "pico de entrada nos primeiros 3 s: %.1f dBFS", db));
                        if (isUsb && peak == 0)
                            listener.onError("A entrada USB abriu, mas não chega som. Desconecte e conecte o cabo da pedaleira com o afinador aberto.");
                    }
                }
                System.arraycopy(block, n, block, 0, BLOCK - n);
                for (int i = 0; i < n; i++) block[BLOCK - n + i] = pcm[i] / 32768f;
                PitchDetector.Result r = pd.detect(block);
                listener.onPitch(r.hz, r.clarity, r.rms);
            }
        } finally {
            try { rec.stop(); } catch (Exception ignored) {}
            rec.release();
        }
    }

    public synchronized void stop() {
        running = false;
        if (thread != null) {
            try { thread.join(500); } catch (InterruptedException ignored) {}
            thread = null;
        }
    }

    public boolean isRunning() { return running; }
}
