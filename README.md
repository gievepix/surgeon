## Surgeon  
A tera-proxy module that is able to change your character's appearance (race, gender, face slider and voice).  

### Difference to the original
* Cleaned-up codes.
* Can apply and dynamically change different presets to different characters without relogging, whereas the original one caused inconveniences, and has buggy side effects in certain circumstances.
* Removed aesthetic abnormalities and shape changers such as darkan and lachelith because Arborean Apparel.
* Makes gender/race locked classes partially "unlocked" without crashing. (However they will desync, T-Pose or causing unexpected glitches when using skills.)
* Fixed Marrow Brooch glitch which it can revert the appearance back to normal.
* Added auto-update compatibility with [Caali](https://github.com/hackerman-caali)'s tera-proxy.
* Fixed (I hope) crashes when in an emulated room.
  
### Usage  
Automatically loads your character(s) new look whenever you start the game.
  
While in game, open a proxy chat session by typing `/proxy` or `/8` in chat and hitting the space bar.  
This serves as the script's command interface.  
The following commands are supported:  

* `surgeon load [x]` - preview/load the preset with the number **x**.
* `surgeon race` - emulates a race change.
* `surgeon gender` - emulates a gender change.
* `surgeon face` - emulates an appearance change; edits current preset, or creates new one if used with your "true" appearance.
* `surgeon new race` - emulates a race change; creates new preset.
* `surgeon new gender` - emulates a gender change; creates new preset.
* `surgeon new face` - emulates an appearance change; creates new preset.

* `surgeon monster [race] [gender]` - upon relog, game tries to treat your real templateId as specified race and gender if applicable; Allows your character to wear costumes of the current templateId.
* `surgeon monster off` - disable monster mode.
  
Any other input, starting with `surgeon`, will return a summary of above commands in the chat.  
  
### Safety
All operation from this module are clientside, meaning **only you** can see the effects.
Note that race change **will** desync you when using skills unless racial skill movement between old and new races is extremely similar (ie. sorc, gunner). (c) [Pinkie Pie](https://github.com/pinkipi)
Race/Gender inappropriate to the class will cause T-poses, desyncs and unexpected glitches.

### TODO
* Make code less bad (c)
* Rewrite completely, using Caali's tera-game-state library
