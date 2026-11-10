package com.jrtechofc.cuberemote;

import java.io.ByteArrayOutputStream;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * Junta os pedaços de MIDI que chegam (o USB entrega aos poucos) até formar
 * mensagens SysEx completas (F0 ... F7) e as coloca numa fila.
 * Java puro: usado tanto pelo modo MIDI do Android quanto pelo modo USB direto.
 */
public class SysexAssembler {
    private final ByteArrayOutputStream partial = new ByteArrayOutputStream();
    private final LinkedBlockingQueue<byte[]> inbox = new LinkedBlockingQueue<>();
    private boolean inSysex = false;
    private final String tag;

    public SysexAssembler(String tag) { this.tag = tag; }

    public synchronized void feed(byte[] data, int off, int len) {
        for (int i = off; i < off + len; i++) {
            int b = data[i] & 0xFF;
            if (b >= 0xF8) continue;                       // tempo real (clock etc.): ignora
            if (b == 0xF0) { partial.reset(); inSysex = true; }
            if (!inSysex) {
                if (b >= 0x80) CubeDevice.log(tag + " RX (não-SysEx) " + String.format("%02X", b));
                continue;
            }
            partial.write(b);
            if (b == 0xF7) {
                byte[] msg = partial.toByteArray();
                CubeDevice.log(tag + " RX " + msg.length + "B " + CubeDevice.hex(msg, 48));
                inbox.offer(msg);
                partial.reset();
                inSysex = false;
            }
        }
    }

    public byte[] poll(long timeoutMs) throws InterruptedException {
        return inbox.poll(timeoutMs, TimeUnit.MILLISECONDS);
    }

    public synchronized void clear() { inbox.clear(); partial.reset(); inSysex = false; }
}
