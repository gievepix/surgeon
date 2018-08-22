const path = require('path'),
	fs = require('fs');

module.exports = function Surgeon(mod) {

	let userinfo = { real: {}, fake: {}, costumes: {} },
		OnLogin = false,
		inSurgeonRoom = 0, //-1 Leaving before lobby, 0 Not emulated, 1 Entering Lobby, 2 On Lobby
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
		} catch(e) { customApp = {version: 2, characters: {}, presets: []}; }
	}

	function UpdatePresets() {
		if (!customApp.version) customApp.version = 1	// initialize the preset version to 1 if it does not exist
		if (customApp.version < 2) {
			customApp.version = 2
			for (let c in customApp.characters) {
				let pid = customApp.characters[c]
				customApp.characters[c] = {id: pid, lock: false, costumes:false}
			}
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
		}
		saveCustom();
	}

	// ############# //
	// ### Hooks ### //
	// ############# //

	mod.hook('S_LOGIN', 10, event => {
		OnLogin = false; inSurgeonRoom = 0; newpreset = false; marrow = false;
		userinfo = { real: {}, fake: {}, costumes: {} };
		Object.assign(userinfo.real, {
			playerId: mod.game.me.playerId,
			name: mod.game.me.name,
			race: Math.floor((mod.game.me.templateId - 10101) / 200),
			gender: Math.floor((mod.game.me.templateId - 10101) / 100) % 2,
			class: (mod.game.me.templateId % 100) - 1,
			appearance: event.appearance,
			details: event.details,
			shape: event.shape
		});
		Object.assign(userinfo.fake, userinfo.real);
	});
	
	mod.hook('S_LOAD_CLIENT_USER_SETTING', 'raw', { order: 1000}, () => {
		if (!OnLogin) {
			process.nextTick(() => {
				OnLogin = true;
				if (customApp.characters[mod.game.me.name].id) mod.command.message('Using preset '+customApp.characters[mod.game.me.name].id);
				if (customApp.characters[mod.game.me.name].lock) mod.command.message('Race/Gender change locked');
				if (customApp.characters[mod.game.me.name].costumes) mod.command.message('Costumes applied on preset');
			})
		}
 	});

	mod.hook('S_USER_EXTERNAL_CHANGE', 6, { order: 999, filter: { fake: null }}, (event) => {
		if (mod.game.me.is(event.gameId)) {
			Object.assign(userinfo.costumes, event)
			if (customApp.characters[mod.game.me.name].id) {
				ChangeAppearance(customApp.characters[mod.game.me.name].id - 1, marrow);
				if (!customApp.characters[mod.game.me.name].costumes) return false;
			}
		}
 	});

	mod.hook('S_UNICAST_TRANSFORM_DATA', 3, { order: -1 }, event => {
		if(mod.game.me.is(event.gameId) && customApp.characters[mod.game.me.name].id){
			marrow = (event.unk1 ? true : false)
			userinfo.fake.shape = event.shape
			EmulateExternalChange();
			return false
		}
 	});

	mod.hook('S_GET_USER_LIST', 14, { order: -1 }, (event) => {
        for (let indexx in event.characters) {
			let charname = event.characters[indexx].name
			checkMeincustomApp(charname)
			if(customApp.characters[charname].id){
				let currpreset = customApp.presets[customApp.characters[charname].id - 1];
				let fix = fixModel(event.characters[indexx], currpreset, customApp.characters[charname].lock);
				event.characters[indexx].race = Math.floor((fix - 10101) / 200)
				event.characters[indexx].gender = Math.floor((fix - 10101) / 100) % 2
				event.characters[indexx].class = (fix - 10101) % 100
				event.characters[indexx].appearance = currpreset.appearance
				event.characters[indexx].details = Buffer.from(currpreset.details, 'hex')
			}
		}
		return true
    });

	mod.hook('C_CANCEL_CHANGE_USER_APPEARANCE', 1, event => {
		if (inSurgeonRoom) {
			mod.send('S_END_CHANGE_USER_APPEARANCE', 1, {
				ok: 0,
				unk: 0
			});
			if (inSurgeonRoom == 2) { mod.send('C_SELECT_USER', 1, { id: charId, unk: 0 });	inSurgeonRoom = 0 }// 2nd part of ugliness 
			else inSurgeonRoom = -1
			return false;
		}
	});

	mod.hook('C_COMMIT_CHANGE_USER_APPEARANCE', 1, event => {
		if (inSurgeonRoom) {
			mod.send('S_END_CHANGE_USER_APPEARANCE', 1, {
				ok: 1,
				unk: 0
			});
			if (newpreset || !customApp.characters[userinfo.real.name].id) {
				newpreset = false;
				customApp.presets.push({
					race: event.race,
					gender: event.gender,
					appearance: event.appearance,
					details: event.details.toString('hex')
				});
				customApp.characters[userinfo.real.name].id = customApp.presets.length;
			} else {
				customApp.presets[customApp.characters[userinfo.real.name].id - 1].race = event.race;
				customApp.presets[customApp.characters[userinfo.real.name].id - 1].gender = event.gender;
				customApp.presets[customApp.characters[userinfo.real.name].id - 1].appearance = event.appearance;
				customApp.presets[customApp.characters[userinfo.real.name].id - 1].details = event.details.toString('hex');
			}
			saveCustom();
			if (inSurgeonRoom == 2) { mod.send('C_SELECT_USER', 1, { id: charId, unk: 0 });	inSurgeonRoom = 0 }// same as above
			else inSurgeonRoom = -1
			return false;
		}
	});

	// ################# //
	// ### Functions ### //
	// ################# //

	function SurgeonRoom(room, itemid) {
		if (room == 2 && (userinfo.fake.race == 4 || userinfo.fake.race == 5)) {
			mod.command.message('Popori, Elin and Baraka are ineligible for gender change');
			return;
		}
		
		mod.send('C_RETURN_TO_LOBBY', 1, {});
		let prepareLobbyHook = mod.hookOnce('S_PREPARE_RETURN_TO_LOBBY', 1, () => {
			inSurgeonRoom = 1;
			mod.send('S_START_CHANGE_USER_APPEARANCE', 2, {
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
				details2: userinfo.fake.shape
			})

			userListHook = mod.hook('*', 'raw', { order: 999, filter: { incoming: true }}, () => {
				return false;
			});
			
			// to prevent unpredictable behavior if you try to leave room before server sends you character list
			// (looks ugly af, but i have no any idea how to implement this in a different way)
			// actually, it doesn't make much sense because it takes half of this time to load the room (maybe it'll be faster on ssd)
			mod.hookOnce('S_GET_USER_LIST', 14, { order: -999 }, event => {
				mod.unhook(userListHook);
				event.characters.forEach(character => {
					if (character.name === userinfo.real.name) charId = character.id;
				});
				
				if (inSurgeonRoom == -1) { mod.send('C_SELECT_USER', 1, { id: charId, unk: 0 }); inSurgeonRoom = 0 }
				else inSurgeonRoom = 2
				return false;
			});

			setTimeout(() => {
				if (userListHook) mod.unhook(userListHook);
			}, 10000);
		});
		
		setTimeout(() => {
			if (prepareLobbyHook) mod.unhook(prepareLobbyHook);
		}, 5000);
	}
	
	function checkMeincustomApp(p) {
		if (customApp.characters[p] == null) customApp.characters[p] = { id : 0, lock: false, costumes: false }
		if (customApp.characters[p].id > customApp.presets.length) customApp.characters[p].id = 0
	}

	function fixModel(real, fake, lock) {
		let rrg = (real.class * 200) + (real.gender == 1 ? 100 : 0);
		let frg = (lock ? rrg : (fake.race * 200) + (fake.gender == 1 ? 100 : 0));
		let cmodel = 10101 + (lock ? rrg : frg) + real.class;
		switch (real.class) {
		// 101xx/102xx Human, 103xx/104xx High Elf, 105xx/106xx Aman, 107xx/108xx Castanic, 109xx/110xx Popori/Elin, 111xx Baraka
		// 0 warrior, 1 lancer, 2 slayer, 3 berserker, 4 sorcerer, 5 archer, 6 priest, 7 elementalist/mystic
			case 8: //soulless/reaper
				if (![11009].includes(cmodel)) cmodel = 10101 + (lock ? rrg : frg) + (lock ? real.class : 0);
				break;
			case 9: //engineer/gunner
				if (![10410,10810,11010].includes(cmodel)) cmodel = 10101 + (lock ? rrg : frg) + (lock ? real.class : 5);
				break;
			case 10: //fighter/brawler
				if (![10111,10211,11011].includes(cmodel)) cmodel = 10101 + (lock ? rrg : frg) + (lock ? real.class : 1);
				break;
			case 11: //assassin/ninja
				if (![11012].includes(cmodel)) cmodel = 10101 + (lock ? rrg : frg) + (lock ? real.class : 4);
				break;
			case 12: //glaiver/valkyrie
				if (![10813].includes(cmodel)) cmodel = 10101 + (lock ? rrg : frg) + (lock ? real.class : 2);
				break;
		}
		return cmodel
	}

	function EmulateExternalChange() {
		mod.send('S_USER_EXTERNAL_CHANGE', 6, Object.assign({}, userinfo.costumes))
	}

	function ChangeAppearance(index, marrow){
		let currpreset = (index >= 0 ? customApp.presets[index] : userinfo.real);
		let fix = fixModel(userinfo.real, currpreset, customApp.characters[mod.game.me.name].lock);
		let e = {
			serverId: mod.game.me.serverId,
			playerId: mod.game.me.playerId,
			gameId: mod.game.me.gameId,
			type: 0,
			unk1: marrow,
			unk2: true,
			templateId: fix,
			appearance: currpreset.appearance,
			appearance2: 100,	
			details: (index >= 0 ? Buffer.from(currpreset.details, 'hex') : userinfo.real.details),
			shape: (index >= 0 ? userinfo.fake.shape : userinfo.real.shape)
		}
		Object.assign(e, userinfo.costumes)
		Object.assign(userinfo.fake, {
			race: currpreset.race,
			gender: currpreset.gender,
			class: (fix - 10101) % 100,
			appearance: currpreset.appearance,
			details: (index >= 0 ? Buffer.from(currpreset.details, 'hex') : userinfo.real.details)
		})
		mod.send('S_UNICAST_TRANSFORM_DATA', 3, e)
	}

	// ################ //
	// ### commands ### //
	// ################ //

	mod.command.add('surgeon', (param, num1, num2, num3) => {
		switch (param) {
		case 'load':
			let presetId = (num1 == null ? 0 : parseInt(num1, 10));
			if(presetId >= 1){
				if (presetId > customApp.presets.length) {
					mod.command.message('Invalid Preset. Does not exist.');
					break;
				}
				customApp.characters[mod.game.me.name].id = presetId;
				EmulateExternalChange();
				saveCustom();
				mod.command.message('Using preset '+presetId);
			} else {
				customApp.characters[mod.game.me.name].id = 0;
				ChangeAppearance(customApp.characters[mod.game.me.name].id - 1, marrow);
				EmulateExternalChange();
				saveCustom();
				mod.command.message('Appearance reverted.');
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
		case 'lock':
			customApp.characters[mod.game.me.name].lock = !customApp.characters[mod.game.me.name].lock;
			EmulateExternalChange();
			saveCustom();
			mod.command.message('Race/Gender change '+(customApp.characters[mod.game.me.name].lock ? '' : 'un')+'locked');
			break;
		case 'costumes': 
			customApp.characters[mod.game.me.name].costumes = !customApp.characters[mod.game.me.name].costumes;
			EmulateExternalChange();
			saveCustom();
			mod.command.message('Costumes '+(customApp.characters[mod.game.me.name].costumes ? '' : 'un')+'applied on preset');
			break;
		default:
			mod.command.message('commands:');
			mod.command.message('<font color="#4682b4">"surgeon load [x]"</font> - load your saved preset slot x, 0 - revert to original.');
			mod.command.message('<font color="#4682b4">"surgeon lock"</font> - Toggles whether or not your race and gender should be changed when using presets.');
			mod.command.message('<font color="#4682b4">"surgeon costumes"</font> - Toggles whether or not your costumes should be applied on your preset.');
			mod.command.message('<font color="#4682b4">"surgeon race"</font> - Emulates a race change. <font color="#fc7676">[1]</font>');
			mod.command.message('<font color="#4682b4">"surgeon gender"</font> - Emulates a gender change. <font color="#fc7676">[1]</font>');
			mod.command.message('<font color="#4682b4">"surgeon face"</font> - Emulates an appearance change; edits current preset, '
			+'or creates new preset if used with your original appearance.');
			mod.command.message('<font color="#4682b4">"surgeon new race"</font> - Does the same as "surgeon race"; creates new preset.');
			mod.command.message('<font color="#4682b4">"surgeon new gender"</font> - Does the same as "surgeon gender"; creates new preset.');
			mod.command.message('<font color="#4682b4">"surgeon new face"</font> - Does the same as "surgeon face"; creates new preset.');
			mod.command.message('<font color="#fc7676">[1] Will cause desyncs unless racial skill animation is almost identical. '
			+'Race/Gender inappropriate to the class will cause T-poses and desyncs. Use the lock command to prevent these.</font>');
		}
	});

	function saveCustom() {
		fs.writeFileSync(path.join(__dirname, 'presets.json'), JSON.stringify(customApp, null, '\t'));
	}
}