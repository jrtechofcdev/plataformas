package com.jrtechofc.cuberemote;

import android.media.midi.MidiDevice;
import android.media.midi.MidiInputPort;
import android.media.midi.MidiOutputPort;
import android.media.midi.MidiReceiver;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * MidiLink — envia/recebe SysEx por uma porta USB-MIDI do Android (android.media.midi).
 *
 * Atenção aos nomes do Android (são "do ponto de vista do aparelho"):
 *   MidiInputPort  = entrada DA PEDALEIRA  -> nós ENVIAMOS por ela
 *   MidiOutputPort = saída DA PEDALEIRA    -> nós RECEBEMOS por ela
 */
public class MidiLink implements CubeDevice.Link {
    private final MidiDevice device;
    private final MidiInputPort toPedal;
    private final MidiOutputPort fromPedal;
    private final LinkedBlockingQueue<byte[]> inbox = new LinkedBlockingQueue<>();
    private final ByteArrayOutputStream partial = new ByteArrayOutputStream();
    private boolean inSysex = false;

    private final MidiReceiver receiver = new MidiReceiver() {
        @Override
        public void onSend(byte[] msg, int offset, int count, long timestamp) {
            // O USB entrega o SysEx em pedaços: juntamos até achar o F7.
            synchronized (partial) {
                for (int i = offset; i < offset + count; i++) {
                    int b = msg[i] & 0xFF;
                    if (b >= 0xF8) continue;                 // mensagens de tempo real: ignora
                    if (b == 0xF0) { partial.reset(); inSysex = true; }
                    if (!inSysex) continue;
                    partial.write(b);
                    if (b == 0xF7) { inbox.offer(partial.toByteArray()); partial.reset(); inSysex = false; }
                }
            }
        }
    };

    public MidiLink(MidiDevice device, int inPortIndex, int outPortIndex) throws IOException {
        this.device = device;
        toPedal = device.openInputPort(inPortIndex);
        fromPedal = device.openOutputPort(outPortIndex);
        if (toPedal == null || fromPedal == null) {
            close();
            throw new IOException("não consegui abrir as portas MIDI (em uso por outro app?)");
        }
        fromPedal.connect(receiver);
    }

    @Override public void send(byte[] sysex) throws IOException {
        // o Android aceita até ~1015 bytes por envio; mandamos em partes por segurança
        for (int off = 0; off < sysex.length; off += 512)
            toPedal.send(sysex, off, Math.min(512, sysex.length - off));
    }

    @Override public byte[] receive(long timeoutMs) throws InterruptedException {
        return inbox.poll(timeoutMs, TimeUnit.MILLISECONDS);
    }

    @Override public void clear() { inbox.clear(); }

    public void close() {
        try { if (fromPedal != null) { fromPedal.disconnect(receiver); fromPedal.close(); } } catch (Exception ignored) {}
        try { if (toPedal != null) toPedal.close(); } catch (Exception ignored) {}
        try { device.close(); } catch (Exception ignored) {}
    }
}
