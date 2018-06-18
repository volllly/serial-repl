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
    'serial-repl-autoack': {
      enabled: true,
      ack: '#ACK$',
      if: (msg) => {
        return msg === '#DO$';
      }
    }
  }
}