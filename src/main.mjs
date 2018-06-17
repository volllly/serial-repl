import serialport from 'serialport';
import Delimiter from '@serialport/parser-delimiter';
import inquirer from 'inquirer';
import minimist from 'minimist';


const argv = minimist(process.argv.slice(2));

const port = new serialport(argv._[0], {
  baudRate: 115200,
  autoOpen: false
});

port.open((_error) => {
  if(_error) {
    console.error(_error);
    return;
  }

  const parser = port.pipe(new Delimiter({ delimiter: '$' }));
  
  parser.on('data', (data) => {
    data = `${data.toString()}$`;
    console.log('');
    console.log(data);
    if(autoack.enabled && data !== autoack.until) {
      port.write('#ACK$', (_error) => {
        if(_error) {
          console.error(_error);
        }
      });
    }
  });
  
  let commandstart = '!';
  let autoack = {
    enabled: false,
    until: ''
  };
  (async () => {
    while(true) {
      let answer = await inquirer.prompt({
        type: 'input',
        name: 'cmd',
        message: ''
      });
      if(answer.cmd[0] === commandstart) {
        let cmd = minimist(answer.cmd.slice(commandstart.length).split(' '));
        switch(cmd._[0]) {
          case 'autoack':
            autoack =  {
              enabled: cmd._[1] === 'enabled',
              until: cmd._[2]
            };
            console.log(`! autoack is ${(autoack.enabled) ? `enabled until ${autoack.until}` : 'disabed'}`);
            if(autoack.enabled) {
              port.write('#ACK$', (_error) => {
                if(_error) {
                  console.error(_error);
                }
              });
            }
            break;
          case 'command-start':
            commandstart = cmd._[1];
            break;
          case 'quit':
            process.exit();
            break;
          default:
            console.error(`! unknown command ${cmd}`);
            break;
        }
        continue;
      }
      port.write(answer.cmd, (_error) => {
        if(_error) {
          console.error(_error);
        }
      });
    }
  })();
});