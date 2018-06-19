const SerialPort = require('serialport');
const Delimiter = require('@serialport/parser-delimiter');
const ByteLength = require('@serialport/parser-byte-length');
const Vorpal = require('vorpal');
const chalk = require('chalk');

const fs = require('fs');
const path = require('path');
const os = require('os');

class SR {
  constructor() {
    this.port = null;
    this.parser = null;
    this.plugindir = './src/plugins';
    this.pluginprefix = 'serial-repl-';

    let configreduce = (a, d) => {
      if(d === '.serialreplrc' ||
          d === '.serialreplrc.json' ||
          d === '.serialreplrc.js') {
        if(d !== '.serialreplrc') {
          if(a === '.serialreplrc' ||
          !a) {
            a = d;
          }
        } else {
          if(!a) {
            a = d;
          }
        }
      }
      return a;
    };
    console.log(process.cwd());
    let configpaths = {
      local: fs.readdirSync(process.cwd()).reduce(configreduce, null),
      user: fs.readdirSync(os.homedir()).reduce(configreduce, null)
    };

    if(configpaths.user) {
      configpaths.user = path.join(os.homedir(), configpaths.user);
      this.config = (!configpaths.user.endsWith('.js')) ? JSON.parse(configpaths.user) : require(configpaths.user);
    }
    if(configpaths.local) {
      configpaths.local = path.join(process.cwd(), configpaths.local);
      let config = (!configpaths.local.endsWith('.js')) ? JSON.parse(configpaths.local) : require(configpaths.local);
      this.config = {
        options: Object.assign(this.config.options, config.options),
        rx: Object.assign(this.config.rx || {}, config.rx || {}),
        tx: Object.assign(this.config.tx || {}, config.tx || {}),
        plugins: Object.assign(this.config.plugins || {}, config.plugins || {})
      };
    }

    this.options = {
      port: this.config.options.port || undefined,
      baudRate: this.config.options.baudRate || 9600,
      dataBits: this.config.options.dataBits || 8,
      stopBits: this.config.options.stopBits || 1,
      parity: this.config.options.parity || 'none',
      parse: this.config.options.parse || {
        type: 'bytes',
        option: 1
      }
    };

    this.vorpal = Vorpal();

    this.vorpal
      .mode('repl', 'enter a repl mode where everything is sent.')
      .delimiter('repl')
      .init((args, cbk) => {
        this.vorpal.log('type `exit` to exit repl mode');
        cbk();
      })
      .action((cmd, cbk) => {
        this.tx(cmd, cbk);
      });

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
    for(let p in this.config.plugins) {
      let name = `${this.pluginprefix}${p}`;
      if(fs.existsSync(`${this.plugindir}/${this.pluginprefix}${p}.js`)) {
        this.plugins[name] = new (require(`.${this.plugindir}/${this.pluginprefix}${p}.js`))(this, this.config.plugins[name.slice(this.pluginprefix.length)] || {});
      } else {
        //Error
      }
    }
    /* for(let d of fs.readdirSync(this.plugindir)) {
      let name = path.basename(d, '.js');
      this.plugins[name] = new (require(`.${this.plugindir}/${d}`))(this, this.config.plugins[name.slice(this.pluginprefix.length)] || {});
    } */

    this.vorpal
      .delimiter('undefined')
      .history('serial-repl.paul.volavsek.com')
      .show();
  }

  caller(path, args) {
    let a = args;
    for(let p in this.plugins) {
      if(this.config[path][p.slice(this.pluginprefix.length)]) {
        a = this.config[path][p](...a) || args;
      }
      a = this.plugins[p][path](...a) || args;
    }
    return a;
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
        }
        this.vorpal.delimiter(this.options.port);
        this.setparser();
        cbk && cbk();
      });
    };

    if(!this.options.port) {
      cbk && cbk();
      return;
    }

    if(this.port) {
      this.port.close((_error) => {
        if(_error) {
          this.error(_error);
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
    if(this.config.tx.main) { msg = this.config.tx.main(msg); }
    [msg] = this.caller('tx', [msg]) || [msg];

    this.port.write(msg, (_error) => {
      if(_error) {
        this.error(_error);
      }
      cbk && cbk();
    });
  }

  rx(msg) {
    msg = `${msg.toString()}${(this.options.parse.type === 'delimiter') ? this.options.parse.option : ''}`;

    if(this.config.rx.main) { msg = this.config.rx.main(msg); }
    [msg] = this.caller('rx', [msg]) || [msg];

    this.vorpal.log(`${this.options.port} ${chalk.cyan(`rx ${msg}`)}`);
  }

  error(error) {
    this.vorpal.log(chalk.red(`error: ${error}`));
  }
}

/* eslint-disable no-new */
new SR();
/* eslint-enable no-new */
