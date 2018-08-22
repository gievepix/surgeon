## Surgeon  
A tera-proxy module that is able to change your character's appearance (race, gender, face slider and voice).
  
### Usage  
Automatically loads your character(s) new look whenever you start the game.
  
While in game, open a proxy chat session by typing `/proxy` or `/8` in chat and hitting the space bar.  
This serves as the script's command interface.  
The following commands are supported:  

* `surgeon load [x]` - (Default: 0) load the preset with the number **x**. 0 will revert to your original appearance.
* `surgeon lock` - (Default: off) Toggles whether or not the your character should change their race and gender when using presets.
* `surgeon costumes` - (Default: off) Toggles whether or not your character's costumes should be applied on your preset. Note that if it's enabled, your character may turn into some creatures from Cthulhu Mythos. (ie: Using a Baraka preset on your Elin)

* `surgeon race` - emulates a race change.
* `surgeon gender` - emulates a gender change.
* `surgeon face` - emulates an appearance change; edits current preset, or creates new one if used with your "true" appearance.
* `surgeon new race` - emulates a race change; creates new preset.
* `surgeon new gender` - emulates a gender change; creates new preset.
* `surgeon new face` - emulates an appearance change; creates new preset.
  
Any other input, starting with `surgeon`, will return a summary of above commands in the chat.  
  
### Safety & Issues
All operation from this module are clientside, meaning **only you** can see the effects.
Note that race change **will** desync you when using skills unless racial skill movement between old and new races is extremely similar (ie. sorc, gunner).
Race/Gender inappropriate to the class will cause T-poses, desyncs and unexpected glitches.
Use the lock command to prevent desyncs when using presets.

After using shape changers, you need to relog to apply them on the used presets.

### TODO
* Make code less bad (c)
* Find a way to re-register shape without relog.

### CREDITS
* TeraProxy - Original module author.
* XionUzuki - Heavily refining codes and features from the original.
* gievepix - More refined codes and emulated room crash fixes.
* PinkiePi - To make note about the desyncs. Also suggested emulating ninja's transform skill to change race/gender/appearances.
* codeagon - Suggested emulating ninja's transform skill to change race/gender/appearances and possible marrow brooch fixes.
* Caali - For the convenient auto-updates and tera-game-states library.

