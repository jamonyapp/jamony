declare module "lamejs" {
  class Mp3Encoder {
    constructor(channels: number, sampleRate: number, kbps: number)
    encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array
    flush(): Int8Array
  }
}

// window.lamejs — 由 public/lame.min.js IIFE 注入
interface Window {
  lamejs: {
    Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => {
      encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array
      flush(): Int8Array
    }
  }
}
