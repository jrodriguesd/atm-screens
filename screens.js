const CursorService = require('atm-cursor');
const ScreenTextService = require('atm-screentext');

/**
 * [ScreensService description]
 * @param {[type]} settings [description]
 * @param {[type]} log      [description]
 */
function ScreensService(settings, log, trace){
  this.screens = settings.get('screens');
  if(!this.screens)
    this.screens = {};

  this.cursor = new CursorService();
  this.text = new ScreenTextService(this.cursor);

  this.getColourControlCommandCode = function(code){
    if(code === '00')
      return {'set_blinking': 'off', 'colors': 'default'}
    else if (code === '10')
      return {'set_blinking': 'on'}
    else if (code === '11')
      return {'set_blinking': 'off'}
    else if(code === '80')
      return {'set_background_color': 'transparent'}

    var type;
    switch(code[0]){
      case 'B':
      case '2':
        type = 'set_font_color';
        break;
      case '3':
      case 'C':
        type = 'set_background_color';
        break;
      default:
        if(log)
          log.error('Unsupported colour control ' + code[0] + ' in control ' + code);
        return;
    }    

    var color;
    switch(code[1]){
      case '0':
        color = 'black';
        break;
      case '1':
        color = 'red';
        break;
      case '2':
        color = 'green';
        break;
      case '3':
        color = 'yellow';
        break;
      case '4':
        color = 'blue';
        break;
      case '5':
        color = 'magenta';
        break;
      case '6':
        color = 'cyan';
        break;
      case '7':
        color = 'white';
        break;
      default:
        if(log)
          log.error('Unsupported colour ' + code[1] + ' in control ' + code);
    }

    if(type && color)
      return {[type]: color}
  };

  /**
   * [parseScreen description]
   * @param  {[type]} data [description]
   * @return {[type]}      [description]
   */
  this.parseScreen = function(data){
    var parsed = {};
    if(!data)
      return false;

    parsed.number = data.substr(0, 3);

    var i = 3;

    parsed.actions = [];

    this.text.init();

    while(i < data.length){
      if(data[i] === '\x0c'){
        /**
         * FF control character
         * 
         * Clears the screen and positions the cursor in the
         * top left hand corner of the screen. Sets blinking to
         * ‘off’ and resets foreground and background
         * colours to their defaults. NCR recommends you
         * use the FF (form feed) control character at the
         * start of the screen following an idle screen. This
         * ensures the idle sequence is stopped before the
         * next screen is displayed.
         */
        this.text.init();
        this.cursor.init();
        parsed.actions.push('clear_screen');
        i++;
        continue;
      }

      if(data.substr(i, 3) === '\x1bPE'){
        /**
         * Display Image Files Control
         * This control code allows you to display pictures on the screen, using
         * the following control string
         */
        // parsed.display_image_files_control = true;
        // parsed.image_file = data.substr(i+3).split('\x1b\x5c')[0];
        var image_file = data.substr(i+3).split('\x1b\x5c')[0];
        parsed.actions.push({'display_image': image_file});

        i += ('PE'.length + image_file.length + ('\x1b\x5c').length + 1);
        continue;
      }

      if(data.substr(i, 2) === '\x1b['){
        /**
         * ESC [ m  Screen blinking and colour control 
         * ESC [ z  Changing display in idle
         * ESC [ p  Left margin control
         */

        var j = i + 2;
        var esc_modifier;
        while(j < data.length){
          if(data[j] === 'm' || data[j] === 'z'){
            esc_modifier = data[j];
            break;
          }
          j++;
        }

        switch(esc_modifier){
          case 'm':
            /**
             * ESC [ m  Screen blinking and colour control 
             *
             * The variable length field, separated by ; field separators, can be repeaated up to three times.
             * There should not be a field separator after the last parameter
             */
            data.substr(i + 2, j - i - 2).split(';').forEach( (element) => {
              parsed.actions.push(this.getColourControlCommandCode(element));
            });
            i = j + 1;
            continue;

          case 'z':
            /**
             * ESC [ z  Changing display in idle
             */
            var delay_time = parseInt(data.substr(i + 2, 3)) * 100;   // Delay time in 100 milliseconds interval
            parsed.actions.push({'delay': delay_time});
            i = j + 1;
            continue;
        }
      }

      /**
       * SI Control character
       *
       * 
       */
      if(data[i] === '\x0F'){
        this.cursor.setPosition(data.substr(i+1, 2));
        i += 3;
        continue;
      };


      /**
       * Insert the screen control sequence
       */
      if(data[i] === '\x0e'){
        parsed.actions.push({'insert_screen': data.substr(i + 1, 3)})
        i += 4;
        continue;
      }

      /**
       * ASCII character 
       * 
       */
      if(data[i].charCodeAt(0) >= 32 && data[i].charCodeAt(0) <= 127)
      {
        this.text.add(data[i]);
      }

      i++;
    }

    if(!this.text.isEmpty())
      parsed.actions.push({'add_text': this.text.get()});

    if(this.cursor.cursor_position && this.cursor.cursor_position.x !== undefined && this.cursor.cursor_position.y !== undefined)
      parsed.actions.push({'move_cursor': this.cursor.getPosition()});

    return parsed;
  }

  /**
   * [addScreen description]
   * @param {[type]} screen [description]
   */
  this.addScreen = function(screen){
    var parsed = this.parseScreen(screen);
    if(parsed){
      this.screens[parsed.number] = parsed;
      if(log && trace)
        log.info('\tScreen ' + parsed.number + ' processed (screens overall: ' + Object.keys(this.screens).length + '):' + trace.object(parsed));
      settings.set('screens', this.screens);
      return true;
    }
    else
      return false;
  };

  function setCharAt(str,index,chr) 
  {
    if(index > str.length-1) return str;
    return str.substring(0,index) + chr + str.substring(index+1);
  }

  /**
   * updateScreen description]
   * @param {[type]} screen [description]
   */
  this.updateScreen = function(screen)
  {
    var parsed = this.parseScreen(screen);
    if(parsed)
	{
      var screen_rows = ['@','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O'];  

      // Buscar donde esta el add_text
	  var parsedAddTextIndex = -1;
	  var thisSreenAddTextIndex = -1;
      for (var i=0; i < parsed.actions.length; i++)
	  {
	    if ( typeof(parsed.actions[i]) != undefined )
		  if ( typeof(parsed.actions[i]['add_text']) != 'undefined' )
		  {
              // log.info('JFRD node_modules\\atm-screens\\screens.js Line 258 ' + trace.object(parsed.actions[i]['add_text']) );
			  parsedAddTextIndex = i;
			  break;
		  }
	  }

      // Buscar el add text en la Panttala Almacena (Actual)
      for (var i=0; i < this.screens[parsed.number].actions.length; i++)
	  {
	    if ( typeof(this.screens[parsed.number].actions[i]) != undefined )
		{
		  if ( typeof(this.screens[parsed.number].actions[i]['add_text']) != 'undefined' )
		  {
              // log.info('JFRD node_modules\\atm-screens\\screens.js Line 272 Entro ' + i);
			  thisSreenAddTextIndex = i;
			  break;
		  }
		}
	  }

	  if ( (parsedAddTextIndex >= 0) && (thisSreenAddTextIndex < 0) )
	  {
	      /*
	       * No Encontro el add_text en la Pantalla Actual y hay uno en la nueva
		   * Entonces lo agrego a la de Settings(Actual)
	       */
		  var i = this.screens[parsed.number].actions.length;
          // log.info('JFRD node_modules\\atm-screens\\screens.js Line 285 Entro ' + i);
		  thisSreenAddTextIndex = i;
		  this.screens[parsed.number].actions[i] = parsed.actions[parsedAddTextIndex];
	  }

	  if ( (parsedAddTextIndex >= 0) && (thisSreenAddTextIndex >= 0) )
	  {
	    /*
	     * Si se Encontro el add_text en la Pantalla Actual y hay uno en la nueva
		 * Entonces lo aactualizo a la de Settings(Actual)
	     */
        screen_rows.forEach( (val) => 
	    {
          for (var i=0; i < parsed.actions[parsedAddTextIndex]['add_text'][val].length; i++)
	      {
			var ch = parsed.actions[parsedAddTextIndex]['add_text'][val].charAt(i);
		    if (ch != ' '.charAt(0) )
			{
              // log.info('JFRD node_modules\\atm-screens\\screens.js Line 286 ' + trace.object(this.screens[parsed.number].actions[thisSreenAddTextIndex]['add_text']) );
			  this.screens[parsed.number].actions[thisSreenAddTextIndex]['add_text'][val] = setCharAt(this.screens[parsed.number].actions[thisSreenAddTextIndex]['add_text'][val], i, ch);
			}
		  }
        });
	  }
	  
      // this.screens[parsed.number] = parsed;
      if(log && trace)
        log.info('\tScreen ' + parsed.number + ' processed (screens overall: ' + Object.keys(this.screens).length + '):' + trace.object(parsed));
      settings.set('screens', this.screens);
      return true;
    }
    else
      return false;
  };

  /**
   * [parseDynamicScreenData Parse Dynamic screen data coming from Interactive transaction reply from host.
   *                         As dynamic data comes without screen number, we just appending the fake screen 
   *                         number and parse it as usual]
   * @return {[type]} [parsed screen]
   */
  this.parseDynamicScreenData = function(data){
    var parsed = this.parseScreen('xxx' + data);
    if(parsed)
      parsed.number = 'DYNAMIC';
    return parsed;
  };

  /**
   * [parseScreenDisplayUpdate description]
   * @param  {[type]} data [description]
   * @return {[type]}      [description]
   */
  this.parseScreenDisplayUpdate = function(data){
    /**
     * Screen Display Update. Contains screen numbers and new screen
     * data which can replace existing screen data. The new screen data is
     * displayed when its screen number is referenced during transaction
     * processing.
     * To immediately update a displayed screen, the displayed screen must
     * be the first screen in the screen update data.
     *
     * Screen numbers in the screen update can be specified as four digit
     * numbers in group ʹuʹ (u1234) to load a screen independent of
     * language group. A screen number from group ʹlʹ (l1234) can be
     * specified to load a screen in the current language group. A screen
     * number specified with three decimal digits (123) will be language
     * independent, unless a language has been selected with a group size of
     * 1000 or greater, in which case the screen number will be adjusted for
     * language.
     * The screen update data is in the following format:
     *
     * No.Of Bytes    Content
     * 3, 5 or 6      Screen number
     * Var            Screen data
     * 1              Group separator
     * 4              Reserved
     * 3              Screen number
     * Var            Screen data
     */
      data.split('\x1d').forEach((element) => 
	  {
        if(element[0] === 'u' || element[1] === 'l')
		{
          if(log)
            log.error('Error processing screen ' + element.substr(0, 6) + ': ' + element[0] + '-type screen processing is not supported');
          return false;
        } 
		else 
		{  
          return this.updateScreen(element);
        }
      });
      return true;
  }

  /**
   * [get description]
   * @param  {[type]} screen_number [description]
   * @return {[type]}              [description]
   */
  this.get = function(screen_number){
    return this.screens[screen_number];
  };


  /**
   * [add description]
   * @param {[type]} data [array of data to add]
   * @return {boolean}     [true if data were successfully added, false otherwise]
   */
  this.add = function(data){
    if(typeof data === 'object') {
      for (var i = 0; i < data.length; i++){
        if(!this.addScreen(data[i])){
          if(log)
            log.info('Error processing screen ' + data[i] );
          return false;
        }
      }
      return true;
    } else if (typeof data === 'string') {
      return this.addScreen(data); 
    } 
  }; 
};


module.exports = ScreensService