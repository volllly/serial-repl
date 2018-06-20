#!/usr/bin/env node
const SerialPort = require('serialport');
const Delimiter = require('@serialport/parser-delimiter');
const ByteLength = require('@serialport/parser-byte-length');
const Vorpal = require('vorpal');
const chalk = require('chalk');
const merge = require('assign-deeply');

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

      this.config = merge(this.config, config);
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
    this.pluginorder = {
      tx: {
        last: []
      },
      rx: {
        last: []
      }
    };
    let unfoundplugins = [];
    for(let p in this.config.plugins) {
      let name = `${this.pluginprefix}${p}`;
      if(fs.existsSync(`${this.plugindir}/${this.pluginprefix}${p}.js`)) {
        this.plugins[name] = new (require(`.${this.plugindir}/${this.pluginprefix}${p}.js`))(this, this.config.plugins[name.slice(this.pluginprefix.length)].config || {});
        if(this.config.plugins[name.slice(this.pluginprefix.length)].order) {
          if(!this.pluginorder.tx[this.config.plugins[name.slice(this.pluginprefix.length)].order.tx]) { this.pluginorder.tx[this.config.plugins[name.slice(this.pluginprefix.length)].order.tx] = name; }
          if(!this.pluginorder.rx[this.config.plugins[name.slice(this.pluginprefix.length)].order.rx]) { this.pluginorder.rx[this.config.plugins[name.slice(this.pluginprefix.length)].order.rx] = name; }
          continue;
        }
        this.pluginorder.tx.last.push(name);
        this.pluginorder.rx.last.push(name);
      } else {
        unfoundplugins.push(p);
      }
    }
    for(let p of unfoundplugins) {
      this.error(`plugin "${p}" not found`);
    }

    this.vorpal
      .delimiter('undefined')
      .history('serial-repl.paul.volavsek.com')
      .show();
  }

  caller(path, args) {
    let callorder = [];
    let docall = (plugin) => {
      if(this.config[path] && this.config[path][plugin.slice(this.pluginprefix.length)]) {
        args = this.config[path][plugin](...args) || args;
      }
      if(this.plugins[plugin][path]) {
        args = this.plugins[plugin][path](...args) || args;
      }
    };
    for(let i in Object.keys(this.pluginorder[path]).filter((i) => !isNaN(i)).sort((a, b) => {
      if(Number(a) > Number(b)) { return 1; }
      if(Number(a) < Number(b)) { return -1; }
      return 0;
    })) {
      if(!i) { continue; }
      callorder.push(this.pluginorder[path][i]);
    }
    callorder.push(...this.pluginorder[path].last);
    for(let p of callorder) {
      docall(p);
    }
    return args;
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
          this.port = null;
          this.error(_error);
          this.vorpal.delimiter('undefined');
          cbk && cbk();
          return;
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
          this.port = null;
          this.error(_error);
        }
        cnt();
      });
    } else {
      cnt();
    }
  }

  setparser() {
    if(!this.port) {
      this.error('serialport not connected');
      return;
    }
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

  tx(msg, cbk) {
    if(this.config.tx && this.config.tx.main) { msg = this.config.tx.main(msg); }
    [msg] = this.caller('tx', [msg]) || [msg];

    if(!this.port) {
      this.error('serialport not connected');
      return;
    }

    this.port.write(msg, (_error) => {
      if(_error) {
        this.error(_error);
      }
      cbk && cbk();
    });
  }

  rx(msg) {
    msg = `${msg.toString()}${(this.options.parse.type === 'delimiter') ? this.options.parse.option : ''}`;

    if(this.config.rx && this.config.rx.main) { msg = this.config.rx.main(msg); }
    [msg] = this.caller('rx', [msg]) || [msg];

    this.vorpal.log(`${this.options.port} ${chalk.cyan(`rx ${msg}`)}`);
  }

  error(error) {
    this.vorpal.log(chalk.red(error));
  }
}

/* eslint-disable no-new */
new SR();
/* eslint-enable no-new */
