const chalk = require('chalk');
const minimist = require('minimist');

module.exports = class {
  constructor(self, config) {
    this.self = self;

    this.enabled = config.enabled || false;
    this.start = config.start || false;
    this.separator = config.separator || false;
    this.end = config.end || false;
    this.number = config.number || false;

    this.self.vorpal
      .command('ptk <ENABLED> [START] [SEPARATOR] [END] [NUMBER]', 'send commands via a protocoll.')
      .validate((args) => {
        if(args.ENABLED !== 'enabled' && args.ENABLED !== 'disabled') { return chalk.red('argument 1 must be enabled or disabled'); }
      })
      .action((cmd, cbk) => {
        this.enabled = cmd.ENABLED === 'enabled';
        this.start = cmd.START || false;
        this.separator = cmd.SEPARATOR || false;
        this.end = cmd.END || false;
        this.number = cmd.NUMBER || false;
        cbk();
      });
  }

  rx(msg) {
    if(msg[0] !== this.start) {
      this.self.error('wrong start char');
      return;
    }
    if(msg[msg.length - 1] !== this.end) {
      this.self.error('wrong end char');
      return;
    }

    return [msg.slice(1, -1).split(this.separator).join(' ')];
  }

  tx(msg) {
    let cmd = minimist(msg.split(' '))._.map((c) => {
      if(c[0] === this.number) {
        if(c[1] === this.number) {
          return c.slice(1);
        }
        return Number(c.slice(1));
      }
      return c;
    }).reduce((a, c) => { return a + c + this.separator; }, this.start);
    cmd = `${cmd.slice(0, -1)}${this.end}`;
    return [cmd];
  }
};
