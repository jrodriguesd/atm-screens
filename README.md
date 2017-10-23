# atm-screens

ATM Screens Service implementation, used by [Electron ATM](https://github.com/timgabets/electron-atm) application. The module may be used for NDC ATM screens parsing and processing. 

## To use:
```javascript
const ScreensService = require('atm-screens');

var s = new StatesService();
s.s.parseScreen('000\x0c\x1bPEPIC000.jpg\x1b\x5c\x0FFO')
> Object({
  number: '000',
  actions: [ 
    'clear_screen', 
    Object({ display_image: 'PIC000.jpg' }), 
    Object({ move_cursor: Object({ x: 'O', y: 'F' }) }) 
  ]
});
```


