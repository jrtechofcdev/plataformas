/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Ponte entre a tela (JavaScript) e o Java (MainActivity.java).
   No celular: CubeNative.call(id, metodo, json) e a resposta volta em window.cubeResolve.
   Fora do celular (abrindo o index.html no PC) roda um simulador, para testes. */
"use strict";
var CR = window.CR || (window.CR = {});

(function () {
  var nextId = 1;
  var waiting = new Map();
  var listeners = {};

  CR.on = function (name, fn) { (listeners[name] = listeners[name] || []).push(fn); };
  CR.emit = function (name, data) { (listeners[name] || []).forEach(function (fn) { fn(data); }); };

  window.cubeResolve = function (id, ok, data) {
    var w = waiting.get(id);
    if (!w) return;
    waiting.delete(id);
    if (ok) w.resolve(data); else w.reject(new Error(data));
  };
  window.cubeEvent = function (name, data) { CR.emit(name, data); };
  window.cubeLog = function (chunk) { CR.emit("log", chunk); };
  window.cubePitch = function (hz, clarity, rms) { CR.emit("pitch", { hz: hz, clarity: clarity, rms: rms }); };
  window.cubeTunerError = function (msg) { CR.emit("tunerError", msg); };
  window.cubeTunerState = function (src) { CR.emit("tunerState", src); };

  CR.isDevice = !!window.CubeNative;

  CR.native = function (method, args) {
    return new Promise(function (resolve, reject) {
      var id = "c" + nextId++;
      waiting.set(id, { resolve: resolve, reject: reject });
      (window.CubeNative || Mock).call(id, method, JSON.stringify(args || {}));
    });
  };

  /* ---------------------------------------------------------------- simulador */
  var FACTORY = [[2, 4, 10, 4, 31, 38, 31, 19, 7, 8, 1, 1, 1, 0, 0, 0],
                 [6, 3, 10, 0, 31, 12, 31, 16, 7, 8, 1, 1, 1, 0, 0, 0],
                 [0, 5, 11, 0, 31, 32, 31, 19, 7, 8, 1, 1, 1, 0, 0, 0]];
  var Mock = {
    presets: FACTORY.map(function (r) { return r.slice(); }),
    loop: false, on: false, log: [], tunerTimer: null,
    state: function () {
      return this.on ? { state: "on", mock: true, model: "Cube Baby", name: "SINCO-CubeBaby",
        version: "01.13.14.15.16.17.18.19", productId: "0x4F06", generation: 2, irWritable: true,
        device: "Simulador", presets: JSON.parse(JSON.stringify(this.presets)), loopback: this.loop }
        : { state: "off", message: "Simulador desligado" };
    },
    call: function (id, m, json) {
      var a = JSON.parse(json), self = this;
      setTimeout(function () {
        var r = true;
        switch (m) {
          case "connect":
            window.cubeEvent("status", { state: "search", message: "" });
            setTimeout(function () { self.on = true; window.cubeEvent("status", self.state()); }, 400);
            break;
          case "state": r = self.state(); break;
          case "param": self.presets[a.preset][a.offset] = a.value; self.log.push(a); break;
          case "presets": r = self.presets; break;
          case "sendPreset": self.presets[a.preset] = a.values.slice(); r = JSON.parse(JSON.stringify(self.presets)); break;
          case "factoryPresets": self.presets = FACTORY.map(function (x) { return x.slice(); }); r = self.presets; break;
          case "loopback": r = self.loop = a.on; break;
          case "getLog": r = "[simulador] log\n"; break;
          case "audioInputs": r = [{ id: "mic", name: "Microfone do celular" }, { id: "usb", name: "Entrada USB (simulada)" }]; break;
          case "appInfo": r = { version: "2.0.0", android: "simulador", device: "navegador" }; break;
          case "tunerStart": self.startTuner(a.source); break;
          case "tunerStop": clearInterval(self.tunerTimer); self.tunerTimer = null; break;
          default: break;
        }
        if (window.cubeLog && m !== "getLog" && m !== "haptic") window.cubeLog("[simulador] " + m + " " + json + "\n");
        window.cubeResolve(id, true, r);
      }, 25);
    },
    /* afinador simulado: passeia pelas 6 cordas, começando desafinado e chegando no ponto */
    startTuner: function (src) {
      clearInterval(this.tunerTimer);
      var strings = [82.41, 110, 146.83, 196, 246.94, 329.63], t = 0;
      window.cubeTunerState(src === "usb" ? "usb" : "mic");
      this.tunerTimer = setInterval(function () {
        t++;
        var s = strings[Math.floor(t / 60) % 6];
        var phase = (t % 60) / 60;
        var cents = phase < 0.8 ? (1 - phase / 0.8) * -35 : 0.5;
        window.cubePitch(s * Math.pow(2, cents / 1200), 0.97, 0.05);
      }, 45);
    },
  };
  CR.Mock = Mock;
})();
