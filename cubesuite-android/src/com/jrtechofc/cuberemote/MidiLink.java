package com.jrtechofc.cuberemote;

import android.media.midi.MidiDevice;
import android.media.midi.MidiInputPort;
import android.media.midi.MidiOutputPort;
import android.media.midi.MidiReceiver;

import java.io.IOException;

/**
 * MÉTODO 1 — MIDI do Android (android.media.midi).
 *
 * Atenção aos nomes do Android (do ponto de vista do APARELHO):
 *   MidiInputPort  = entrada da pedaleira -> nós ENVIAMOS por ela
 *   MidiOutputPort = saída da pedaleira   -> nós RECEBEMOS por ela
 * Escutamos TODAS as saídas da pedaleira ao mesmo tempo (algumas têm mais de uma).
 */
public class MidiLink implements CubeDevice.Link {
    private final MidiDevice device;
    private final MidiInputPort toPedal;
    private final MidiOutputPort[] fromPedal;
    private final SysexAssembler rx;
    private final String tag;
    private final MidiReceiver receiver = new MidiReceiver() {
        @Override public void onSend(byte[] msg, int offset, int count, long timestamp) {
            rx.feed(msg, offset, count);
        }
    };

    /** @param closeDeviceOnClose se false, só fecha as portas (para testar outra porta no mesmo aparelho) */
    private final boolean closeDevice;

    public MidiLink(MidiDevice device, int inPort, boolean closeDeviceOnClose) throws IOException {
        this.device = device;
        this.closeDevice = closeDeviceOnClose;
        this.tag = "[MIDI in" + inPort + "]";
        this.rx = new SysexAssembler(tag);
        toPedal = device.openInputPort(inPort);
        if (toPedal == null) throw new IOException("porta de entrada " + inPort + " não abriu (em uso por outro app?)");
        int n = device.getInfo().getOutputPortCount();
        fromPedal = new MidiOutputPort[n];
        int opened = 0;
        for (int i = 0; i < n; i++) {
            fromPedal[i] = device.openOutputPort(i);
            if (fromPedal[i] != null) { fromPedal[i].connect(receiver); opened++; }
            else CubeDevice.log(tag + " saída " + i + " não abriu");
        }
        if (opened == 0) { close(); throw new IOException("nenhuma porta de saída abriu"); }
        CubeDevice.log(tag + " portas abertas: envio=in" + inPort + ", escuta=" + opened + " saída(s)");
    }

    @Override public void send(byte[] sysex) throws IOException {
        if (CubeDevice.traceBytes) CubeDevice.log(tag + " TX " + sysex.length + "B " + CubeDevice.hex(sysex, 48));
        // o Android aceita até ~1015 bytes por envio; mandamos em partes por segurança
        for (int off = 0; off < sysex.length; off += 512)
            toPedal.send(sysex, off, Math.min(512, sysex.length - off));
    }

    /** Envia bytes como estão (o Android repassa como MIDI) — só para testes. */
    public void sendRaw(byte[] data) throws IOException {
        CubeDevice.log(tag + " TX " + data.length + "B " + CubeDevice.hex(data, 48));
        toPedal.send(data, 0, data.length);
    }

    public long receivedBytes() { return rx.received.get(); }

    @Override public byte[] receive(long timeoutMs) throws InterruptedException { return rx.poll(timeoutMs); }

    @Override public void clear() { rx.clear(); }

    public void close() {
        for (MidiOutputPort p : fromPedal) {
            if (p == null) continue;
            try { p.disconnect(receiver); p.close(); } catch (Exception ignored) {}
        }
        try { if (toPedal != null) toPedal.close(); } catch (Exception ignored) {}
        if (closeDevice) try { device.close(); } catch (Exception ignored) {}
    }
}
