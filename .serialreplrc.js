module.exports = {
  options: {
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
          return ['M', 'L', 'C'].includes(msg[0]);
        }
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