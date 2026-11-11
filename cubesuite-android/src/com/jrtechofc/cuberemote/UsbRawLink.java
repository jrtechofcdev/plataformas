/*
 * Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
 */
package com.jrtechofc.cuberemote;

import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

/**
 * MÉTODO 2 — USB direto (plano B).
 *
 * Alguns celulares não mostram a pedaleira no sistema MIDI do Android
 * (principalmente quando ela também é placa de som USB, como a Cube Baby).
 * Aqui falamos direto com o USB, montando os pacotes "USB-MIDI" de 4 bytes
 * da especificação USB Device Class for MIDI 1.0:
 *
 *   [cabo<<4 | CIN] [byte1] [byte2] [byte3]
 *   CIN 0x4 = SysEx começa/continua (3 bytes)   CIN 0x5/0x6/0x7 = SysEx termina com 1/2/3 bytes
 */
public class UsbRawLink implements CubeDevice.Link {
    private final UsbDeviceConnection conn;
    private final UsbInterface intf;
    private final UsbEndpoint epOut, epIn;
    private final SysexAssembler rx;
    private final String tag;
    private final int cable;
    private volatile boolean running = true;
    private final Thread reader;

    /** Procura no aparelho uma interface com um par de endpoints (entrada + saída) bulk/interrupt. */
    public static UsbInterface[] candidateInterfaces(UsbDevice d) {
        java.util.List<UsbInterface> midi = new java.util.ArrayList<>(), other = new java.util.ArrayList<>();
        for (int i = 0; i < d.getInterfaceCount(); i++) {
            UsbInterface it = d.getInterface(i);
            if (findEp(it, UsbConstants.USB_DIR_OUT) == null || findEp(it, UsbConstants.USB_DIR_IN) == null) continue;
            if (it.getInterfaceClass() == UsbConstants.USB_CLASS_AUDIO && it.getInterfaceSubclass() == 3) midi.add(it);
            else if (it.getInterfaceClass() == UsbConstants.USB_CLASS_VENDOR_SPEC) other.add(it);
        }
        midi.addAll(other);   // interfaces MIDI de verdade primeiro
        return midi.toArray(new UsbInterface[0]);
    }

    static UsbEndpoint findEp(UsbInterface it, int dir) {
        for (int i = 0; i < it.getEndpointCount(); i++) {
            UsbEndpoint e = it.getEndpoint(i);
            boolean okType = e.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK || e.getType() == UsbConstants.USB_ENDPOINT_XFER_INT;
            if (okType && e.getDirection() == dir) return e;
        }
        return null;
    }

    public UsbRawLink(UsbManager usb, UsbDevice dev, UsbInterface it, int cable) throws IOException {
        this.intf = it;
        this.cable = cable & 0x0F;
        this.tag = "[USB if" + it.getId() + " cabo" + this.cable + "]";
        this.rx = new SysexAssembler(tag);
        epOut = findEp(it, UsbConstants.USB_DIR_OUT);
        epIn = findEp(it, UsbConstants.USB_DIR_IN);
        conn = usb.openDevice(dev);
        if (conn == null) throw new IOException("openDevice falhou (sem permissão USB?)");
        if (!conn.claimInterface(it, true)) { conn.close(); throw new IOException("claimInterface falhou"); }
        CubeDevice.log(tag + " interface aberta: OUT ep" + epOut.getAddress() + " (" + epOut.getMaxPacketSize()
                + "B), IN ep" + epIn.getAddress() + " (" + epIn.getMaxPacketSize() + "B)");
        reader = new Thread(this::readLoop, "usb-midi-rx");
        reader.setDaemon(true);
        reader.start();
    }

    private void readLoop() {
        byte[] buf = new byte[Math.max(64, epIn.getMaxPacketSize())];
        byte[] one = new byte[3];
        while (running) {
            int n = conn.bulkTransfer(epIn, buf, buf.length, 250);
            if (n <= 0) continue;
            if (CubeDevice.traceBytes) {
                byte[] raw = new byte[n];
                System.arraycopy(buf, 0, raw, 0, n);
                CubeDevice.log(tag + " USB pacotes " + n + "B: " + CubeDevice.hex(raw, 64));
            }
            for (int i = 0; i + 4 <= n; i += 4) {
                int cin = buf[i] & 0x0F;
                int len;
                switch (cin) {
                    case 0x4: case 0x7: case 0x3: case 0x8: case 0x9: case 0xA: case 0xB: case 0xE: len = 3; break;
                    case 0x6: case 0x2: case 0xC: case 0xD: len = 2; break;
                    case 0x5: case 0xF: len = 1; break;
                    default: len = 0;     // pacote vazio/reservado
                }
                if (len > 0) { System.arraycopy(buf, i + 1, one, 0, len); rx.feed(one, 0, len); }
            }
        }
    }

    public static byte[] encodeForTest(byte[] sysex) { return encode(sysex, 0); }

    /** Converte um SysEx em pacotes USB-MIDI de 4 bytes. */
    static byte[] encode(byte[] sysex, int cable) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int i = 0, n = sysex.length;
        while (i < n) {
            int left = n - i;
            int take, cin;
            if (left > 3) { take = 3; cin = 0x4; }
            else { take = left; cin = left == 3 ? 0x7 : left == 2 ? 0x6 : 0x5; }
            out.write((cable << 4) | cin);
            for (int k = 0; k < 3; k++) out.write(k < take ? sysex[i + k] : 0);
            i += take;
        }
        return out.toByteArray();
    }

    @Override public void send(byte[] sysex) throws IOException {
        byte[] pk = encode(sysex, cable);
        if (CubeDevice.traceBytes) CubeDevice.log(tag + " TX " + sysex.length + "B " + CubeDevice.hex(sysex, 48));
        int max = Math.max(4, (epOut.getMaxPacketSize() / 4) * 4);
        for (int off = 0; off < pk.length; off += max) {
            int len = Math.min(max, pk.length - off);
            byte[] part = new byte[len];
            System.arraycopy(pk, off, part, 0, len);
            int r = conn.bulkTransfer(epOut, part, len, 1000);
            if (r != len) throw new IOException("falha ao enviar pelo USB (" + r + ")");
        }
    }

    /** Envia bytes "crus" (sem SysEx), 1 por pacote USB-MIDI (CIN 0xF) — só para testes. */
    public void sendRaw(byte[] data) throws IOException {
        CubeDevice.log(tag + " TX bruto " + data.length + "B " + CubeDevice.hex(data, 48));
        byte[] pk = new byte[data.length * 4];
        for (int i = 0; i < data.length; i++) { pk[i * 4] = (byte) ((cable << 4) | 0x0F); pk[i * 4 + 1] = data[i]; }
        int max = Math.max(4, (epOut.getMaxPacketSize() / 4) * 4);
        for (int off = 0; off < pk.length; off += max) {
            int len = Math.min(max, pk.length - off);
            byte[] part = new byte[len];
            System.arraycopy(pk, off, part, 0, len);
            conn.bulkTransfer(epOut, part, len, 1000);
        }
    }

    public long receivedBytes() { return rx.received.get(); }

    @Override public byte[] receive(long timeoutMs) throws InterruptedException { return rx.poll(timeoutMs); }

    @Override public void clear() { rx.clear(); }

    public void close() {
        running = false;
        try { reader.join(400); } catch (InterruptedException ignored) {}
        try { conn.releaseInterface(intf); } catch (Exception ignored) {}
        try { conn.close(); } catch (Exception ignored) {}
    }
}
