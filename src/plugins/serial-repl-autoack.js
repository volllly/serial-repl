const chalk = require('chalk');

module.exports = class {
  constructor(self, config) {
    this.self = self;
    this.enabled = config.enabled || false;
    this.ack = config.ack || null;
    this.until = config.until || null;
    this.if = config.if || null;
    
    this.last = null;
    this.self.vorpal
      .command('autoack <ENABLED> [ACK] [UNTIL] [IF]', 'automatically acknowledge messages.')
      .option('-l, --last', 'send for the previous command')
      .validate((args) => {
        if(args.ENABLED !== 'enabled' && args.ENABLED !== 'disabled') { return chalk.red('argument 1 must be enabled or disabled'); }
        if(args.ENABLED === 'enabled' && !args.ACK) { return chalk.red('argument 2 must be set if enabled'); }
      })
      .action((cmd, cbk) => {
        this.enabled = cmd.ENABLED === 'enabled';
        this.ack = cmd.ACK;
        this.until = cmd.UNTIL;
        this.if = cmd.IF;
        if(cmd.options.last && this.last) {
          this.rx(this.last);
        }
        cbk();
      });
  }

  rx(msg) {
    this.last = msg;
    if(!this.enabled) { return; }
    /* eslint-disable eqeqeq */
    if(msg === this.until) {
    /* eslint-enable eqeqeq */
      this.enabled = false;
      return;
    }

    if(typeof this.if === 'function') {
      if(!this.if(msg)) { return; }
    } else {
      if(this.if) {
        if(msg !== this.if) { return; }
      }
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
