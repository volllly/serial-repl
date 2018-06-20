module.exports = {
  options: {
    port: 'COM3',
    baudRate: 115200,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    parse: {
      type: 'delimiter',
      option: '$'
    }
  },
  plugins: {
    autoack: {
      config: {
        enabled: true,
        ack: 'ACK',
        if: (msg) => {
          return msg[1] === 'M' || msg[1] === 'L' || msg[1] === 'C';
        }
      },
      order: {
        tx: 1,
        rx: 1
      }
    },
    ptk: {
      config: {
        enabled: true,
        start: '#',
        separator: ':',
        end: '$',
        number: '%'
      },
      order: {
        tx: 0,
        rx: 0
      }
    }
  }
}