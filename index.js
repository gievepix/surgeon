const path = require('path'),
	fs = require('fs'),
	Command = require('command'),
	GameState = require('tera-game-state');

module.exports = function Surgeon(dispatch) {
	const command = Command(dispatch),
		game = GameState(dispatch);

	let userinfo = { real: {}, fake: {}, costumes: {} },
		OnLogin = false,
		inSurgeonRoom = false,
		inLobby = false,
		leaveRoom = false,
		newpreset = false,
		marrow = false,
		charId,
		customApp = {},
		userListHook

	try {
		customApp = require('./presets.json');
		UpdatePresets();
	} catch(e) {
		try {
			customApp = require('./app.json');
			UpdatePresets();
			fs.renameSync(path.join(__dirname, 'app.json'), path.join(__dirname, 'presets.json'));
		} catch(e) { customApp = {version: 2, characters: {}, monsters: {}, presets: []}; }
	}

	function UpdatePresets() {
		if (!customApp.version) customApp.version = 1	// initialize the preset version to 1 if it does not exist
		if (!customApp.monsters) Object.assign(customApp, { monsters: {} })
		for (let i in customApp.presets) {
			if (customApp.presets[i].app) {	// rename app to appearance
				customApp.presets[i].appearance = customApp.presets[i].app;
				delete customApp.presets[i].app;
			}
			if (customApp.presets[i].details.data) {	// older version; change the array typed details to hex
				let retbuffer = customApp.presets[i].details.data;
				delete customApp.presets[i].details;
				customApp.presets[i].details = Buffer.from(retbuffer).toString('hex');
			}
		}
		saveCustom();
	}

	// ############# //
	// ### Hooks ### //
	// ############# //

	dispatch.hook('S_LOGIN', 10, { order: 999 }, event => {
		OnLogin = false;
		inLobby = false;
		inSurgeonRoom = false;
		newpreset = false;
		marrow = false;
		userinfo = { real: {}, fake: {}, costumes: {} }
		Object.assign(userinfo.real, {
			playerId: game.me.playerId,
			name: game.me.name,
			race: Math.floor((game.me.templateId - 10101) / 200),
			gender: Math.floor((game.me.templateId - 10101) / 100) % 2,
			class: (game.me.templateId % 100) - 1,
			appearance: event.appearance,
			details: event.details,
			shape: event.shape
		});
		Object.assign(userinfo.fake, userinfo.real);
		if (customApp.monsters[game.me.name]) {
			let mon = customApp.monsters[game.me.name]
			event.templateId = fixModel(mon.race, userinfo.real.race, mon.gender, userinfo.real.class);
			return true;
		}
	});
	
	dispatch.hook('S_SPAWN_ME', 3, event => {
		if (game.me.is(event.gameId)) {
			if (customApp.characters[game.me.name]) EmulateExternalChange();
			if (!OnLogin) {
				OnLogin = true;
				if (customApp.characters[game.me.name]) command.message('Using preset '+customApp.characters[game.me.name]);
				if (customApp.monsters[game.me.name]) command.message('Monster mode enabled. (race '+customApp.monsters[game.me.name].race
				+' gender: '+customApp.monsters[game.me.name].gender+')');
			}
		}
 	});

	dispatch.hook('S_USER_EXTERNAL_CHANGE', 6, { order: 999, filter: { fake: null }}, (event) => {
		if (game.me.is(event.gameId)) {
			Object.assign(userinfo.costumes, event)
			if (customApp.monsters[game.me.name]) {
				ChangeAppearance(customApp.characters[game.me.name] - 1, marrow);
			} else if (customApp.characters[game.me.name]) {
				ChangeAppearance(customApp.characters[game.me.name] - 1, marrow);
				return false;
			}
		}
 	});

	// Marrow brooch fix
	dispatch.hook('S_UNICAST_TRANSFORM_DATA', 3, { order: -1 }, event => {
		if(game.me.is(event.gameId) && customApp.characters[game.me.name]){
			marrow = (event.unk1 ? true : false)
			EmulateExternalChange();
			return false
		}
 	});

	dispatch.hook('S_GET_USER_LIST', 14, { order: -1 }, (event) => {
        for (let indexx in event.characters) {
			let charname = event.characters[indexx].name
			checkMeincustomApp(charname)
			if(customApp.characters[charname]){
				let currpreset = customApp.presets[customApp.characters[charname] - 1]
				let fix = fixModel(currpreset.race, -1, currpreset.gender, event.characters[indexx].class)
				event.characters[indexx].race = Math.floor((fix - 10101) / 200)
				event.characters[indexx].gender = Math.floor((fix - 10101) / 100) % 2
				event.characters[indexx].class = (fix - 10101) % 100
				event.characters[indexx].appearance = currpreset.appearance
				event.characters[indexx].details = Buffer.from(currpreset.details, 'hex')
			}
		}
		return true
    });

	dispatch.hook('C_CANCEL_CHANGE_USER_APPEARANCE', 1, event => {
		if (inSurgeonRoom) {
			inSurgeonRoom = false;
			dispatch.send('S_END_CHANGE_USER_APPEARANCE', 1, {
				ok: 0,
				unk: 0
			});
			if (inLobby) dispatch.send('C_SELECT_USER', 1, { id: charId, unk: 0 });	// 2nd part of ugliness 
			else leaveRoom = true;
			return false;
		}
	});

	dispatch.hook('C_COMMIT_CHANGE_USER_APPEARANCE', 1, event => {
		if (inSurgeonRoom) {
			inSurgeonRoom = false;
			dispatch.send('S_END_CHANGE_USER_APPEARANCE', 1, {
				ok: 1,
				unk: 0
			});
			if (newpreset || !customApp.characters[userinfo.real.name]) {
				newpreset = false;
				customApp.presets.push({
					race: event.race,
					gender: event.gender,
					appearance: event.appearance,
					details: event.details.toString('hex')
				});
				customApp.characters[userinfo.real.name] = customApp.presets.length;
			} else {
				customApp.presets[customApp.characters[userinfo.real.name] - 1].race = event.race;
				customApp.presets[customApp.characters[userinfo.real.name] - 1].gender = event.gender;
				customApp.presets[customApp.characters[userinfo.real.name] - 1].appearance = event.appearance;
				customApp.presets[customApp.characters[userinfo.real.name] - 1].details = event.details.toString('hex');
			}
			saveCustom();
			if (inLobby) dispatch.send('C_SELECT_USER', 1, { id: charId, unk: 0 }); // same as above
			else leaveRoom = true;
			return false;
		}
	});

	// ################# //
	// ### Functions ### //
	// ################# //

	function SurgeonRoom(room, itemid) {
		if (room == 2 && (userinfo.fake.race == 4 || userinfo.fake.race == 5)) {
			command.message('Popori, Elin and Baraka are ineligible for gender change');
			return;
		}
		
		dispatch.send('C_RETURN_TO_LOBBY', 1, {});
		let prepareLobbyHook = dispatch.hookOnce('S_PREPARE_RETURN_TO_LOBBY', 1, () => {
			inSurgeonRoom = true;
			dispatch.toClient('S_START_CHANGE_USER_APPEARANCE', 2, {
				type: room,
				playerId: userinfo.real.playerId,
				gender: userinfo.fake.gender,
				race: userinfo.fake.race,
				class: userinfo.fake.class,
				weapon: userinfo.costumes.weaponModel,
				chest: userinfo.costumes.body,
				gloves: userinfo.costumes.hand,
				boots: userinfo.costumes.feet,
				innerwear: userinfo.costumes.underwear,
				appearance: (room == 3 ? userinfo.fake.appearance : 0),
				weaponEnchantment: userinfo.costumes.weaponEnchant,
				item: itemid,
				details: userinfo.fake.details,
				details2: userinfo.real.shape
			})

			userListHook = dispatch.hook('*', 'raw', { order: 999, filter: { incoming: true }}, () => {
				return false;
			});
			
			// to prevent unpredictable behavior if you try to leave room before server sends you character list
			// (looks ugly af, but i have no any idea how to implement this in a different way)
			// actually, it doesn't make much sense because it takes half of this time to load the room (maybe it'll be faster on ssd)
			dispatch.hookOnce('S_GET_USER_LIST', 14, { order: -999 }, event => {
				inLobby = true;
				dispatch.unhook(userListHook);
				event.characters.forEach(character => {
					if (character.name === userinfo.real.name) charId = character.id;
				});
				
				if (leaveRoom) {
					dispatch.send('C_SELECT_USER', 1, { id: charId, unk: 0 });
					leaveRoom = false;
				}
				return false;
			});

			setTimeout(() => {
				if (userListHook) dispatch.unhook(userListHook);
			}, 10000);
		});
		
		setTimeout(() => {
			if (prepareLobbyHook) dispatch.unhook(prepareLobbyHook);
		}, 5000);
	}
	
	function checkMeincustomApp(p) {
		if (customApp.characters[p] == null) customApp.characters[p] = 0
		if (customApp.characters[p] > customApp.presets.length) customApp.characters[p] = 0
		if (customApp.monsters[p] == null) customApp.monsters[p] = false
	}

	function fixModel(race, rr, gender, job) {
		let cmodel = 10101 + (race * 200) + (gender == 1 ? 100 : 0) + job
		switch (job) {  
		// 101xx/102xx Human, 103xx/104xx High Elf, 105xx/106xx Aman, 107xx/108xx Castanic, 109xx/110xx Popori/Elin, 111xx Baraka
		// 0 warrior, 1 lancer, 2 slayer, 3 berserker, 4 sorcerer, 5 archer, 6 priest, 7 elementalist/mystic
			case 8: //soulless/reaper
				if (cmodel != 11009) {
					cmodel = 10101 + ((rr >= 0 ? rr : race) * 200) + (gender == 1 ? 100 : 0) + (rr >= 0 ? job : 0)
				}
				break
			case 9: //engineer/gunner
				if (cmodel != 10410 && cmodel != 10810 && cmodel != 11010) {
					cmodel = 10101 + ((rr >= 0 ? rr : race) * 200) + (gender == 1 ? 100 : 0) + (rr >= 0 ? job : 5)
				}
				break
			case 10: //fighter/brawler
				if (cmodel != 10111 && cmodel != 10211 && cmodel != 11011) {
					cmodel = 10101 + ((rr >= 0 ? rr : race) * 200) + (gender == 1 ? 100 : 0) + (rr >= 0 ? job : 1)
				}
				break
			case 11: //assassin/ninja
				if (cmodel != 11012) {
					cmodel = 10101 + ((rr >= 0 ? rr : race) * 200) + (gender == 1 ? 100 : 0) + (rr >= 0 ? job : 4)
				}
				break
			case 12: //glaiver/valkyrie
				if (cmodel != 10813) {
					cmodel = 10101 + ((rr >= 0 ? rr : race) * 200) + (gender == 1 ? 100 : 0) + (rr >= 0 ? job : 2)
				} 
				break
		}
		return cmodel
	}

	function EmulateExternalChange() {
		dispatch.toClient('S_USER_EXTERNAL_CHANGE', 6, Object.assign({}, userinfo.costumes))
	}

	function ChangeAppearance(index, marrow){
		let fix = 0,
			e = {}
		if (index >= 0) {
			let currpreset = customApp.presets[index]
			fix = fixModel(currpreset.race, -1, currpreset.gender, userinfo.real.class)
			e = {
				serverId: game.me.serverId,
				playerId: game.me.playerId,
				gameId: game.me.gameId,
				type: 0,
				unk1: marrow,
				unk2: true,
				templateId: fix,
				appearance: currpreset.appearance,
				appearance2: 100,	
				details: Buffer.from(currpreset.details, 'hex'),
				shape: userinfo.real.shape
			}
			Object.assign(e, userinfo.costumes)
			Object.assign(userinfo.fake, {
				race: currpreset.race,
				gender: currpreset.gender,
				class: (fix - 10101) % 100,
				appearance: currpreset.appearance,
				details: Buffer.from(currpreset.details, 'hex')
			})
			dispatch.toClient('S_UNICAST_TRANSFORM_DATA', 3, e)
		} else {
			fix = fixModel(userinfo.real.race, -1, userinfo.real.gender, userinfo.real.class)
			e = {
				serverId: game.me.serverId,
				playerId: game.me.playerId,
				gameId: game.me.gameId,
				type: 0,
				unk1: marrow,
				unk2: true,
				templateId: fix,
				appearance: userinfo.real.appearance,
				appearance2: 100,	
				details: userinfo.real.details,
				shape: userinfo.real.shape
			}
			Object.assign(e, userinfo.costumes)
			Object.assign(userinfo.fake, {
				race: userinfo.real.race,
				gender: userinfo.real.gender,
				class: userinfo.real.class,
				appearance: userinfo.real.appearance,
				details: userinfo.real.details
			})
			dispatch.toClient('S_UNICAST_TRANSFORM_DATA', 3, e)
		} 
	}

	// ################ //
	// ### Commands ### //
	// ################ //

	command.add('surgeon', (param, num1, num2) => {
		switch (param) {
		case 'load':
			let presetId = (num1 == null ? 0 : parseInt(num1, 10));
			if(presetId >= 1){
				if (presetId > customApp.presets.length) {
					command.message('Invalid Preset. Does not exist.');
					break;
				}
				customApp.characters[game.me.name] = presetId;
				EmulateExternalChange();
				saveCustom();
				command.message('Using preset '+presetId);
			} else {
				customApp.characters[game.me.name] = 0;
				ChangeAppearance(customApp.characters[game.me.name] - 1, marrow);
				EmulateExternalChange();
				saveCustom();
				command.message('Appearance reverted.');
			}
			break;
		case 'race': newpreset = false; SurgeonRoom(1, 168011); break;
		case 'gender': newpreset = false; SurgeonRoom(2, 168012); break;
		case 'face': newpreset = false; SurgeonRoom(3, 168013); break;
		case 'new':
			newpreset = true;
			switch (num1) {
				case 'race': SurgeonRoom(1, 168011); break;
				case 'gender': SurgeonRoom(2, 168012); break;
				case 'face': SurgeonRoom(3, 168013); break;
			}
			break;
		case 'monster': 
			switch (num1) {
			case 'off': 
				customApp.monsters[game.me.name] = false
				ChangeAppearance(customApp.characters[game.me.name] - 1, marrow);
				saveCustom();
				command.message('Monster mode disabled. Please relog to revert to the real templateId.')
				break;
			default:
				let raceId = (num1 == null ? 0 : Math.min(Math.max(parseInt(num1, 10), 0), 5))
				let genderId = (num2 == null ? 0 : Math.min(Math.max(parseInt(num2, 10), 0), 1))
				customApp.monsters[game.me.name] = {  race: raceId, gender: genderId }
				EmulateExternalChange()
				saveCustom();
				command.message('Monster mode enabled. (race '+raceId+' gender '+genderId+') Please relog to '
				+' apply the race and gender to the templateId.');
			}
			break;
		default:
			command.message('Commands:');
			command.message('<font color="#4682b4">"surgeon load [x]"</font> - load your saved preset slot x, 0 - revert to original.');
			command.message('<font color="#4682b4">"surgeon race"</font> - Emulates a race change. <font color="#fc7676">[1]</font>');
			command.message('<font color="#4682b4">"surgeon gender"</font> - Emulates a gender change. <font color="#fc7676">[1]</font>');
			command.message('<font color="#4682b4">"surgeon face"</font> - Emulates an appearance change; edits current preset, '
			+'or creates new preset if used with your original appearance.');
			command.message('<font color="#4682b4">"surgeon new race"</font> - Does the same as "surgeon race"; creates new preset.');
			command.message('<font color="#4682b4">"surgeon new gender"</font> - Does the same as "surgeon gender"; creates new preset.');
			command.message('<font color="#4682b4">"surgeon new face"</font> - Does the same as "surgeon face"; creates new preset.');
			command.message('<font color="#4682b4">"surgeon monster [race] [gender]"</font> - Upon relog, game tries to treat your '
			+'original templateId as specified race and gender if applicable; '
			+'Allows your character to wear costumes of current templateId. <font color="#fc7676">[2]</font>');
			command.message('<font color="#4682b4">"surgeon monster off"</font> - Disable monster mode.');
			command.message('<font color="#fc7676">[1] Will cause desyncs unless racial skill animation is almost identical. '
			+'Race/Gender inappropriate to the original class will cause T-poses, desyncs and unexpected glitches. </font>');
			command.message('<font color="#fc7676">[2] Use with Arborean Apparel\'s race/gender(soon) change.</font>');
		}
	});

	function saveCustom() {
		fs.writeFileSync(path.join(__dirname, 'presets.json'), JSON.stringify(customApp, null, '\t'));
	}
}