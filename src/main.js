const SerialPort = require('serialport');
const Delimiter = require('@serialport/parser-delimiter');
const ByteLength = require('@serialport/parser-byte-length');
const Vorpal = require('vorpal');
const chalk = require('chalk');

const fs = require('fs');
const path = require('path');

class SR {
  constructor() {
    this.port = null;
    this.parser = null;
    this.plugindir = './src/plugins';

    this.options = {
      port: undefined,
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      parse: {
        type: 'bytes',
        option: 1
      }
    };

    this.vorpal = Vorpal();

    this.vorpal
      .mode('repl', 'enter a repl mode where everything is sent.')
      .delimiter('>')
      .init((args, cbk) => {
        this.vorpal.log('type `exit` to exit repl mode');
        cbk();
      })
      .action(this.tx);

    this.vorpal
      .command('tx [message...]', 'send a string.')
      .parse((cmd) => {
        let i = cmd.indexOf(' ');
        if(i > 0) {
          this.tx(cmd.slice(i + 1));
          return cmd;
        }
      })
      .action((cmd, cbk) => {
        cbk();
      });

    this.vorpal
      .command('connect', 'send a string.')
      .option('-p, --port <PORT>')
      .option('-b, --baud-rate <BAUDRATE>')
      .option('-d, --data-bits <BITS>')
      .option('-s, --stop-bits <BITS>')
      .option('-r, --parity <PARITY>', ['none', 'even', 'mark', 'odd', 'space'])
      .option('--bytes <BYTES>')
      .option('--delimiter <DELIMITER>')
      .validate((args) => {
        if(args.options['parity'] && !['none', 'even', 'mark', 'odd', 'space'].includes(args.options['parity'])) { return chalk.red('allowed parity modes are: "none", "even", "mark", "odd" and "space".'); }
        if(args.options['baud-rate'] && isNaN(Number(args.options['baud-rate']))) { return chalk.red('baud-rate has to be a number'); }
        if(args.options['data-bits'] && isNaN(Number(args.options['data-bits']))) { return chalk.red('data-bits has to be a number'); }
        if(args.options['stop-bits'] && isNaN(Number(args.options['stop-bits']))) { return chalk.red('stop-bits has to be a number'); }
        if(args.options['parity'] && isNaN(Number(args.options['parity']))) { return chalk.red('parity has to be a number'); }
        if(args.options['bytes'] && args.options['delimiter']) { return chalk.red('only one parser allowed'); }
        if(args.options['bytes'] && isNaN(Number(args.options['bytes']))) { return chalk.red('bytes has to be a number'); }
      })
      .action((cmd, cbk) => {
        this.options.port = cmd.options['port'] || this.options.port;
        this.options.baudRate = cmd.options['baud-rate'] || this.options.baudRate;
        this.options.dataBits = cmd.options['data-bits'] || this.options.dataBits;
        this.options.stopBits = cmd.options['stop-bits'] || this.options.stopBits;
        this.options.parity = cmd.options['parity'] || this.options.parity;
        if(cmd.options['bytes']) {
          this.options.parse = {
            type: 'bytes',
            option: cmd.options['bytes']
          };
        }
        if(cmd.options['delimiter']) {
          this.options.parse = {
            type: 'delimiter',
            option: cmd.options['delimiter']
          };
        }
        this.connect(cbk);
      });

    this.vorpal
      .command('parser', 'set parser.')
      .option('--bytes <BYTES>')
      .option('--delimiter <DELIMITER>')
      .validate((args) => {
        if(args.options['bytes'] && args.options['delimiter']) { return chalk.red('only one parser allowed'); }
        if(args.options['bytes'] && isNaN(Number(args.options['bytes']))) { return chalk.red('bytes has to be a number'); }
      })
      .action((cmd, cbk) => {
        if(cmd.options['bytes']) {
          this.options.parse = {
            type: 'bytes',
            option: cmd.options['bytes']
          };
        }
        if(cmd.options['delimiter']) {
          this.options.parse = {
            type: 'delimiter',
            option: cmd.options['delimiter']
          };
        }
        this.setparser();
        cbk();
      });

    this.plugins = [];
    for(let d of fs.readdirSync(this.plugindir)) {
      this.plugins[path.basename(d, '.js')] = new (require(`.${this.plugindir}/${d}`))(this);
    }

    this.vorpal
      .delimiter(this.options.port || 'undefined')
      .history('serial-repl.paul.volavsek.com')
      .show();
  }

  caller(path, args) {
    for(let p in this.plugins) {
      this.plugins[p][path](...args);
    }
  }
  connect(cbk) {
    let cnt = () => {
      this.port = new SerialPort(this.options.port, {
        autoOpen: false,
        baudRate: 115200,
        dataBits: this.options.dataBits,
        stopBits: this.options.stopBits,
        parity: this.options.parity
      });

      if(!this.options.port) {
        cbk && cbk();
        return;
      }

      this.port.open((_error) => {
        if(_error) {
          this.error(_error);
          cbk && cbk();
          return;
        }
        this.vorpal.delimiter(this.options.port);
        this.setparser();
        cbk && cbk();
      });
    };

    if(this.port) {
      this.port.close((_error) => {
        if(_error) {
          this.error(_error);
          cbk && cbk();
          return;
        }
        cnt();
      });
    } else {
      cnt();
    }
  }

  setparser() {
    switch(this.options.parse.type) {
      case 'bytes':
        this.parser = this.port.pipe(new ByteLength({ length: this.options.parse.option }));
        break;
      case 'delimiter':
        this.parser = this.port.pipe(new Delimiter({ delimiter: this.options.parse.option }));
        break;
    }
    this.parser.on('data', (msg) => { this.rx(msg); });
  }

  loaded() {

  }

  tx(msg, cbk) {
    this.caller('tx', [msg]);

    this.port.write(msg, (_error) => {
      if(_error) {
        this.error(_error);
      }
      cbk && cbk();
    });
  }

  rx(msg) {
    msg = `${msg.toString()}${(this.options.parse.type === 'delimiter') ? this.options.parse.option : ''}`;

    this.caller('rx', [msg]);

    this.vorpal.log(`${this.options.port} rx ${msg}`);
  }

  error(error) {
    this.vorpal.log(chalk.red(`error: ${error}`));
  }
}

new SR();
