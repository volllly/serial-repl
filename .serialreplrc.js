module.exports = {
  options: {
    port: 'COM1',
    baudRate: 115200,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    parse: {
      type: 'delimiter',
      option: '$'
    }
  },
  rx: {
    main: (msg) => {
      return msg;
    }
  },
  plugins: {
    autoack: {
      enabled: true,
      ack: 'ACK',
      if: (msg) => {
        return msg[1] === 'M' || msg[1] === 'L' || msg[1] === 'C';
      }
    },
    ptk: {
      enabled: true,
      start: '#',
      separator: ':',
      end: '$',
      number: '%'
    }
  }
}