const chalk = require('chalk');

module.exports = class {
  constructor(self) {
    this.self = self;
    this.enabled = false;
    this.ack = null;
    this.until = null;

    this.last = null;
    this.self.vorpal
      .command('autoack <ENABLED> [ACK] [UNTIL]', 'automatically acknowledge messages.')
      .option('l, last', 'send for the previous command')
      .validate((args) => {
        if(args.ENABLED !== 'enabled' && args.ENABLED !== 'disabled') { return chalk.red('argument 1 must be enabled or disabled'); }
        if(args.ENABLED !== 'enabled' && !args.ACK) { return chalk.red('argument 2 must be set if enabled'); }
      })
      .action((cmd, cbk) => {
        this.enabled = cmd.ENABLED === 'enabled';
        this.ack = cmd.ACK;
        this.until = cmd.UNTIL;
        if(cmd.options.last && this.last) {
          this.rx(this.last);
        }
        cbk();
      });
  }

  rx(msg) {
    this.last = msg;
    if(!this.enabled) { return; }
    if(msg === this.until) {
      this.enabled = false;
      return;
    }
    this.self.port.write(this.ack, (_error) => {
      if(_error) {
        this.self.error(_error);
      }
    });
  }

  tx(msg) {

  }
};
